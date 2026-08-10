import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  HiveEventType,
  ProposalDecisionOutcome,
  ProposalStatus,
  VoteChoice,
  WorldAuditAction,
} from '../generated/prisma/enums.js';
import { HIVELORE_CUSTOM_JSON_ID } from './hive/constants.js';
import {
  buildHiveLoreCustomJsonOperation,
  parseHiveLoreCustomJsonPayload,
} from './hive/operations.js';
import { normalizeHafOperation } from './hive/projection.js';
import { verifyHiveLoreOperation } from './hive/verification.js';
import type { HafClient } from './hive/haf-client.js';
import type { NormalizedHiveOperation } from './hive/types.js';
import {
  addVotingWindow,
  CANON_VOTING_RULES,
  decideCanonOutcome,
  hashCanonicalJson,
  proposalStatusForDecision,
  tallyCanonVotes,
} from './canon-voting-policy.js';

export class CanonVotingError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type CanonVotingDatabase = PrismaClient;

const voteChoices = new Set<string>([
  VoteChoice.APPROVE,
  VoteChoice.REJECT,
  VoteChoice.NEEDS_REVISION,
  VoteChoice.ALTERNATE_TIMELINE,
]);

type ProposalWithDetails = Prisma.ProposalGetPayload<{
  include: {
    aiReports: true;
    author: { select: { hiveUsername: true; id: true } };
    decision: true;
    votes: { select: { choice: true; updatedAt: true; voterId: true } };
    world: { select: { id: true; title: true } };
  };
}>;

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function assertVoteChoice(choice: string): VoteChoice {
  if (!voteChoices.has(choice)) {
    throw new CanonVotingError(400, 'INVALID_VOTE_CHOICE', 'Unsupported vote choice.');
  }

  return choice as VoteChoice;
}

function isMajorAiWarning(report: { findings: unknown; summary: string | null }) {
  const source = `${report.summary ?? ''} ${JSON.stringify(report.findings ?? {})}`.toLowerCase();

  return source.includes('major') || source.includes('contradiction') || source.includes('warning');
}

function aiWarningSnapshot(proposal: {
  aiReports: Array<{ findings: unknown; summary: string | null }>;
}) {
  const warning = proposal.aiReports.find(isMajorAiWarning);

  return {
    acknowledged: Boolean(warning),
    summary: warning?.summary ?? null,
  };
}

export function serializeDecision(decision: ProposalWithDetails['decision']) {
  if (!decision) {
    return null;
  }

  return {
    aiWarningAcknowledged: decision.aiWarningAcknowledged,
    aiWarningSummary: decision.aiWarningSummary,
    approvalDenominator: decision.approvalDenominator,
    approvalNumerator: decision.approvalNumerator,
    approvalPercentageBps: decision.approvalPercentageBps,
    approvalThresholdBps: decision.approvalThresholdBps,
    approveCount: decision.approveCount,
    alternateTimelineCount: decision.alternateTimelineCount,
    blockchainTimestamp: iso(decision.blockchainTimestamp),
    blockNumber: decision.blockNumber?.toString() ?? null,
    contentHash: decision.contentHash,
    customJsonId: decision.customJsonId,
    decidedAt: decision.decidedAt.toISOString(),
    decisionPayload: decision.decisionPayload,
    decisionPayloadHash: decision.decisionPayloadHash,
    expectedSigner: decision.expectedSigner,
    hiveEventId: decision.hiveEventId,
    id: decision.id,
    minimumVotes: decision.minimumVotes,
    needsRevisionCount: decision.needsRevisionCount,
    operationIndex: decision.operationIndex,
    outcome: decision.outcome,
    rejectCount: decision.rejectCount,
    rulesVersion: decision.rulesVersion,
    totalVotes: decision.totalVotes,
    transactionId: decision.transactionId,
    votingWindowHours: decision.votingWindowHours,
  };
}

