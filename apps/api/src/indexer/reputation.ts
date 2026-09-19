export const REPUTATION_CALCULATION_VERSION = 'hivelore-reputation-v1';

export const REPUTATION_SCORING = {
  canonizedContribution: 25,
  approvedProposal: 10,
  highApprovalRatio: 5,
  repeatedRejectedSpam: -10,
  worldReachesTenCanonEntries: 20,
  highContributorRetention: 15,
  clearWorldBible: 10,
  resolvedReport: 5,
  helpfulReviewAccepted: 3,
  abusiveModeration: -20,
  helpfulComment: 2,
  accurateFlag: 3,
  voteBrigadingOrSpam: -15,
} as const;

export interface ReputationSignals {
  canonizedContributions: number;
  approvedProposals: number;
  highApprovalRatioProposals: number;
  repeatedRejectedSpamEvents: number;
  worldsReachingTenCanonEntries: number;
  highContributorRetentionWorlds: number;
  clearWorldBibles: number;
  resolvedReports: number;
  helpfulAcceptedReviews: number;
  abusiveModerationEvents: number;
  helpfulComments: number;
  accurateFlags: number;
  voteBrigadingOrSpamEvents: number;
}

export interface ReputationBreakdown {
  calculationVersion: typeof REPUTATION_CALCULATION_VERSION;
  signals: ReputationSignals;
  components: Record<keyof ReputationSignals, number>;
}

export interface ReputationDatabase {
  loreEntry: {
    count(args: unknown): Promise<number>;
  };
  proposal: {
    count(args: unknown): Promise<number>;
    findMany(args: unknown): Promise<
      {
        id: string;
        votes: { choice: 'APPROVE' | 'REJECT' | 'ABSTAIN' }[];
      }[]
    >;
  };
  moderationReport: {
    count(args: unknown): Promise<number>;
  };
  userReputationSnapshot: {
    create(args: {
      data: {
        userId: string;
        score: number;
        calculationVersion: string;
        breakdown: ReputationBreakdown;
      };
    }): Promise<unknown>;
  };
}

export function emptyReputationSignals(): ReputationSignals {
  return {
    canonizedContributions: 0,
    approvedProposals: 0,
    highApprovalRatioProposals: 0,
    repeatedRejectedSpamEvents: 0,
    worldsReachingTenCanonEntries: 0,
    highContributorRetentionWorlds: 0,
    clearWorldBibles: 0,
    resolvedReports: 0,
    helpfulAcceptedReviews: 0,
    abusiveModerationEvents: 0,
    helpfulComments: 0,
    accurateFlags: 0,
    voteBrigadingOrSpamEvents: 0,
  };
}

export function calculateReputation(signals: ReputationSignals): {
  score: number;
  breakdown: ReputationBreakdown;
} {
  const components: ReputationBreakdown['components'] = {
    canonizedContributions: scoreComponent(
      signals.canonizedContributions,
      REPUTATION_SCORING.canonizedContribution,
    ),
    approvedProposals: scoreComponent(
      signals.approvedProposals,
      REPUTATION_SCORING.approvedProposal,
    ),
    highApprovalRatioProposals: scoreComponent(
      signals.highApprovalRatioProposals,
      REPUTATION_SCORING.highApprovalRatio,
    ),
    repeatedRejectedSpamEvents: scoreComponent(
      signals.repeatedRejectedSpamEvents,
      REPUTATION_SCORING.repeatedRejectedSpam,
    ),
    worldsReachingTenCanonEntries: scoreComponent(
      signals.worldsReachingTenCanonEntries,
      REPUTATION_SCORING.worldReachesTenCanonEntries,
    ),
    highContributorRetentionWorlds: scoreComponent(
      signals.highContributorRetentionWorlds,
      REPUTATION_SCORING.highContributorRetention,
    ),
    clearWorldBibles: scoreComponent(signals.clearWorldBibles, REPUTATION_SCORING.clearWorldBible),
    resolvedReports: scoreComponent(signals.resolvedReports, REPUTATION_SCORING.resolvedReport),
    helpfulAcceptedReviews: scoreComponent(
      signals.helpfulAcceptedReviews,
      REPUTATION_SCORING.helpfulReviewAccepted,
    ),
    abusiveModerationEvents: scoreComponent(
      signals.abusiveModerationEvents,
      REPUTATION_SCORING.abusiveModeration,
    ),
    helpfulComments: scoreComponent(signals.helpfulComments, REPUTATION_SCORING.helpfulComment),
    accurateFlags: scoreComponent(signals.accurateFlags, REPUTATION_SCORING.accurateFlag),
    voteBrigadingOrSpamEvents: scoreComponent(
      signals.voteBrigadingOrSpamEvents,
      REPUTATION_SCORING.voteBrigadingOrSpam,
    ),
  };

  return {
    score: Object.values(components).reduce((total, value) => total + value, 0),
    breakdown: {
      calculationVersion: REPUTATION_CALCULATION_VERSION,
      signals,
      components,
    },
  };
}

function scoreComponent(count: number, weight: number): number {
  const score = count * weight;

  return Object.is(score, -0) ? 0 : score;
}

export async function collectReputationSignals(
  database: ReputationDatabase,
  userId: string,
): Promise<ReputationSignals> {
  const approvedStatuses = ['APPROVED_FOR_PUBLICATION', 'PUBLISHED'];
  const signals = emptyReputationSignals();

  const [canonizedContributions, approvedProposals, resolvedReports, rejectedSpam] =
    await Promise.all([
      database.loreEntry.count({
        where: {
          authorId: userId,
          status: 'PUBLISHED_CANON',
        },
      }),
      database.proposal.count({
        where: {
          authorId: userId,
          status: {
            in: approvedStatuses,
          },
        },
      }),
      database.moderationReport.count({
        where: {
          reviewerId: userId,
          status: 'RESOLVED',
        },
      }),
      database.moderationReport.count({
        where: {
          reporterId: userId,
          status: 'DISMISSED',
          reason: {
            contains: 'spam',
            mode: 'insensitive',
          },
        },
      }),
    ]);

  const votedProposals = await database.proposal.findMany({
    where: {
      authorId: userId,
      status: {
        in: approvedStatuses,
      },
    },
    select: {
      id: true,
      votes: {
        select: {
          choice: true,
        },
      },
    },
  });

  signals.canonizedContributions = canonizedContributions;
  signals.approvedProposals = approvedProposals;
  signals.resolvedReports = resolvedReports;
  signals.repeatedRejectedSpamEvents = rejectedSpam;
  signals.highApprovalRatioProposals = votedProposals.filter(hasHighApprovalRatio).length;

  return signals;
}

export async function refreshUserReputationSnapshot(
  database: ReputationDatabase,
  userId: string,
): Promise<{ score: number; breakdown: ReputationBreakdown }> {
  const signals = await collectReputationSignals(database, userId);
  const result = calculateReputation(signals);

  await database.userReputationSnapshot.create({
    data: {
      userId,
      score: result.score,
      calculationVersion: REPUTATION_CALCULATION_VERSION,
      breakdown: result.breakdown,
    },
  });

  return result;
}

function hasHighApprovalRatio(proposal: {
  votes: { choice: 'APPROVE' | 'REJECT' | 'ABSTAIN' }[];
}): boolean {
  const decisiveVotes = proposal.votes.filter((vote) => vote.choice !== 'ABSTAIN');

  if (decisiveVotes.length < 5) {
    return false;
  }

  const approvals = decisiveVotes.filter((vote) => vote.choice === 'APPROVE').length;

  return approvals / decisiveVotes.length >= 0.7;
}
