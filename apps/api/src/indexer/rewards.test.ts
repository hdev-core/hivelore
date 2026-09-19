import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { HIVELORE_REWARD_SPLIT, refreshUserRewardSummaries } from './rewards.js';

describe('reward aggregation', () => {
  test('documents the MVP 90/10/0 split constants', () => {
    assert.deepEqual(HIVELORE_REWARD_SPLIT, {
      authorPercent: 90,
      beneficiaryPercent: 10,
      platformPercent: 0,
    });
  });

  test('rebuilds user reward summaries from reward records', async () => {
    const upserts: unknown[] = [];
    const calculatedAt = new Date('2026-07-30T08:00:00.000Z');
    const summaries = await refreshUserRewardSummaries(
      {
        rewardRecord: {
          async groupBy() {
            return [
              { assetSymbol: 'HIVE', _sum: { amount: '12.500' } },
              { assetSymbol: 'HBD', _sum: { amount: 3 } },
            ];
          },
        },
        userRewardSummary: {
          async upsert(args) {
            upserts.push(args);
          },
        },
      },
      'user-1',
      calculatedAt,
    );

    assert.deepEqual(summaries, [
      { assetSymbol: 'HIVE', totalAmount: '12.500' },
      { assetSymbol: 'HBD', totalAmount: '3' },
    ]);
    assert.equal(upserts.length, 2);
    assert.deepEqual(upserts[0], {
      where: {
        userId_assetSymbol: {
          userId: 'user-1',
          assetSymbol: 'HIVE',
        },
      },
      create: {
        userId: 'user-1',
        assetSymbol: 'HIVE',
        totalAmount: '12.500',
        lastCalculatedAt: calculatedAt,
      },
      update: {
        totalAmount: '12.500',
        lastCalculatedAt: calculatedAt,
      },
    });
  });
});