export function serializeProposalDetail(
  proposal: ProposalWithDetails,
  currentUserId?: string | undefined,
) {
  const summary = tallyCanonVotes(proposal.votes);
  const currentVote = currentUserId
    ? proposal.votes.find((vote: { voterId: string }) => vote.voterId === currentUserId)
    : null;
  const warning = aiWarningSnapshot(proposal);

  return {
    aiWarning: warning,
    author: proposal.author,
    authorId: proposal.authorId,
    baseCanonVersionId: proposal.baseCanonVersionId,
    branchBaseLoreEntryId: proposal.branchBaseLoreEntryId,
    branchLabel: proposal.branchLabel,
    branchParentProposalId: proposal.branchParentProposalId,
    conflictMetadata: proposal.conflictMetadata,
    contentHash: proposal.contentHash,
    currentUserVote: currentVote
      ? {
          choice: currentVote.choice,
          updatedAt: currentVote.updatedAt.toISOString(),
        }
      : null,
    decision: serializeDecision(proposal.decision),
    id: proposal.id,
    proposedContent: proposal.proposedContent,
    proposalType: proposal.proposalType,
    status: proposal.status,
    submittedAt: iso(proposal.submittedAt),
    summary: proposal.summary,
    tally: summary,
    title: proposal.title,
    votingEndsAt: iso(proposal.votingEndsAt),
    votingStartedAt: iso(proposal.votingStartedAt),
    world: proposal.world,
    worldId: proposal.worldId,
  };
}

async function findProposal(database: CanonVotingDatabase, worldId: string, proposalId: string) {
  return database.proposal.findFirst({
    include: {
      aiReports: true,
      author: {
        select: {
          hiveUsername: true,
          id: true,
        },
      },
      decision: true,
      votes: {
        select: {
          choice: true,
          updatedAt: true,
          voterId: true,
        },
      },
      world: {
        select: {
          id: true,
          title: true,
        },
      },
    },
    where: {
      id: proposalId,
      worldId,
    },
  });
}

export async function getProposalDetail(
  database: CanonVotingDatabase,
  input: { currentUserId?: string; proposalId: string; worldId: string },
) {
  const proposal = await findProposal(database, input.worldId, input.proposalId);

  if (!proposal) {
    throw new CanonVotingError(404, 'PROPOSAL_NOT_FOUND', 'Proposal not found.');
  }

  return serializeProposalDetail(proposal, input.currentUserId);
}

export async function getVoteSummary(
  database: CanonVotingDatabase,
  input: { proposalId: string; worldId: string },
) {
  const proposal = await database.proposal.findFirst({
    select: {
      id: true,
      status: true,
      votingEndsAt: true,
      votingStartedAt: true,
      votes: {
        select: {
          choice: true,
        },
      },
      worldId: true,
    },
    where: {
      id: input.proposalId,
      worldId: input.worldId,
    },
  });

  if (!proposal) {
    throw new CanonVotingError(404, 'PROPOSAL_NOT_FOUND', 'Proposal not found.');
  }

  return {
    rules: CANON_VOTING_RULES,
    status: proposal.status,
    tally: tallyCanonVotes(proposal.votes),
    votingEndsAt: iso(proposal.votingEndsAt),
    votingStartedAt: iso(proposal.votingStartedAt),
  };
}

