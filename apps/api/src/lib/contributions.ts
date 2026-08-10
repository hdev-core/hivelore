import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  ContributionKind,
  ContributionStatus,
  ProposalStatus,
  ProposalType,
  WorldAuditAction,
} from '../generated/prisma/enums.js';
import { prepareSubmittedProposalVotingFields } from './canon-voting.js';

const STRUCTURED_DOCUMENT_MAX_BYTES = 100 * 1024;

export class ContributionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export type ContributionDatabase = Pick<
  PrismaClient,
  | '$transaction'
  | 'contributionDraft'
  | 'loreEntry'
  | 'proposal'
  | 'refreshSession'
  | 'world'
  | 'worldAuditLog'
  | 'worldMembership'
>;

export type StructuredDocument = Prisma.InputJsonObject;

export type CreateContributionInput = {
  worldId: string;
  authorId: string;
  kind: ContributionKind;
  title: string;
  summary?: string | undefined;
  targetLoreEntryId?: string | undefined;
  content: unknown;
};

export type UpdateContributionInput = {
  worldId: string;
  contributionId: string;
  authorId: string;
  kind?: ContributionKind | undefined;
  title?: string | undefined;
  summary?: string | null | undefined;
  targetLoreEntryId?: string | null | undefined;
  content?: unknown;
};

export type ListContributionInput = {
  worldId: string;
  authorId: string;
  status?: ContributionStatus | undefined;
  kind?: ContributionKind | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

const contributionInclude = {
  proposal: true,
  targetLoreEntry: {
    select: {
      id: true,
      loreType: true,
      slug: true,
      title: true,
      worldId: true,
    },
  },
} as const;

type ContributionWithRelations = Prisma.ContributionDraftGetPayload<{
  include: typeof contributionInclude;
}>;

type ProposalRecord = Prisma.ProposalGetPayload<Record<string, never>>;

function serializeDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

export function serializeProposal(proposal: ProposalRecord | null) {
  if (!proposal) {
    return null;
  }

  return {
    approvedAt: serializeDate(proposal.approvedAt),
    authorId: proposal.authorId,
    contributionKind: proposal.contributionKind,
    createdAt: proposal.createdAt.toISOString(),
    id: proposal.id,
    proposedContent: proposal.proposedContent,
    proposalType: proposal.proposalType,
    publishedAt: serializeDate(proposal.publishedAt),
    rejectedAt: serializeDate(proposal.rejectedAt),
    resultingBibleVersionId: proposal.resultingBibleVersionId,
    resultingLoreEntryId: proposal.resultingLoreEntryId,
    status: proposal.status,
    submittedAt: serializeDate(proposal.submittedAt),
    summary: proposal.summary,
    targetLoreEntryId: proposal.targetLoreEntryId,
    title: proposal.title,
    updatedAt: proposal.updatedAt.toISOString(),
    votingStartedAt: serializeDate(proposal.votingStartedAt),
    worldId: proposal.worldId,
  };
}

export function serializeContribution(contribution: ContributionWithRelations) {
  return {
    authorId: contribution.authorId,
    content: contribution.content,
    createdAt: contribution.createdAt.toISOString(),
    id: contribution.id,
    kind: contribution.kind,
    proposal: serializeProposal(contribution.proposal),
    proposalId: contribution.proposalId,
    status: contribution.status,
    submittedAt: serializeDate(contribution.submittedAt),
    summary: contribution.summary,
    targetLoreEntry: contribution.targetLoreEntry,
    targetLoreEntryId: contribution.targetLoreEntryId,
    title: contribution.title,
    updatedAt: contribution.updatedAt.toISOString(),
    worldId: contribution.worldId,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function assertJsonByteLimit(value: unknown) {
  const serialized = JSON.stringify(value);

  if (!serialized || Buffer.byteLength(serialized, 'utf8') > STRUCTURED_DOCUMENT_MAX_BYTES) {
    throw new ContributionError(400, 'Structured content exceeds the 100 KB limit.');
  }
}

export function validateStructuredDocument(value: unknown): StructuredDocument {
  assertJsonByteLimit(value);

  if (!isPlainObject(value)) {
    throw new ContributionError(400, 'Structured content must be a JSON object.');
  }

  if (value.type !== 'doc') {
    throw new ContributionError(400, 'Structured content root type must be "doc".');
  }

  if ('content' in value && !Array.isArray(value.content)) {
    throw new ContributionError(400, 'Structured content root content must be an array.');
  }

  return value as StructuredDocument;
}

export function hasMeaningfulText(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasMeaningfulText);
  }

  if (!isPlainObject(value)) {
    return false;
  }

  if (typeof value.text === 'string' && value.text.trim().length > 0) {
    return true;
  }

  return Object.values(value).some(hasMeaningfulText);
}

function normalizeTitle(title: string) {
  const normalized = title.trim();

  if (!normalized) {
    throw new ContributionError(400, 'Contribution title is required.');
  }

  if (normalized.length > 200) {
    throw new ContributionError(400, 'Contribution title must be at most 200 characters.');
  }

  return normalized;
}

function normalizeSummary(summary: string | null | undefined) {
  const normalized = summary?.trim() || null;

  if (normalized && normalized.length > 1_000) {
    throw new ContributionError(400, 'Contribution summary must be at most 1000 characters.');
  }

  return normalized;
}

async function assertWorldExists(database: Pick<ContributionDatabase, 'world'>, worldId: string) {
  const world = await database.world.findUnique({
    select: {
      id: true,
    },
    where: {
      id: worldId,
    },
  });

  if (!world) {
    throw new ContributionError(404, 'World not found.');
  }
}

async function assertTargetLoreEntry(
  database: Pick<ContributionDatabase, 'loreEntry'>,
  worldId: string,
  targetLoreEntryId: string | null | undefined,
) {
  if (!targetLoreEntryId) {
    return null;
  }

  const target = await database.loreEntry.findUnique({
    select: {
      id: true,
      worldId: true,
    },
    where: {
      id: targetLoreEntryId,
    },
  });

  if (!target) {
    throw new ContributionError(404, 'Target lore entry not found.');
  }

  if (target.worldId !== worldId) {
    throw new ContributionError(400, 'Target lore entry must belong to the same world.');
  }

  return target;
}

function proposalTypeForContribution(kind: ContributionKind, hasTargetLoreEntry: boolean) {
  if (kind === ContributionKind.STORY) {
    return ProposalType.ADD_STORY;
  }

  return hasTargetLoreEntry ? ProposalType.UPDATE_LORE : ProposalType.ADD_LORE;
}

async function createContributionAuditLog(
  database: Pick<ContributionDatabase, 'worldAuditLog'>,
  input: {
    action: (typeof WorldAuditAction)[keyof typeof WorldAuditAction];
    actorId: string;
    worldId: string;
    targetId: string;
    targetType: string;
    metadata?: Prisma.InputJsonObject | undefined;
  },
) {
  await database.worldAuditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId,
      metadata: input.metadata ?? {},
      targetId: input.targetId,
      targetType: input.targetType,
      worldId: input.worldId,
    },
  });
}

