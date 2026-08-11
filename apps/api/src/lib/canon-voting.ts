import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  HiveEventType,
  ProposalDecisionOutcome,
  ProposalStatus,
  VoteChoice,
  WorldAuditAction,
} from '../generated/prisma/enums.js';
import type { HiveReliableBroadcaster } from './hive/broadcast-reliability.js';
import { HIVELORE_CUSTOM_JSON_ID } from './hive/constants.js';
import {
  buildHiveLoreCustomJsonOperation,
  parseHiveLoreCustomJsonPayload,
} from './hive/operations.js';
import { normalizeHafOperation } from './hive/projection.js';
import { verifyHiveLoreOperation } from './hive/verification.js';
import type { HafClient } from './hive/haf-client.js';
import type { HafOperationRow, NormalizedHiveOperation } from './hive/types.js';
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

type AiWarningSnapshot = {
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgmentRequired: boolean;
  category: string | null;
  evidence: string | null;
  severity: string | null;
  summary: string | null;
};

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function assertVoteChoice(choice: string): VoteChoice {
  if (!voteChoices.has(choice)) {
    throw new CanonVotingError(400, 'INVALID_VOTE_CHOICE', 'Unsupported vote choice.');
  }

  return choice as VoteChoice;
}

function readStringField(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const field = record[key];

    if (typeof field === 'string' && field.trim()) {
      return field.trim();
    }
  }

  return null;
}

function flattenAiFindings(value: unknown): Array<Record<string, unknown>> {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenAiFindings);
  }

  if (typeof value !== 'object') {
    return [];
  }

  const record = value as Record<string, unknown>;
  const nested = ['findings', 'warnings', 'issues', 'conflicts', 'items'].flatMap((key) =>
    flattenAiFindings(record[key]),
  );

  return [record, ...nested];
}

function textIndicatesNoMajorWarning(source: string) {
  const normalized = source.toLowerCase();

  return [
    /\bno\s+(?:major\s+)?(?:warning|contradiction|conflict)s?\s+(?:found|detected|identified|present)?\b/,
    /\bwithout\s+(?:a\s+)?(?:major\s+)?(?:warning|contradiction|conflict)\b/,
    /\b(?:warning|contradiction|conflict)\s+free\b/,
  ].some((pattern) => pattern.test(normalized));
}