export async function castCanonVote(
  database: CanonVotingDatabase,
  input: {
    choice: string;
    proposalId: string;
    voterId: string;
    worldId: string;
    now?: Date;
  },
) {
  const choice = assertVoteChoice(input.choice);
  const now = input.now ?? new Date();

  return database.$transaction(async (transaction: Prisma.TransactionClient) => {
    const proposal = await transaction.proposal.findFirst({
      select: {
        decision: { select: { id: true } },
        id: true,
        status: true,
        votingEndsAt: true,
        worldId: true,
      },
      where: {
        id: input.proposalId,
        worldId: input.worldId,
      },
    });

    if (!proposal) {
      throw new CanonVotingError(404, 'PROPOSAL_NOT_FOUND', 'Proposal not found.');
    }

    if (proposal.status !== ProposalStatus.VOTING || proposal.decision) {
      throw new CanonVotingError(409, 'PROPOSAL_NOT_VOTING', 'Proposal is not open for voting.');
    }

    if (!proposal.votingEndsAt || now.getTime() >= proposal.votingEndsAt.getTime()) {
      throw new CanonVotingError(409, 'VOTING_CLOSED', 'Voting is closed for this proposal.');
    }

    const vote = await transaction.appVote.upsert({
      create: {
        choice,
        proposalId: input.proposalId,
        voterId: input.voterId,
      },
      update: {
        choice,
      },
      where: {
        proposalId_voterId: {
          proposalId: input.proposalId,
          voterId: input.voterId,
        },
      },
    });

    return {
      vote: {
        choice: vote.choice,
        createdAt: vote.createdAt.toISOString(),
        id: vote.id,
        proposalId: vote.proposalId,
        updatedAt: vote.updatedAt.toISOString(),
        voterId: vote.voterId,
      },
    };
  });
}

function buildDecisionPayload(input: {
  aiWarningAcknowledged: boolean;
  aiWarningSummary: string | null;
  outcome: ProposalDecisionOutcome;
  proposal: {
    baseCanonVersionId: string | null;
    branchBaseLoreEntryId: string | null;
    branchLabel: string | null;
    branchParentProposalId: string | null;
    conflictMetadata: unknown;
    contentHash: string | null;
    decidedAt: Date;
    id: string;
    proposedContent: unknown;
    staleBaseAtDecision: boolean;
    votingEndsAt: Date;
    votingStartedAt: Date;
    worldId: string;
  };
  tally: ReturnType<typeof tallyCanonVotes>;
}) {
  const contentHash =
    input.proposal.contentHash ?? hashCanonicalJson(input.proposal.proposedContent);

  return {
    aiWarning: {
      acknowledged: input.aiWarningAcknowledged,
      summary: input.aiWarningSummary,
    },
    approval: {
      denominator: input.tally.approvalDenominator,
      numerator: input.tally.approvalNumerator,
      percentageBps: input.tally.approvalPercentageBps,
    },
    branch: {
      baseCanonVersionId: input.proposal.baseCanonVersionId,
      baseLoreEntryId: input.proposal.branchBaseLoreEntryId,
      conflictMetadata: input.proposal.conflictMetadata ?? null,
      label: input.proposal.branchLabel,
      parentProposalId: input.proposal.branchParentProposalId,
      staleBaseAtDecision: input.proposal.staleBaseAtDecision,
    },
    contentHash,
    counts: {
      alternateTimeline: input.tally.alternateTimeline,
      approve: input.tally.approve,
      needsRevision: input.tally.needsRevision,
      reject: input.tally.reject,
      total: input.tally.totalVotes,
    },
    eventType: 'canon_decision',
    outcome: input.outcome,
    proposalId: input.proposal.id,
    rules: CANON_VOTING_RULES,
    voting: {
      decidedAt: input.proposal.decidedAt.toISOString(),
      votingEndsAt: input.proposal.votingEndsAt.toISOString(),
      votingStartedAt: input.proposal.votingStartedAt.toISOString(),
    },
    worldId: input.proposal.worldId,
  };
}

