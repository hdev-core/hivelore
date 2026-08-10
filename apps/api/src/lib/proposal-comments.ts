import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

export const PROPOSAL_COMMENT_MAX_LENGTH = 3000;
export const PROPOSAL_COMMENT_DEFAULT_PAGE_SIZE = 20;
export const PROPOSAL_COMMENT_MAX_PAGE_SIZE = 50;

export class ProposalCommentError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ProposalCommentDatabase = PrismaClient;

type CommentCursor = {
  createdAt: string;
  id: string;
};

type CommentWithAuthor = Prisma.ProposalCommentGetPayload<{
  include: {
    author: {
      select: {
        avatarUrl: true;
        displayName: true;
        hiveUsername: true;
        id: true;
      };
    };
  };
}>;

function encodeCursor(cursor: CommentCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeProposalCommentCursor(cursor: string): CommentCursor {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<CommentCursor>;

    if (
      typeof decoded.id !== 'string' ||
      !decoded.id ||
      typeof decoded.createdAt !== 'string' ||
      Number.isNaN(Date.parse(decoded.createdAt))
    ) {
      throw new Error('Invalid cursor payload.');
    }

    return {
      createdAt: decoded.createdAt,
      id: decoded.id,
    };
  } catch {
    throw new ProposalCommentError(400, 'INVALID_COMMENT_CURSOR', 'Invalid comment cursor.');
  }
}

export function normalizeProposalCommentBody(body: string) {
  const normalized = body.trim();

  if (!normalized) {
    throw new ProposalCommentError(400, 'COMMENT_BODY_EMPTY', 'Comment body is required.');
  }

  if (normalized.length > PROPOSAL_COMMENT_MAX_LENGTH) {
    throw new ProposalCommentError(
      400,
      'COMMENT_BODY_TOO_LONG',
      `Comment body must be ${PROPOSAL_COMMENT_MAX_LENGTH} characters or fewer.`,
    );
  }

  return normalized;
}

function normalizePageSize(pageSize: number | undefined) {
  if (!pageSize) {
    return PROPOSAL_COMMENT_DEFAULT_PAGE_SIZE;
  }

  return Math.min(pageSize, PROPOSAL_COMMENT_MAX_PAGE_SIZE);
}

function serializeComment(comment: CommentWithAuthor) {
  const isDeleted = Boolean(comment.deletedAt);

  return {
    author: {
      avatarUrl: comment.author.avatarUrl,
      displayName: comment.author.displayName,
      hiveUsername: comment.author.hiveUsername,
      id: comment.author.id,
    },
    authorId: comment.authorId,
    body: isDeleted ? null : comment.body,
    createdAt: comment.createdAt.toISOString(),
    deletedAt: comment.deletedAt?.toISOString() ?? null,
    id: comment.id,
    isDeleted,
    proposalId: comment.proposalId,
  };
}

async function assertProposalInWorld(
  database: ProposalCommentDatabase,
  input: { proposalId: string; worldId: string },
) {
  const proposal = await database.proposal.findFirst({
    select: {
      id: true,
    },
    where: {
      id: input.proposalId,
      worldId: input.worldId,
    },
  });

  if (!proposal) {
    throw new ProposalCommentError(404, 'PROPOSAL_NOT_FOUND', 'Proposal not found.');
  }
}

export async function listProposalComments(
  database: ProposalCommentDatabase,
  input: {
    cursor?: string | undefined;
    pageSize?: number | undefined;
    proposalId: string;
    worldId: string;
  },
) {
  await assertProposalInWorld(database, input);

  const pageSize = normalizePageSize(input.pageSize);
  const cursor = input.cursor ? decodeProposalCommentCursor(input.cursor) : null;
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  const where: Prisma.ProposalCommentWhereInput = {
    proposalId: input.proposalId,
    ...(cursor && cursorDate
      ? {
          OR: [
            {
              createdAt: {
                gt: cursorDate,
              },
            },
            {
              createdAt: cursorDate,
              id: {
                gt: cursor.id,
              },
            },
          ],
        }
      : {}),
  };
  const [comments, commentCount] = await Promise.all([
    database.proposalComment.findMany({
      include: {
        author: {
          select: {
            avatarUrl: true,
            displayName: true,
            hiveUsername: true,
            id: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: pageSize + 1,
      where,
    }),
    database.proposalComment.count({
      where: {
        deletedAt: null,
        proposalId: input.proposalId,
      },
    }),
  ]);

  const page = comments.slice(0, pageSize);
  const last = page.at(-1);
  const hasMore = comments.length > pageSize;

  return {
    comments: page.map(serializeComment),
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
            })
          : null,
    },
    totalCount: commentCount,
  };
}

export async function createProposalComment(
  database: ProposalCommentDatabase,
  input: { authorId: string; body: string; proposalId: string; worldId: string },
) {
  const body = normalizeProposalCommentBody(input.body);

  await assertProposalInWorld(database, input);

  const comment = await database.proposalComment.create({
    data: {
      authorId: input.authorId,
      body,
      proposalId: input.proposalId,
    },
    include: {
      author: {
        select: {
          avatarUrl: true,
          displayName: true,
          hiveUsername: true,
          id: true,
        },
      },
    },
  });

  return {
    comment: serializeComment(comment),
  };
}
