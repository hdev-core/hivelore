import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Fastify from 'fastify';

import { registerHealthRoute } from './health.js';
import { testDatabaseAdminUrl, withDisposablePrismaDatabase } from '../test/integration-db.js';

function createHealthDatabase(input: {
  failDatabase?: boolean;
  lastProcessedBlock?: bigint;
  lastProcessedOperationIndex?: number;
}) {
  return {
    async $queryRaw() {
      if (input.failDatabase) {
        throw new Error('database unavailable');
      }

      return [{ ok: 1 }];
    },
    indexerWatermark: {
      async findUnique() {
        return {
          lastProcessedBlock: input.lastProcessedBlock ?? 100n,
          lastProcessedOperationIndex: input.lastProcessedOperationIndex ?? 2,
          lastRunFinishedAt: new Date('2026-09-05T12:02:00.000Z'),
          lastRunStartedAt: new Date('2026-09-05T12:00:00.000Z'),
        };
      },
    },
  };
}

async function createApp(options: Parameters<typeof registerHealthRoute>[1]) {
  const app = Fastify();
  await registerHealthRoute(app, options);
  return app;
}

describe('health routes', () => {
  test('health is a lightweight liveness check', async () => {
    const app = await createApp({
      database: createHealthDatabase({ failDatabase: true }) as never,
      getHeadBlock: async () => {
        throw new Error('head lookup should not run');
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      service: 'hivelore-api',
      status: 'ok',
    });
    await app.close();
  });

  test('ready reports database connectivity and indexer lag', async () => {
    const app = await createApp({
      database: createHealthDatabase({
        lastProcessedBlock: 100n,
        lastProcessedOperationIndex: 3,
      }) as never,
      getHeadBlock: async () => 105,
      indexerLagThresholdBlocks: 10,
      indexerName: 'hivelore-haf',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'ok');
    assert.equal(response.json().checks.database.status, 'ok');
    assert.equal(response.json().checks.indexer.status, 'ok');
    assert.equal(response.json().checks.indexer.lagBlocks, 5);
    assert.equal(response.json().checks.indexer.lastProcessedOperationIndex, 3);
    await app.close();
  });

  test('ready returns degraded when dependencies fail or lag exceeds the threshold', async () => {
    const app = await createApp({
      database: createHealthDatabase({
        failDatabase: true,
        lastProcessedBlock: 50n,
      }) as never,
      getHeadBlock: async () => 105,
      indexerLagThresholdBlocks: 10,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    assert.equal(response.statusCode, 503);
    assert.equal(response.json().status, 'degraded');
    assert.equal(response.json().checks.database.status, 'degraded');
    assert.equal(response.json().checks.indexer.status, 'degraded');
    assert.equal(response.json().checks.indexer.lagBlocks, 55);
    await app.close();
  });

  test(
    'ready succeeds against a migrated PostgreSQL test database',
    { skip: !testDatabaseAdminUrl ? 'TEST_DATABASE_ADMIN_URL is not configured.' : false },
    async () => {
      await withDisposablePrismaDatabase('hivelore_health_ready', async (database) => {
        await database.indexerWatermark.create({
          data: {
            lastProcessedBlock: 90n,
            lastProcessedOperationIndex: 4,
            lastRunFinishedAt: new Date('2026-09-05T12:01:00.000Z'),
            lastRunStartedAt: new Date('2026-09-05T12:00:00.000Z'),
            name: 'hivelore-haf',
          },
        });

        const app = await createApp({
          database: database as never,
          getHeadBlock: async () => 100,
          indexerLagThresholdBlocks: 10,
          indexerName: 'hivelore-haf',
        });
        const response = await app.inject({
          method: 'GET',
          url: '/ready',
        });

        assert.equal(response.statusCode, 200, response.body);
        assert.equal(response.json().checks.database.status, 'ok');
        assert.equal(response.json().checks.indexer.lagBlocks, 10);
        await app.close();
      });
    },
  );
});