export async function finalizeCanonDecision(
  database: CanonVotingDatabase,
  input: { actorId: string; proposalId: string; worldId: string; now?: Date },
) {
  const now = input.now ?? new Date();

  return database.$transaction(async (transaction: Prisma.TransactionClient) => {
    const existing = await transaction.proposalDecision.findUnique({
      where: {
        proposalId: input.proposalId,
      },
    });

    if (existing) {
      return {
        decision: serializeDecision(existing),
        idempotent: true,
      };
    }

    const proposal = await transaction.proposal.findFirst({
      include: {
        aiReports: true,
        votes: {
          select: {
            choice: true,
          },
        },
      },
      where: {
        id: input.proposalId,
        worldId: input.worldId,
      },
    });

    if (!proposal) {
      throw new CanonVotingError(404, 'PROPOSAL_NOT_FOUND', 'Proposal not found.');
    }

    if (proposal.status !== ProposalStatus.VOTING) {
      throw new CanonVotingError(
        409,
        'PROPOSAL_NOT_VOTING',
        'Proposal is not open for finalization.',
      );
    }

    if (!proposal.votingStartedAt || !proposal.votingEndsAt) {
      throw new CanonVotingError(409, 'VOTING_WINDOW_MISSING', 'Proposal has no voting window.');
    }

    if (now.getTime() < proposal.votingEndsAt.getTime()) {
      throw new CanonVotingError(409, 'VOTING_STILL_OPEN', 'Voting is still open.');
    }

    const currentBible = await transaction.worldBibleVersion.findFirst({
      orderBy: {
        versionNumber: 'desc',
      },
      select: {
        id: true,
      },
      where: {
        worldId: input.worldId,
      },
    });

    const staleBaseAtDecision = Boolean(
      proposal.baseCanonVersionId &&
      currentBible?.id &&
      proposal.baseCanonVersionId !== currentBible.id,
    );
    const tally = tallyCanonVotes(proposal.votes);
    const outcome = decideCanonOutcome({
      now,
      staleBaseAtDecision,
      tally,
      votingEndsAt: proposal.votingEndsAt,
    });

    if (!outcome) {
      throw new CanonVotingError(409, 'VOTING_STILL_OPEN', 'Voting is still open.');
    }

    const warning = aiWarningSnapshot(proposal);
    const decidedAt = now;
    const contentHash = proposal.contentHash ?? hashCanonicalJson(proposal.proposedContent);
    const payload = buildDecisionPayload({
      aiWarningAcknowledged: warning.acknowledged,
      aiWarningSummary: warning.summary,
      outcome,
      proposal: {
        ...proposal,
        contentHash,
        decidedAt,
        staleBaseAtDecision,
        votingEndsAt: proposal.votingEndsAt,
        votingStartedAt: proposal.votingStartedAt,
      },
      tally,
    });
    const payloadHash = hashCanonicalJson(payload);
    const decision = await transaction.proposalDecision.create({
      data: {
        aiWarningAcknowledged: warning.acknowledged,
        aiWarningSummary: warning.summary,
        alternateTimelineCount: tally.alternateTimeline,
        approvalDenominator: tally.approvalDenominator,
        approvalNumerator: tally.approvalNumerator,
        approvalPercentageBps: tally.approvalPercentageBps,
        approvalThresholdBps: CANON_VOTING_RULES.approvalThresholdBps,
        approveCount: tally.approve,
        baseCanonVersionId: proposal.baseCanonVersionId,
        branchBaseLoreEntryId: proposal.branchBaseLoreEntryId,
        branchLabel: proposal.branchLabel,
        branchParentProposalId: proposal.branchParentProposalId,
        conflictMetadata: proposal.conflictMetadata as Prisma.InputJsonValue,
        contentHash,
        decidedAt,
        decisionPayload: payload as Prisma.InputJsonValue,
        decisionPayloadHash: payloadHash,
        minimumVotes: CANON_VOTING_RULES.minimumVotes,
        needsRevisionCount: tally.needsRevision,
        outcome,
        payloadSchemaVersion: CANON_VOTING_RULES.payloadSchemaVersion,
        proposalId: proposal.id,
        rejectCount: tally.reject,
        rulesVersion: CANON_VOTING_RULES.rulesVersion,
        staleBaseAtDecision,
        totalVotes: tally.totalVotes,
        votingWindowHours: CANON_VOTING_RULES.votingWindowHours,
      },
    });

    await transaction.proposal.update({
      data: {
        ...(outcome === ProposalDecisionOutcome.APPROVED_FOR_PUBLICATION
          ? { approvedAt: decidedAt }
          : { rejectedAt: decidedAt }),
        contentHash,
        decidedAt,
        staleBaseAtDecision,
        status: proposalStatusForDecision(outcome),
      },
      where: {
        id: proposal.id,
      },
    });

    await transaction.worldAuditLog.create({
      data: {
        action: WorldAuditAction.CANON_DECISION_FINALIZED,
        actorId: input.actorId,
        metadata: {
          decisionId: decision.id,
          outcome,
          payloadHash,
          tally,
        },
        targetId: proposal.id,
        targetType: 'PROPOSAL',
        worldId: input.worldId,
      },
    });

    return {
      decision: serializeDecision(decision),
      idempotent: false,
    };
  });
}

