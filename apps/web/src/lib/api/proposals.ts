import { apiClient } from '@/lib/api/client';

export type VoteChoice = 'APPROVE' | 'REJECT' | 'NEEDS_REVISION' | 'ALTERNATE_TIMELINE';

export type ProposalDecision = {
  aiWarningAcknowledged: boolean;
  aiWarningSummary: string | null;
  approvalDenominator: number;
  approvalNumerator: number;
  approvalPercentageBps: number;
  approvalThresholdBps: number;
  approveCount: number;
  alternateTimelineCount: number;
  blockchainTimestamp: string | null;
  blockNumber: string | null;
  contentHash: string;
  customJsonId: string | null;
  decidedAt: string;
  decisionPayload: unknown;
  decisionPayloadHash: string;
  expectedSigner: string | null;
  hiveEventId: string | null;
  id: string;
  minimumVotes: number;
  needsRevisionCount: number;
  operationIndex: number | null;
  outcome:
    | 'APPROVED_FOR_PUBLICATION'
    | 'REJECTED'
    | 'NEEDS_REVISION'
    | 'ALTERNATE_TIMELINE'
    | 'STALE_BASE_CONFLICT';
  rejectCount: number;
  rulesVersion: string;
  totalVotes: number;
  transactionId: string | null;
  votingWindowHours: number;
};

export const PROPOSAL_COMMENT_MAX_LENGTH = 3000;

export type ProposalComment = {
  author: {
    avatarUrl: string | null;
    displayName: string | null;
    hiveUsername: string;
    id: string;
  };
  authorId: string;
  body: string | null;
  createdAt: string;
  deletedAt: string | null;
  id: string;
  isDeleted: boolean;
  proposalId: string;
};

export type ProposalCommentsResponse = {
  comments: ProposalComment[];
  pageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
  };
  totalCount: number;
};

export type ProposalDetail = {
  aiWarning: {
    acknowledged: boolean;
    acknowledgedAt: string | null;
    acknowledgmentRequired: boolean;
    category: string | null;
    evidence: string | null;
    severity: string | null;
    summary: string | null;
  };
  author: {
    hiveUsername: string;
    id: string;
  };
  baseCanonVersionId: string | null;
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

export function getProposalComments(input: {
  cursor?: string | null;
  pageSize?: number;
  proposalId: string;
  worldId: string;
}) {
  const params = new URLSearchParams();

  if (input.cursor) {
    params.set('cursor', input.cursor);
  }

  if (input.pageSize) {
    params.set('pageSize', String(input.pageSize));
  }

  const query = params.toString();

  return apiClient.get<ProposalCommentsResponse>(
    `/worlds/${input.worldId}/proposals/${input.proposalId}/comments${query ? `?${query}` : ''}`,
  );
}

export function createProposalComment(input: {
  accessToken: string;
  body: string;
  proposalId: string;
  worldId: string;
}) {
  return apiClient.post<{ comment: ProposalComment }>(
    `/worlds/${input.worldId}/proposals/${input.proposalId}/comments`,
    { body: input.body },
    {
      headers: authHeaders(input.accessToken),
    },
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

export function acknowledgeProposalAiWarning(input: {
  accessToken: string;
  proposalId: string;
  worldId: string;
}) {
  return apiClient.post<{ aiWarning: ProposalDetail['aiWarning']; idempotent: boolean }>(
    `/worlds/${input.worldId}/proposals/${input.proposalId}/ai-warning/acknowledge`,
    {},
    {
      headers: authHeaders(input.accessToken),
    },
  );
}

export function runProposalConsistencyCheck(input: {
  accessToken: string;
  proposalId: string;
  worldId: string;
}) {
  return apiClient.post<{ aiReport: unknown; warningCount: number }>(
    `/worlds/${input.worldId}/proposals/${input.proposalId}/ai-consistency`,
    {},
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