function textIndicatesMajorWarning(source: string) {
  const normalized = source.toLowerCase();

  if (textIndicatesNoMajorWarning(normalized)) {
    return false;
  }

  return [
    /\b(?:major|critical|high)\s+(?:ai\s+)?(?:warning|contradiction|conflict|issue)\b/,
    /\b(?:warning|contradiction|conflict|issue)\s+(?:severity|level)\s*[:=]\s*(?:major|critical|high)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function warningFromReport(report: { findings: unknown; summary: string | null }) {
  for (const finding of flattenAiFindings(report.findings)) {
    const severity = readStringField(finding, ['severity', 'level', 'risk']);
    const category = readStringField(finding, ['category', 'type', 'kind']);
    const summary = readStringField(finding, ['summary', 'message', 'description', 'text']);
    const evidence = readStringField(finding, ['evidence', 'detail', 'details', 'excerpt']);
    const source = [severity, category, summary, evidence].filter(Boolean).join(' ');

    if (
      severity &&
      ['major', 'critical', 'high'].includes(severity.toLowerCase()) &&
      !textIndicatesNoMajorWarning(source)
    ) {
      return {
        category,
        evidence,
        severity,
        summary: summary ?? report.summary,
      };
    }

    if (textIndicatesMajorWarning(source)) {
      return {
        category,
        evidence,
        severity,
        summary: summary ?? report.summary,
      };
    }
  }

  const source = `${report.summary ?? ''} ${JSON.stringify(report.findings ?? {})}`;

  if (!textIndicatesMajorWarning(source)) {
    return null;
  }

  return {
    category: null,
    evidence: null,
    severity: null,
    summary: report.summary,
  };
}

function aiWarningSnapshot(proposal: {
  aiReports: Array<{ findings: unknown; summary: string | null }>;
  aiWarningAcknowledgedAt?: Date | null;
}): AiWarningSnapshot {
  const warning = proposal.aiReports.map(warningFromReport).find(Boolean) ?? null;
  const acknowledgedAt = iso(proposal.aiWarningAcknowledgedAt);
  const acknowledgmentRequired = Boolean(warning);

  return {
    acknowledged: acknowledgmentRequired && Boolean(acknowledgedAt),
    acknowledgedAt,
    acknowledgmentRequired,
    category: warning?.category ?? null,
    evidence: warning?.evidence ?? null,
    severity: warning?.severity ?? null,
    summary: warning?.summary ?? null,
  };
}

function proposalAuthorExclusion(authorId: string) {
  return new Set([authorId]);
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
  const summary = tallyCanonVotes(proposal.votes, {
    excludeVoterIds: proposalAuthorExclusion(proposal.authorId),
  });
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
    currentUserVote:
      currentVote && currentUserId !== proposal.authorId
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
          voterId: true,
        },
      },
      authorId: true,
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
    tally: tallyCanonVotes(proposal.votes, {
      excludeVoterIds: proposalAuthorExclusion(proposal.authorId),
    }),
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
        authorId: true,
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

    if (proposal.authorId === input.voterId) {
      throw new CanonVotingError(
        403,
        'PROPOSAL_AUTHOR_CANNOT_VOTE',
        'Proposal authors cannot vote on their own canon proposals.',
      );
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

export async function acknowledgeProposalAiWarning(
  database: CanonVotingDatabase,
  input: { actorId: string; proposalId: string; worldId: string; now?: Date },
) {
  const now = input.now ?? new Date();

  return database.$transaction(async (transaction: Prisma.TransactionClient) => {
    const proposal = await transaction.proposal.findFirst({
      include: {
        aiReports: true,
      },
      where: {
        id: input.proposalId,
        worldId: input.worldId,
      },
    });

    if (!proposal) {
      throw new CanonVotingError(404, 'PROPOSAL_NOT_FOUND', 'Proposal not found.');
    }

    const warning = aiWarningSnapshot(proposal);

    if (!warning.acknowledgmentRequired) {
      throw new CanonVotingError(
        409,
        'AI_WARNING_NOT_REQUIRED',
        'This proposal does not have a major AI warning to acknowledge.',
      );
    }

    const updated = await transaction.proposal.update({
      data: {
        aiWarningAcknowledgedAt: proposal.aiWarningAcknowledgedAt ?? now,
      },
      where: {
        id: proposal.id,
      },
    });

    const snapshot = aiWarningSnapshot({
      aiReports: proposal.aiReports,
      aiWarningAcknowledgedAt: updated.aiWarningAcknowledgedAt,
    });

    if (!proposal.aiWarningAcknowledgedAt) {
      await transaction.worldAuditLog.create({
        data: {
          action: WorldAuditAction.AI_WARNING_RESOLVED,
          actorId: input.actorId,
          metadata: {
            acknowledgedAt: snapshot.acknowledgedAt,
            category: snapshot.category,
            evidence: snapshot.evidence,
            proposalId: proposal.id,
            severity: snapshot.severity,
            summary: snapshot.summary,
          },
          targetId: proposal.id,
          targetType: 'PROPOSAL',
          worldId: input.worldId,
        },
      });
    }

    return {
      aiWarning: snapshot,
      idempotent: Boolean(proposal.aiWarningAcknowledgedAt),
    };
  });
}

function buildDecisionPayload(input: {
  aiWarning: AiWarningSnapshot;
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
      acknowledged: input.aiWarning.acknowledged,
      acknowledgedAt: input.aiWarning.acknowledgedAt,
      acknowledgmentRequired: input.aiWarning.acknowledgmentRequired,
      category: input.aiWarning.category,
      evidence: input.aiWarning.evidence,
      severity: input.aiWarning.severity,
      summary: input.aiWarning.summary,
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
        author: {
          select: {
            id: true,
          },
        },
        votes: {
          select: {
            choice: true,
            voterId: true,
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
    const tally = tallyCanonVotes(proposal.votes, {
      excludeVoterIds: proposalAuthorExclusion(proposal.authorId),
    });
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

    if (warning.acknowledgmentRequired && !warning.acknowledged) {
      throw new CanonVotingError(
        409,
        'AI_WARNING_ACKNOWLEDGMENT_REQUIRED',
        'Major AI warnings must be explicitly acknowledged before finalization.',
      );
    }

    const decidedAt = now;
    const contentHash = proposal.contentHash ?? hashCanonicalJson(proposal.proposedContent);
    const payload = buildDecisionPayload({
      aiWarning: warning,
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

  if (proposal.decision.transactionId || proposal.decision.operationIndex !== null) {
    throw new CanonVotingError(
      409,
      'DECISION_ALREADY_CONFIRMED',
      'Proposal decision is already linked to a Hive operation.',
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

function readHafTransactionId(row: HafOperationRow) {
  const value = row.transaction_id ?? row.transactionId ?? row.trx_id;

  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readHafOperationIndex(row: HafOperationRow) {
  const value = row.operation_id ?? row.operationIndex ?? row.op_pos;
  const numeric = typeof value === 'string' ? Number(value) : value;

  return typeof numeric === 'number' && Number.isInteger(numeric) ? numeric : null;
}

async function findConfirmedOperation(input: {
  blockNumber?: number | undefined;
  expectedOperation: ReturnType<typeof buildHiveLoreCustomJsonOperation>;
  expectedSigner: string;
  hafClient: HafClient;
  hiveBroadcaster?: HiveReliableBroadcaster | undefined;
  operationIndex?: number | undefined;
  transactionId: string;
}): Promise<NormalizedHiveOperation | null> {
  if (input.hiveBroadcaster) {
    return input.hiveBroadcaster.confirmTransactionOperation({
      blockNumberHint: input.blockNumber,
      expectedOperation: input.expectedOperation,
      expectedSigner: input.expectedSigner,
      operationIndex: input.operationIndex,
      transactionId: input.transactionId,
    });
  }

  if (!input.blockNumber || input.operationIndex === undefined) {
    throw new CanonVotingError(
      400,
      'CONFIRMATION_LOOKUP_UNAVAILABLE',
      'A confirmation service or block and operation hints are required.',
    );
  }

  const page = await input.hafClient.searchBlocks({
    fromBlock: input.blockNumber,
    toBlock: input.blockNumber,
  });

  for (const row of page.operations) {
    if (readHafTransactionId(row) !== input.transactionId) {
      continue;
    }

    if (readHafOperationIndex(row) !== input.operationIndex) {
      continue;
    }

    try {
      const operation = normalizeHafOperation(row);
      return operation;
    } catch (error) {
      throw new CanonVotingError(
        400,
        'HIVE_OPERATION_INVALID',
        error instanceof Error ? error.message : 'Invalid Hive operation.',
      );
    }
  }

  return null;
}

export async function confirmCanonTransaction(
  database: CanonVotingDatabase,
  input: {
    blockNumber?: number | undefined;
    hafClient: HafClient;
    hiveBroadcaster?: HiveReliableBroadcaster | undefined;
    operationIndex?: number | undefined;
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
    (input.operationIndex === undefined || currentDecision.operationIndex === input.operationIndex)
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

  const signer = (currentDecision.expectedSigner ?? proposal.author.hiveUsername).toLowerCase();
  const expectedOperation = buildHiveLoreCustomJsonOperation({
    action: 'canon_approval',
    entityId: currentDecision.id,
    entityType: 'CANON_DECISION',
    payload: currentDecision.decisionPayload as Record<string, unknown>,
    proposalId: input.proposalId,
    signer,
    worldId: input.worldId,
  });
  const operation = await findConfirmedOperation({
    blockNumber: input.blockNumber,
    expectedOperation,
    expectedSigner: signer,
    hafClient: input.hafClient,
    hiveBroadcaster: input.hiveBroadcaster,
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

    const claim = await transaction.proposalDecision.updateMany({
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
        operationIndex: null,
        transactionId: null,
      },
    });

    if (claim.count === 0) {
      const linkedDecision = await transaction.proposalDecision.findUnique({
        where: {
          id: currentDecision.id,
        },
      });

      if (
        linkedDecision?.transactionId === operation.transactionId &&
        linkedDecision.operationIndex === operation.operationIndex
      ) {
        return {
          decision: serializeDecision(linkedDecision),
          idempotent: true,
        };
      }

      throw new CanonVotingError(
        409,
        'DECISION_ALREADY_CONFIRMED',
        'Proposal decision is already linked to a different Hive operation.',
      );
    }

    const confirmedDecision = await transaction.proposalDecision.findUniqueOrThrow({
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
