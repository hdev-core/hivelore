import { apiClient } from '@/lib/api/client';

export type VoteChoice = 'APPROVE' | 'REJECT' | 'NEEDS_REVISION' | 'ALTERNATE_TIMELINE';

export type ProposalDecision = {
  aiWarningAcknowledged: boolean;
  aiWarningSummary: string | null;
  approvalDenominator: number;
  approvalNumerator: number;
  approvalPercentageBps: number;
  approveCount: number;
  alternateTimelineCount: number;
  blockchainTimestamp: string | null;
  blockNumber: string | null;
  contentHash: string;
  customJsonId: string | null;
  decidedAt: string;
  decisionPayloadHash: string;
  expectedSigner: string | null;
  hiveEventId: string | null;
  id: string;
  needsRevisionCount: number;
  operationIndex: number | null;
  outcome:
    | 'APPROVED_FOR_PUBLICATION'
    | 'REJECTED'
    | 'NEEDS_REVISION'
    | 'ALTERNATE_TIMELINE'
    | 'STALE_BASE_CONFLICT';
  rejectCount: number;
  totalVotes: number;
  transactionId: string | null;
};

export type ProposalDetail = {
  aiWarning: {
    acknowledged: boolean;
    summary: string | null;
  };
  author: {
    hiveUsername: string;
    id: string;
  };
  branchBaseLoreEntryId: string | null;
  branchLabel: string | null;
  branchParentProposalId: string | null;
  conflictMetadata: unknown;
  currentUserVote: {
    choice: VoteChoice;
    updatedAt: string;
  } | null;
  decision: ProposalDecision | null;
  id: string;
  proposedContent: unknown;
  proposalType: string;
  status: string;
  submittedAt: string | null;
  summary: string;
  tally: {
    alternateTimeline: number;
    approvalDenominator: number;
    approvalNumerator: number;
    approvalPercentageBps: number;
    approve: number;
    needsRevision: number;
    reject: number;
    totalVotes: number;
  };
  title: string;
  votingEndsAt: string | null;
  votingStartedAt: string | null;
  world: {
    id: string;
    title: string;
  };
  worldId: string;
};

export type CanonTransactionResponse = {
  customJsonId: string;
  decisionId: string;
  operation: unknown;
  signer: string;
};

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
  };
}

export function getProposal(worldId: string, proposalId: string, accessToken?: string) {
  return apiClient.get<{ proposal: ProposalDetail }>(
    `/worlds/${worldId}/proposals/${proposalId}`,
    accessToken
      ? {
          headers: authHeaders(accessToken),
        }
      : undefined,
  );
}

export function castProposalVote(input: {
  accessToken: string;
  choice: VoteChoice;
  proposalId: string;
  worldId: string;
}) {
  return apiClient.post(
    `/worlds/${input.worldId}/proposals/${input.proposalId}/votes`,
    { choice: input.choice },
    {
      headers: authHeaders(input.accessToken),
    },
  );
}

export function finalizeProposal(input: {
  accessToken: string;
  proposalId: string;
  worldId: string;
}) {
  return apiClient.post<{ decision: ProposalDecision; idempotent: boolean }>(
    `/worlds/${input.worldId}/proposals/${input.proposalId}/finalize`,
    {},
    {
      headers: authHeaders(input.accessToken),
    },
  );
}

export function createCanonTransaction(input: {
  accessToken: string;
  proposalId: string;
  worldId: string;
}) {
  return apiClient.post<CanonTransactionResponse>(
    `/worlds/${input.worldId}/proposals/${input.proposalId}/canon-transaction`,
    {},
    {
      headers: authHeaders(input.accessToken),
    },
  );
}

export function confirmCanonTransaction(input: {
  accessToken: string;
  blockNumber: number;
  operationIndex: number;
  proposalId: string;
  transactionId: string;
  worldId: string;
}) {
  return apiClient.post<{ decision: ProposalDecision; idempotent: boolean }>(
    `/worlds/${input.worldId}/proposals/${input.proposalId}/canon-transaction/confirm`,
    {
      blockNumber: input.blockNumber,
      operationIndex: input.operationIndex,
      transactionId: input.transactionId,
    },
    {
      headers: authHeaders(input.accessToken),
    },
  );
}