export async function createCanonTransactionOperation(
  database: CanonVotingDatabase,
  input: { proposalId: string; signerId: string; worldId: string },
) {
  const proposal = await database.proposal.findFirst({
    include: {
      author: {
        select: {
          hiveUsername: true,
          id: true,
        },
      },
      decision: true,
    },
    where: {
      id: input.proposalId,
      worldId: input.worldId,
    },
  });

  if (!proposal?.decision) {
    throw new CanonVotingError(
      409,
      'DECISION_NOT_FINALIZED',
      'Proposal decision is not finalized.',
    );
  }

  if (proposal.decision.outcome !== ProposalDecisionOutcome.APPROVED_FOR_PUBLICATION) {
    throw new CanonVotingError(
      409,
      'DECISION_NOT_APPROVED',
      'Only approved decisions go on-chain.',
    );
  }

  if (proposal.authorId !== input.signerId) {
    throw new CanonVotingError(
      403,
      'SIGNER_NOT_AUTHOR',
      'Only the proposal author can sign the canon decision.',
    );
  }

  const signer = proposal.author.hiveUsername.toLowerCase();
  const operation = buildHiveLoreCustomJsonOperation({
    action: 'canon_approval',
    entityId: proposal.decision.id,
    entityType: 'CANON_DECISION',
    payload: proposal.decision.decisionPayload as Record<string, unknown>,
    proposalId: proposal.id,
    signer,
    worldId: proposal.worldId,
  });

  await database.proposalDecision.update({
    data: {
      customJsonId: HIVELORE_CUSTOM_JSON_ID,
      expectedSigner: signer,
    },
    where: {
      id: proposal.decision.id,
    },
  });

  return {
    customJsonId: HIVELORE_CUSTOM_JSON_ID,
    decisionId: proposal.decision.id,
    operation,
    signer,
  };
}

async function findConfirmedOperation(input: {
  blockNumber: number;
  hafClient: HafClient;
  operationIndex: number;
  transactionId: string;
}): Promise<NormalizedHiveOperation | null> {
  const page = await input.hafClient.searchBlocks({
    fromBlock: input.blockNumber,
    toBlock: input.blockNumber,
  });

  for (const row of page.operations) {
    const operation = normalizeHafOperation(row);

    if (
      operation.transactionId === input.transactionId &&
      operation.operationIndex === input.operationIndex
    ) {
      return operation;
    }
  }

  return null;
}

