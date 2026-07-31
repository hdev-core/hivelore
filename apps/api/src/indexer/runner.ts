import { env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { createHafClient } from '../lib/hive/client.js';
import { prisma } from '../lib/prisma.js';
import { HafSyncService, type HafSyncDatabase } from './haf-sync.js';

const prismaWithIndexer = prisma as typeof prisma & {
  indexerWatermark: HafSyncDatabase['indexerWatermark'];
};

const database: HafSyncDatabase = {
  hiveEvent: {
    async upsert(args) {
      await prisma.hiveEvent.upsert({
        ...args,
        create: {
          ...args.create,
          payload: args.create.payload as Prisma.InputJsonValue,
        },
        update: {
          ...args.update,
          payload: args.update.payload as Prisma.InputJsonValue,
        },
      });
    },
  },
  indexerWatermark: {
    async findUnique(args) {
      return prismaWithIndexer.indexerWatermark.findUnique(args);
    },
    async upsert(args) {
      await prismaWithIndexer.indexerWatermark.upsert(args);
    },
  },
};

const syncService = new HafSyncService(createHafClient(), database, {
  name: env.INDEXER_NAME,
  startBlock: env.INDEXER_START_BLOCK,
  batchSize: env.INDEXER_BATCH_SIZE,
  maxBlocksPerRun: env.INDEXER_MAX_BLOCKS_PER_RUN,
});

try {
  const result = await syncService.runOnce();

  console.info('HAF indexer run completed', result);
} finally {
  await prisma.$disconnect();
}
