import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildHiveLoreCommentOperation } from '../lib/hive/operations.js';
import type { HafOperationRow } from '../lib/hive/types.js';
import { HafSyncService, type HafSyncDatabase } from './haf-sync.js';

const operation = buildHiveLoreCommentOperation({
  author: 'emberquill.dev',
  permlink: 'canon-lore',
  title: 'Canon Lore',
  body: 'A verified entry.',
  kind: 'canon_lore',
  entityType: 'LORE_ENTRY',
  entityId: 'lore-1',
});

describe('HAF sync service', () => {
  test('projects new rows and advances the durable hash checkpoint', async () => {
    const store = createIndexerStore({
      lastProcessedBlock: 100n,
      lastProcessedBlockHash: 'block-100-a',
      lastProcessedOperationIndex: 1,
    });
    const service = new HafSyncService(
      createHafClient([
        row({ block: 100, blockHash: 'block-100-a', operationIndex: 1, transactionId: 'skip-me' }),
        row({
          block: 100,
          blockHash: 'block-100-a',
          operationIndex: 2,
          transactionId: 'project-me',
        }),
      ]),
      store.database,
      {
        startBlock: 100,
        maxBlocksPerRun: 10,
      },
    );

    const result = await service.runOnce(new Date('2026-07-30T09:00:00.000Z'));

    assert.equal(result.projectedOperations, 1);
    assert.equal(result.rolledBackEvents, 0);
    assert.equal(store.events.size, 1);
    assert.deepEqual(store.watermark, {
      lastProcessedBlock: 100n,
      lastProcessedBlockHash: 'block-100-a',
      lastProcessedOperationIndex: 2,
    });
  });

  test('replays safely when a crash happens after projection but before checkpoint', async () => {
    const store = createIndexerStore({
      lastProcessedBlock: 100n,
      lastProcessedBlockHash: 'block-100-a',
      lastProcessedOperationIndex: 1,
    });
    const duplicate = row({
      block: 100,
      blockHash: 'block-100-a',
      operationIndex: 2,
      transactionId: 'project-me',
    });
    await store.database.hiveEvent.upsert({
      where: {
        transactionId_operationIndex: {
          operationIndex: 2,
          transactionId: 'project-me',
        },
      },
      create: {
        blockHash: 'block-100-a',
        blockNumber: 100n,
        blockchainTimestamp: new Date('2026-07-30T08:02:00.000Z'),
        eventType: 'COMMENT',
        operationIndex: 2,
        payload: operation,
        previousBlockHash: 'block-99-a',
        transactionId: 'project-me',
      },
      update: {
        blockHash: 'block-100-a',
        blockNumber: 100n,
        blockchainTimestamp: new Date('2026-07-30T08:02:00.000Z'),
        eventType: 'COMMENT',
        payload: operation,
        previousBlockHash: 'block-99-a',
      },
    });
    const service = new HafSyncService(createHafClient([duplicate]), store.database, {
      startBlock: 100,
      maxBlocksPerRun: 10,
    });

    const result = await service.runOnce(new Date('2026-07-30T09:00:00.000Z'));

    assert.equal(result.projectedOperations, 1);
    assert.equal(store.events.size, 1);
    assert.equal(store.upsertsByKey.get('project-me:2'), 2);
    assert.deepEqual(store.watermark, {
      lastProcessedBlock: 100n,
      lastProcessedBlockHash: 'block-100-a',
      lastProcessedOperationIndex: 2,
    });
  });

  test('rewinds and converges when the stored head block hash changes', async () => {
    const store = createIndexerStore({
      lastProcessedBlock: 100n,
      lastProcessedBlockHash: 'block-100-old',
      lastProcessedOperationIndex: 0,
    });
    store.events.set('old-tx:0', {
      blockNumber: 100n,
      operationIndex: 0,
      transactionId: 'old-tx',
    });
    const service = new HafSyncService(
      createHafClient([
        row({
          block: 100,
          blockHash: 'block-100-new',
          operationIndex: 0,
          transactionId: 'new-tx',
        }),
      ]),
      store.database,
      {
        startBlock: 100,
        maxBlocksPerRun: 10,
      },
    );

    const result = await service.runOnce(new Date('2026-07-30T09:00:00.000Z'));

    assert.equal(result.rolledBackEvents, 1);
    assert.equal(result.projectedOperations, 1);
    assert.equal(store.events.has('old-tx:0'), false);
    assert.equal(store.events.has('new-tx:0'), true);
    assert.deepEqual(store.watermark, {
      lastProcessedBlock: 100n,
      lastProcessedBlockHash: 'block-100-new',
      lastProcessedOperationIndex: 0,
    });
  });

  test('rewinds from an explicit replay block before rebuilding projections', async () => {
    const store = createIndexerStore({
      lastProcessedBlock: 105n,
      lastProcessedBlockHash: 'block-105-a',
      lastProcessedOperationIndex: 0,
    });
    store.events.set('kept:0', {
      blockNumber: 99n,
      operationIndex: 0,
      transactionId: 'kept',
    });
    store.events.set('deleted:0', {
      blockNumber: 100n,
      operationIndex: 0,
      transactionId: 'deleted',
    });
    const service = new HafSyncService(
      createHafClient([
        row({
          block: 100,
          blockHash: 'block-100-a',
          operationIndex: 0,
          transactionId: 'rebuilt',
        }),
      ]),
      store.database,
      {
        startBlock: 99,
        maxBlocksPerRun: 10,
      },
    );

    const result = await service.replayFromBlock(100, new Date('2026-07-30T09:00:00.000Z'));

    assert.equal(result.replayedFromBlock, 100);
    assert.equal(result.rolledBackEvents, 1);
    assert.equal(result.projectedOperations, 1);
    assert.equal(store.events.has('kept:0'), true);
    assert.equal(store.events.has('deleted:0'), false);
    assert.equal(store.events.has('rebuilt:0'), true);
  });
});

