import type { FastifyInstance } from 'fastify';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

type HealthDatabase = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  indexerWatermark: {
    findUnique(args: {
      where: {
        name: string;
      };
      select: {
        lastProcessedBlock: true;
        lastProcessedOperationIndex: true;
        lastRunFinishedAt: true;
        lastRunStartedAt: true;
      };
    }): Promise<{
      lastProcessedBlock: bigint;
      lastProcessedOperationIndex: number;
      lastRunFinishedAt: Date | null;
      lastRunStartedAt: Date | null;
    } | null>;
  };
};

type RegisterHealthRouteOptions = {
  database?: HealthDatabase;
  getHeadBlock?: () => Promise<number>;
  indexerLagThresholdBlocks?: number;
  indexerName?: string;
};

type CheckStatus = 'ok' | 'degraded';

async function checkDatabase(database: HealthDatabase) {
  await database.$queryRaw`SELECT 1`;

  return {
    status: 'ok' as CheckStatus,
  };
}

async function checkIndexer(
  database: HealthDatabase,
  getHeadBlock: () => Promise<number>,
  input: {
    indexerLagThresholdBlocks: number;
    indexerName: string;
  },
) {
  const [headBlock, watermark] = await Promise.all([
    getHeadBlock(),
    database.indexerWatermark.findUnique({
      select: {
        lastProcessedBlock: true,
        lastProcessedOperationIndex: true,
        lastRunFinishedAt: true,
        lastRunStartedAt: true,
      },
      where: {
        name: input.indexerName,
      },
    }),
  ]);
  const lastProcessedBlock = Number(watermark?.lastProcessedBlock ?? 0n);
  const lagBlocks = Math.max(headBlock - lastProcessedBlock, 0);

  return {
    headBlock,
    lagBlocks,
    lastProcessedBlock,
    lastProcessedOperationIndex: watermark?.lastProcessedOperationIndex ?? -1,
    lastRunFinishedAt: watermark?.lastRunFinishedAt?.toISOString() ?? null,
    lastRunStartedAt: watermark?.lastRunStartedAt?.toISOString() ?? null,
    status: lagBlocks <= input.indexerLagThresholdBlocks ? ('ok' as CheckStatus) : 'degraded',
    thresholdBlocks: input.indexerLagThresholdBlocks,
  };
}

export async function registerHealthRoute(
  app: FastifyInstance,
  options: RegisterHealthRouteOptions = {},
) {
  const database = options.database ?? prisma;
  const getHeadBlock = options.getHeadBlock ?? (() => Promise.resolve(0));
  const indexerName = options.indexerName ?? env.INDEXER_NAME;
  const indexerLagThresholdBlocks =
    options.indexerLagThresholdBlocks ?? env.INDEXER_MAX_READY_LAG_BLOCKS;

  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'hivelore-api',
    };
  });

  app.get('/ready', async (_request, reply) => {
    const checks: {
      database?: Awaited<ReturnType<typeof checkDatabase>> | { status: 'degraded'; error: string };
      indexer?: Awaited<ReturnType<typeof checkIndexer>> | { status: 'degraded'; error: string };
    } = {};

    try {
      checks.database = await checkDatabase(database);
    } catch (error) {
      checks.database = {
        error: error instanceof Error ? error.message : 'Database readiness check failed.',
        status: 'degraded',
      };
    }

    try {
      checks.indexer = await checkIndexer(database, getHeadBlock, {
        indexerLagThresholdBlocks,
        indexerName,
      });
    } catch (error) {
      checks.indexer = {
        error: error instanceof Error ? error.message : 'Indexer readiness check failed.',
        status: 'degraded',
      };
    }

    const ready = Object.values(checks).every((check) => check?.status === 'ok');

    return reply.code(ready ? 200 : 503).send({
      checks,
      service: 'hivelore-api',
      status: ready ? 'ok' : 'degraded',
    });
  });
}