export async function createContribution(
  database: ContributionDatabase,
  input: CreateContributionInput,
) {
  const title = normalizeTitle(input.title);
  const summary = normalizeSummary(input.summary);
  const content = validateStructuredDocument(input.content);

  await assertWorldExists(database, input.worldId);
  await assertTargetLoreEntry(database, input.worldId, input.targetLoreEntryId);

  const contribution = await database.$transaction(async (transaction) => {
    const created = await transaction.contributionDraft.create({
      data: {
        authorId: input.authorId,
        content,
        kind: input.kind,
        summary,
        targetLoreEntryId: input.targetLoreEntryId || null,
        title,
        worldId: input.worldId,
      },
      include: contributionInclude,
    });

    await createContributionAuditLog(transaction, {
      action: WorldAuditAction.CONTRIBUTION_CREATED,
      actorId: input.authorId,
      metadata: {
        kind: input.kind,
        targetLoreEntryId: input.targetLoreEntryId ?? null,
      },
      targetId: created.id,
      targetType: 'CONTRIBUTION_DRAFT',
      worldId: input.worldId,
    });

    return created;
  });

  return serializeContribution(contribution);
}

export async function listOwnedContributions(
  database: ContributionDatabase,
  input: ListContributionInput,
) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const where: Prisma.ContributionDraftWhereInput = {
    authorId: input.authorId,
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.status ? { status: input.status } : {}),
    worldId: input.worldId,
  };

  const [contributions, total] = await Promise.all([
    database.contributionDraft.findMany({
      include: contributionInclude,
      orderBy: [
        {
          updatedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      where,
    }),
    database.contributionDraft.count({
      where,
    }),
  ]);

  return {
    contributions: contributions.map(serializeContribution),
    pagination: {
      page,
      pageSize,
      total,
    },
  };
}

async function resolveMissingOrLockedContribution(
  database: Pick<ContributionDatabase, 'contributionDraft'>,
  input: {
    worldId: string;
    contributionId: string;
    authorId: string;
    lockedMessage: string;
  },
) {
  const current = await database.contributionDraft.findFirst({
    select: {
      status: true,
    },
    where: {
      authorId: input.authorId,
      id: input.contributionId,
      worldId: input.worldId,
    },
  });

  if (!current) {
    throw new ContributionError(404, 'Contribution not found.');
  }

  if (current.status !== ContributionStatus.DRAFT) {
    throw new ContributionError(409, input.lockedMessage);
  }

  throw new ContributionError(409, 'Concurrent contribution update conflict.');
}

async function findOwnedContributionOrThrow(
  database: Pick<ContributionDatabase, 'contributionDraft'>,
  input: {
    worldId: string;
    contributionId: string;
    authorId: string;
  },
) {
  const contribution = await database.contributionDraft.findFirst({
    include: contributionInclude,
    where: {
      authorId: input.authorId,
      id: input.contributionId,
      worldId: input.worldId,
    },
  });

  if (!contribution) {
    throw new ContributionError(404, 'Contribution not found.');
  }

  return contribution;
}

export async function getOwnedContribution(
  database: ContributionDatabase,
  input: {
    worldId: string;
    contributionId: string;
    authorId: string;
  },
) {
  const contribution = await database.contributionDraft.findFirst({
    include: contributionInclude,
    where: {
      authorId: input.authorId,
      id: input.contributionId,
      worldId: input.worldId,
    },
  });

  return contribution ? serializeContribution(contribution) : null;
}

export async function updateContribution(
  database: ContributionDatabase,
  input: UpdateContributionInput,
) {
  await findOwnedContributionOrThrow(database, input);

  const data: Prisma.ContributionDraftUpdateManyMutationInput = {};
  const changedFields: string[] = [];
  let targetLoreEntryId: string | null | undefined;

  if (input.kind) {
    data.kind = input.kind;
    changedFields.push('kind');
  }

  if (input.title !== undefined) {
    data.title = normalizeTitle(input.title);
    changedFields.push('title');
  }

  if (input.summary !== undefined) {
    data.summary = normalizeSummary(input.summary);
    changedFields.push('summary');
  }

  if (input.content !== undefined) {
    data.content = validateStructuredDocument(input.content);
    changedFields.push('content');
  }

  if (input.targetLoreEntryId !== undefined) {
    await assertTargetLoreEntry(database, input.worldId, input.targetLoreEntryId);
    targetLoreEntryId = input.targetLoreEntryId;
    changedFields.push('targetLoreEntryId');
  }

  if (Object.keys(data).length === 0) {
    data.updatedAt = new Date();
  }

  const contribution = await database.$transaction(async (transaction) => {
    const updated = await transaction.contributionDraft.updateMany({
      data,
      where: {
        authorId: input.authorId,
        id: input.contributionId,
        status: ContributionStatus.DRAFT,
        worldId: input.worldId,
      },
    });

    if (updated.count !== 1) {
      await resolveMissingOrLockedContribution(transaction, {
        ...input,
        lockedMessage: 'Submitted contributions cannot be edited.',
      });
    }

    if (targetLoreEntryId !== undefined) {
      await transaction.contributionDraft.update({
        data: {
          targetLoreEntry:
            targetLoreEntryId === null
              ? {
                  disconnect: true,
                }
              : {
                  connect: {
                    id: targetLoreEntryId,
                  },
                },
        },
        where: {
          id: input.contributionId,
        },
      });
    }

    const current = await transaction.contributionDraft.findFirst({
      include: contributionInclude,
      where: {
        authorId: input.authorId,
        id: input.contributionId,
        worldId: input.worldId,
      },
    });

    if (!current) {
      throw new ContributionError(404, 'Contribution not found.');
    }

    await createContributionAuditLog(transaction, {
      action: WorldAuditAction.CONTRIBUTION_UPDATED,
      actorId: input.authorId,
      metadata: {
        changedFields: changedFields.sort(),
      },
      targetId: current.id,
      targetType: 'CONTRIBUTION_DRAFT',
      worldId: input.worldId,
    });

    return current;
  });

  return serializeContribution(contribution);
}

export async function deleteContribution(
  database: ContributionDatabase,
  input: {
    worldId: string;
    contributionId: string;
    authorId: string;
  },
) {
  await database.$transaction(async (transaction) => {
    const existing = await transaction.contributionDraft.findFirst({
      where: {
        authorId: input.authorId,
        id: input.contributionId,
        worldId: input.worldId,
      },
    });

    if (!existing) {
      throw new ContributionError(404, 'Contribution not found.');
    }

    if (existing.status !== ContributionStatus.DRAFT) {
      throw new ContributionError(409, 'Submitted contributions cannot be deleted.');
    }

    const deleted = await transaction.contributionDraft.deleteMany({
      where: {
        authorId: input.authorId,
        id: input.contributionId,
        status: ContributionStatus.DRAFT,
        worldId: input.worldId,
      },
    });

    if (deleted.count !== 1) {
      await resolveMissingOrLockedContribution(transaction, {
        ...input,
        lockedMessage: 'Submitted contributions cannot be deleted.',
      });
    }

    await createContributionAuditLog(transaction, {
      action: WorldAuditAction.CONTRIBUTION_DELETED,
      actorId: input.authorId,
      metadata: {
        kind: existing.kind,
        targetLoreEntryId: existing.targetLoreEntryId,
      },
      targetId: existing.id,
      targetType: 'CONTRIBUTION_DRAFT',
      worldId: input.worldId,
    });
  });
}

export async function submitContribution(
  database: ContributionDatabase,
  input: {
    worldId: string;
    contributionId: string;
    authorId: string;
  },
) {
  const result = await database.$transaction(async (transaction) => {
    const existing = await transaction.contributionDraft.findFirst({
      include: contributionInclude,
      where: {
        authorId: input.authorId,
        id: input.contributionId,
        worldId: input.worldId,
      },
    });

    if (!existing) {
      throw new ContributionError(404, 'Contribution not found.');
    }

    if (existing.status !== ContributionStatus.DRAFT) {
      if (existing.proposal) {
        return {
          alreadySubmitted: true,
          contribution: existing,
          proposal: existing.proposal,
        };
      }

      throw new ContributionError(409, 'Contribution already submitted.');
    }

    normalizeTitle(existing.title);
    const structuredContent = validateStructuredDocument(existing.content);

    if (!hasMeaningfulText(existing.content)) {
      throw new ContributionError(400, 'Contribution content must include meaningful text.');
    }

    await assertWorldExists(transaction, input.worldId);
    await assertTargetLoreEntry(transaction, input.worldId, existing.targetLoreEntryId);

    const submittedAt = new Date();
    const votingFields = prepareSubmittedProposalVotingFields({
      proposedContent: structuredContent,
      submittedAt,
    });
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
    const transition = await transaction.contributionDraft.updateMany({
      data: {
        status: ContributionStatus.SUBMITTED,
        submittedAt,
      },
      where: {
        authorId: input.authorId,
        id: input.contributionId,
        status: ContributionStatus.DRAFT,
        worldId: input.worldId,
      },
    });

    if (transition.count !== 1) {
      const submitted = await transaction.contributionDraft.findFirst({
        include: contributionInclude,
        where: {
          authorId: input.authorId,
          id: input.contributionId,
          worldId: input.worldId,
        },
      });

      if (submitted?.proposal) {
        return {
          alreadySubmitted: true,
          contribution: submitted,
          proposal: submitted.proposal,
        };
      }

      throw new ContributionError(409, 'Concurrent submission conflict.');
    }

    // Proposal.proposedContent is the immutable reviewer snapshot; submitted
    // drafts are locked so draft endpoints cannot mutate active voting content.
    const proposal = await transaction.proposal.create({
      data: {
        authorId: input.authorId,
        baseCanonVersionId: currentBible?.id ?? null,
        contributionKind: existing.kind,
        contentHash: votingFields.contentHash,
        proposedContent: structuredContent,
        proposalType: proposalTypeForContribution(
          existing.kind,
          Boolean(existing.targetLoreEntryId),
        ),
        status: ProposalStatus.VOTING,
        submittedAt,
        summary: existing.summary ?? '',
        targetLoreEntryId: existing.targetLoreEntryId,
        title: existing.title,
        votingEndsAt: votingFields.votingEndsAt,
        votingStartedAt: votingFields.votingStartedAt,
        worldId: input.worldId,
      },
    });

    const contribution = await transaction.contributionDraft.update({
      data: {
        proposalId: proposal.id,
      },
      include: contributionInclude,
      where: {
        id: existing.id,
      },
    });

    await createContributionAuditLog(transaction, {
      action: WorldAuditAction.PROPOSAL_CREATED,
      actorId: input.authorId,
      metadata: {
        contributionId: contribution.id,
        contributionKind: contribution.kind,
        proposalType: proposal.proposalType,
      },
      targetId: proposal.id,
      targetType: 'PROPOSAL',
      worldId: input.worldId,
    });

    await createContributionAuditLog(transaction, {
      action: WorldAuditAction.CONTRIBUTION_SUBMITTED,
      actorId: input.authorId,
      metadata: {
        proposalId: proposal.id,
      },
      targetId: contribution.id,
      targetType: 'CONTRIBUTION_DRAFT',
      worldId: input.worldId,
    });

    return {
      alreadySubmitted: false,
      contribution,
      proposal,
    };
  });

  return {
    alreadySubmitted: result.alreadySubmitted,
    contribution: serializeContribution(result.contribution),
    proposal: serializeProposal(result.proposal),
  };
}