function createHafClient(rows: HafOperationRow[]) {
  return {
    async getHeadBlock() {
      return 105;
    },
    async searchBlocks() {
      return {
        operations: rows,
        page: 1,
        totalPages: 1,
      };
    },
  };
}

function createIndexerStore(watermark: {
  lastProcessedBlock: bigint;
  lastProcessedOperationIndex: number;
  lastProcessedBlockHash: string | null;
}) {
  const events = new Map<
    string,
    {
      blockNumber: bigint;
      transactionId: string;
      operationIndex: number;
    }
  >();
  const upsertsByKey = new Map<string, number>();
  const store = {
    events,
    upsertsByKey,
    watermark: { ...watermark },
  };
  const database: HafSyncDatabase = {
    hiveEvent: {
      async deleteMany(args) {
        let count = 0;

        for (const [key, event] of events) {
          if (event.blockNumber >= args.where.blockNumber.gte) {
            events.delete(key);
            count += 1;
          }
        }

        return { count };
      },
      async upsert(args) {
        const key = `${args.where.transactionId_operationIndex.transactionId}:${args.where.transactionId_operationIndex.operationIndex}`;

        upsertsByKey.set(key, (upsertsByKey.get(key) ?? 0) + 1);
        events.set(key, {
          blockNumber: args.create.blockNumber,
          operationIndex: args.create.operationIndex,
          transactionId: args.create.transactionId,
        });
      },
    },
    indexerWatermark: {
      async findUnique() {
        return store.watermark;
      },
      async upsert(args) {
        store.watermark = {
          lastProcessedBlock:
            args.update.lastProcessedBlock ??
            store.watermark.lastProcessedBlock ??
            args.create.lastProcessedBlock,
          lastProcessedBlockHash:
            args.update.lastProcessedBlockHash === undefined
              ? (store.watermark.lastProcessedBlockHash ??
                args.create.lastProcessedBlockHash ??
                null)
              : args.update.lastProcessedBlockHash,
          lastProcessedOperationIndex:
            args.update.lastProcessedOperationIndex ??
            store.watermark.lastProcessedOperationIndex ??
            args.create.lastProcessedOperationIndex,
        };
      },
    },
  };

  return {
    database,
    events,
    upsertsByKey,
    get watermark() {
      return store.watermark;
    },
  };
}

function row(input: {
  block: number;
  blockHash: string;
  operationIndex: number;
  transactionId: string;
}): HafOperationRow {
  return {
    block: input.block,
    blockHash: input.blockHash,
    op: {
      type: 'comment_operation',
      value: operation.comment_operation,
    },
    op_pos: input.operationIndex,
    previousBlockHash: `block-${input.block - 1}-a`,
    timestamp: '2026-07-30T08:00:00.000Z',
    trx_id: input.transactionId,
  };
}
