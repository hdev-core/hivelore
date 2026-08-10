import { createHash } from 'node:crypto';

import { ProposalDecisionOutcome, VoteChoice } from '../generated/prisma/enums.js';

export const CANON_VOTING_RULES = {
  approvalThresholdBps: 7_000,
  minimumVotes: 5,
  payloadSchemaVersion: 1,
  rulesVersion: 'canon-voting-mvp-2026-08-10',
  votingWindowHours: 48,
} as const;

export type CanonVoteCounts = {
  approve: number;
  reject: number;
  needsRevision: number;
  alternateTimeline: number;
};

export type CanonTally = CanonVoteCounts & {
  approvalDenominator: number;
  approvalNumerator: number;
  approvalPercentageBps: number;
  totalVotes: number;
};

export type CanonVotingWindowState = 'BEFORE_END' | 'AT_OR_AFTER_END';

export function addVotingWindow(startedAt: Date) {
  return new Date(startedAt.getTime() + CANON_VOTING_RULES.votingWindowHours * 60 * 60 * 1_000);
}

export function getVotingWindowState(input: { now: Date; votingEndsAt: Date }) {
  return input.now.getTime() < input.votingEndsAt.getTime() ? 'BEFORE_END' : 'AT_OR_AFTER_END';
}

export function tallyCanonVotes(votes: Array<{ choice: VoteChoice }>): CanonTally {
  const counts: CanonVoteCounts = {
    alternateTimeline: 0,
    approve: 0,
    needsRevision: 0,
    reject: 0,
  };

  for (const vote of votes) {
    if (vote.choice === VoteChoice.APPROVE) {
      counts.approve += 1;
    } else if (vote.choice === VoteChoice.REJECT) {
      counts.reject += 1;
    } else if (vote.choice === VoteChoice.NEEDS_REVISION) {
      counts.needsRevision += 1;
    } else if (vote.choice === VoteChoice.ALTERNATE_TIMELINE) {
      counts.alternateTimeline += 1;
    }
  }

  const approvalDenominator = counts.approve + counts.reject;
  const approvalPercentageBps =
    approvalDenominator > 0 ? Math.floor((counts.approve * 10_000) / approvalDenominator) : 0;

  return {
    ...counts,
    approvalDenominator,
    approvalNumerator: counts.approve,
    approvalPercentageBps,
    totalVotes: counts.approve + counts.reject + counts.needsRevision + counts.alternateTimeline,
  };
}

export function decideCanonOutcome(input: {
  staleBaseAtDecision?: boolean;
  tally: CanonTally;
  votingEndsAt: Date;
  now: Date;
}) {
  if (getVotingWindowState(input) === 'BEFORE_END') {
    return null;
  }

  if (input.staleBaseAtDecision) {
    return ProposalDecisionOutcome.STALE_BASE_CONFLICT;
  }

  const passesApproval =
    input.tally.totalVotes >= CANON_VOTING_RULES.minimumVotes &&
    input.tally.approvalPercentageBps >= CANON_VOTING_RULES.approvalThresholdBps;

  if (passesApproval) {
    return ProposalDecisionOutcome.APPROVED_FOR_PUBLICATION;
  }

  const feedbackChoices = [
    {
      choice: ProposalDecisionOutcome.NEEDS_REVISION,
      count: input.tally.needsRevision,
      rank: 1,
    },
    {
      choice: ProposalDecisionOutcome.ALTERNATE_TIMELINE,
      count: input.tally.alternateTimeline,
      rank: 2,
    },
    {
      choice: ProposalDecisionOutcome.REJECTED,
      count: input.tally.reject,
      rank: 3,
    },
  ].sort((left, right) => right.count - left.count || left.rank - right.rank);

  if (feedbackChoices[0] && feedbackChoices[0].count > 0) {
    return feedbackChoices[0].choice;
  }

  return ProposalDecisionOutcome.REJECTED;
}

export function proposalStatusForDecision(outcome: ProposalDecisionOutcome) {
  if (outcome === ProposalDecisionOutcome.APPROVED_FOR_PUBLICATION) {
    return 'APPROVED_FOR_PUBLICATION' as const;
  }

  if (outcome === ProposalDecisionOutcome.ALTERNATE_TIMELINE) {
    return 'ALTERNATE_TIMELINE' as const;
  }

  if (
    outcome === ProposalDecisionOutcome.NEEDS_REVISION ||
    outcome === ProposalDecisionOutcome.STALE_BASE_CONFLICT
  ) {
    return 'NEEDS_REVISION' as const;
  }

  return 'REJECTED' as const;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function hashCanonicalJson(value: unknown) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}