export async function confirmCanonTransaction(
  database: CanonVotingDatabase,
  input: {
    blockNumber: number;
    hafClient: HafClient;
    operationIndex: number;
    proposalId: string;
    transactionId: string;
    worldId: string;
  },
) {
  const proposal = await database.proposal.findFirst({
    include: {
      author: {
        select: {
          hiveUsername: true,
        },
      },
      decision: true,
    },
    where: {
      id: input.proposalId,
      worldId: input.worldId,
    },
  });

  if (!proposal?.decision) {
    throw new CanonVotingError(
      409,
      'DECISION_NOT_FINALIZED',
      'Proposal decision is not finalized.',
    );
  }

  const currentDecision = proposal.decision;

  if (
    currentDecision.transactionId === input.transactionId &&
    currentDecision.operationIndex === input.operationIndex
  ) {
    return {
      decision: serializeDecision(currentDecision),
      idempotent: true,
    };
  }

  if (currentDecision.transactionId || currentDecision.operationIndex !== null) {
    throw new CanonVotingError(
      409,
      'DECISION_ALREADY_CONFIRMED',
      'Proposal decision is already linked to a different Hive operation.',
    );
  }

  const operation = await findConfirmedOperation({
    blockNumber: input.blockNumber,
    hafClient: input.hafClient,
    operationIndex: input.operationIndex,
    transactionId: input.transactionId,
  });

  if (!operation) {
    throw new CanonVotingError(
      404,
      'HIVE_OPERATION_NOT_FOUND',
      'Hive operation was not confirmed.',
    );
  }

  const signer = (currentDecision.expectedSigner ?? proposal.author.hiveUsername).toLowerCase();
  const verification = verifyHiveLoreOperation({
    expectedSigner: signer,
    operation: operation.operation,
  });

  if (!verification.ok) {
    throw new CanonVotingError(
      400,
      'HIVE_OPERATION_INVALID',
      verification.reason ?? 'Invalid Hive operation.',
    );
  }

  const customJsonOperation = operation.operation.custom_json_operation;

  if (
    !customJsonOperation ||
    customJsonOperation.required_auths.length > 0 ||
    !customJsonOperation.required_posting_auths.includes(signer)
  ) {
    throw new CanonVotingError(
      400,
      'HIVE_OPERATION_INVALID_AUTHORITY',
      'Canon decisions must be signed with posting authority by the expected signer.',
    );
  }

  const payload = parseHiveLoreCustomJsonPayload(operation.operation);

  if (
    !payload ||
    payload.action !== 'canon_approval' ||
    payload.entityType !== 'CANON_DECISION' ||
    payload.entityId !== currentDecision.id ||
    payload.worldId !== input.worldId ||
    payload.proposalId !== input.proposalId ||
    hashCanonicalJson(payload.payload) !== currentDecision.decisionPayloadHash
  ) {
    throw new CanonVotingError(
      400,
      'HIVE_OPERATION_MISMATCH',
      'Hive operation does not match the frozen decision.',
    );
  }

  return database.$transaction(async (transaction: Prisma.TransactionClient) => {
    const hiveEvent = await transaction.hiveEvent.upsert({
      create: {
        blockNumber: operation.blockNumber,
        blockchainTimestamp: operation.blockchainTimestamp,
        eventType: HiveEventType.CUSTOM_JSON,
        operationIndex: operation.operationIndex,
        payload: operation.operation as Prisma.InputJsonValue,
        transactionId: operation.transactionId,
      },
      update: {
        blockNumber: operation.blockNumber,
        blockchainTimestamp: operation.blockchainTimestamp,
        eventType: HiveEventType.CUSTOM_JSON,
        payload: operation.operation as Prisma.InputJsonValue,
      },
      where: {
        transactionId_operationIndex: {
          operationIndex: operation.operationIndex,
          transactionId: operation.transactionId,
        },
      },
    });

    const confirmedDecision = await transaction.proposalDecision.update({
      data: {
        blockchainTimestamp: operation.blockchainTimestamp,
        blockNumber: operation.blockNumber,
        customJsonId: HIVELORE_CUSTOM_JSON_ID,
        expectedSigner: signer,
        hiveEventId: hiveEvent.id,
        operationIndex: operation.operationIndex,
        transactionId: operation.transactionId,
      },
      where: {
        id: currentDecision.id,
      },
    });

    return {
      decision: serializeDecision(confirmedDecision),
      idempotent: false,
    };
  });
}

export function prepareSubmittedProposalVotingFields(input: {
  proposedContent: unknown;
  submittedAt: Date;
}) {
  return {
    contentHash: hashCanonicalJson(input.proposedContent),
    votingEndsAt: addVotingWindow(input.submittedAt),
    votingStartedAt: input.submittedAt,
  };
}
