export const HIVELORE_REWARD_SPLIT = {
  authorPercent: 90,
  beneficiaryPercent: 10,
  platformPercent: 0,
} as const;

export interface RewardSummaryDatabase {
  rewardRecord: {
    groupBy(args: {
      by: ['assetSymbol'];
      where: {
        userId: string;
      };
      _sum: {
        amount: true;
      };
    }): Promise<{ assetSymbol: string; _sum: { amount: unknown } }[]>;
  };
  userRewardSummary: {
    upsert(args: {
      where: {
        userId_assetSymbol: {
          userId: string;
          assetSymbol: string;
        };
      };
      create: {
        userId: string;
        assetSymbol: string;
        totalAmount: string;
        lastCalculatedAt: Date;
      };
      update: {
        totalAmount: string;
        lastCalculatedAt: Date;
      };
    }): Promise<unknown>;
  };
}

export async function refreshUserRewardSummaries(
  database: RewardSummaryDatabase,
  userId: string,
  calculatedAt = new Date(),
): Promise<{ assetSymbol: string; totalAmount: string }[]> {
  const totals = await database.rewardRecord.groupBy({
    by: ['assetSymbol'],
    where: {
      userId,
    },
    _sum: {
      amount: true,
    },
  });

  const summaries = totals.map((total) => ({
    assetSymbol: total.assetSymbol,
    totalAmount: decimalLikeToString(total._sum.amount),
  }));

  await Promise.all(
    summaries.map((summary) =>
      database.userRewardSummary.upsert({
        where: {
          userId_assetSymbol: {
            userId,
            assetSymbol: summary.assetSymbol,
          },
        },
        create: {
          userId,
          assetSymbol: summary.assetSymbol,
          totalAmount: summary.totalAmount,
          lastCalculatedAt: calculatedAt,
        },
        update: {
          totalAmount: summary.totalAmount,
          lastCalculatedAt: calculatedAt,
        },
      }),
    ),
  );

  return summaries;
}

function decimalLikeToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '0';
  }

  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') {
    return value.toString();
  }

  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    return value.toString();
  }

  throw new Error('Reward summary amount could not be converted to a decimal string.');
}
