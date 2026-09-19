import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildHiveLoreCommentOperation } from '../lib/hive/operations.js';
import { HafSyncService, type HafSyncDatabase } from './haf-sync.js';

describe('HAF sync service', () => {
  test('projects new rows and advances the durable watermark', async () => {
    const projectedEvents: unknown[] = [];
    const watermarkUpdates: unknown[] = [];
    const operation = buildHiveLoreCommentOperation({
      author: 'emberquill.dev',
      permlink: 'canon-lore',
      title: 'Canon Lore',
      body: 'A verified entry.',
      kind: 'canon_lore',
      entityType: 'LORE_ENTRY',
      entityId: 'lore-1',
    });
    const database: HafSyncDatabase = {
      hiveEvent: {
        async upsert(args) {
          projectedEvents.push(args);
        },
      },
      indexerWatermark: {
        async findUnique() {
          return {
            lastProcessedBlock: 100n,
            lastProcessedOperationIndex: 1,
          };
        },
        async upsert(args) {
          watermarkUpdates.push(args);
        },
      },
    };
    const service = new HafSyncService(
      {
        async getHeadBlock() {
          return 105;
        },
        async searchBlocks() {
          return {
            operations: [
              {
                block: 100,
                trx_id: 'skip-me',
                op_pos: 1,
                timestamp: '2026-07-30T08:00:00.000Z',
                op: {
                  type: 'comment_operation',
                  value: operation.comment_operation,
                },
              },
              {
                block: 100,
                trx_id: 'project-me',
                op_pos: 2,
                timestamp: '2026-07-30T08:01:00.000Z',
                op: {
                  type: 'comment_operation',
                  value: operation.comment_operation,
                },
              },
            ],
            page: 1,
            totalPages: 1,
          };
        },
      },
      database,
      {
        startBlock: 100,
        maxBlocksPerRun: 10,
      },
    );

    const result = await service.runOnce(new Date('2026-07-30T09:00:00.000Z'));

    assert.equal(result.projectedOperations, 1);
    assert.equal(projectedEvents.length, 1);
    assert.equal(
      (
        watermarkUpdates.find(
          (update) =>
            typeof update === 'object' &&
            update !== null &&
            'update' in update &&
            (update.update as { lastProcessedOperationIndex?: number })
              .lastProcessedOperationIndex === 2,
        ) as { update: { lastProcessedBlock: bigint; lastProcessedOperationIndex: number } }
      ).update.lastProcessedBlock,
      100n,
    );
  });
});
