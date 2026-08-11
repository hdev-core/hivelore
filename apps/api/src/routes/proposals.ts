import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { env } from '../config/env.js';
import { authenticateRequest, requireSession } from '../lib/auth-middleware.js';
import {
  acknowledgeProposalAiWarning,
  CanonVotingError,
  castCanonVote,
  confirmCanonTransaction,
  createCanonTransactionOperation,
  finalizeCanonDecision,
  getProposalDetail,
  getVoteSummary,
} from '../lib/canon-voting.js';
import { HafClient } from '../lib/hive/haf-client.js';
import { prisma } from '../lib/prisma.js';
import {
  createProposalComment,
  listProposalComments,
  ProposalCommentError,
  PROPOSAL_COMMENT_MAX_LENGTH,
} from '../lib/proposal-comments.js';
import { authorizeWorldPermission } from '../lib/world-authorization.js';
import type { WorldMembershipLookup } from '../lib/world-authorization.js';
import { WORLD_PERMISSIONS } from '../lib/world-permissions.js';
import { createHiveReliableBroadcaster } from '../lib/hive/client.js';
import type { HiveReliableBroadcaster } from '../lib/hive/broadcast-reliability.js';

const paramsSchema = z.object({
  proposalId: z.string().min(1),
  worldId: z.string().min(1),
});

const voteBodySchema = z
  .object({
    choice: z.enum(['APPROVE', 'REJECT', 'NEEDS_REVISION', 'ALTERNATE_TIMELINE']),
  })
  .strict();

const commentsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const commentBodySchema = z
  .object({
    body: z.string().max(PROPOSAL_COMMENT_MAX_LENGTH + 1),
  })
  .strict();

const confirmBodySchema = z
  .object({
    blockNumber: z.coerce.number().int().positive().optional(),
    operationIndex: z.coerce.number().int().nonnegative().optional(),
    transactionId: z.string().trim().min(1).max(128),
  })
  .strict();

type RegisterProposalRoutesOptions = {
  database?: typeof prisma & WorldMembershipLookup;
  hafClient?: HafClient;
  hiveBroadcaster?: HiveReliableBroadcaster;
};

function authOptions(database: typeof prisma) {
  return {
    audience: env.AUTH_JWT_AUDIENCE,
    database,
    issuer: env.AUTH_JWT_ISSUER,
    jwtSecret: env.AUTH_JWT_SECRET,
  };
}

function handleCanonVotingError(error: unknown, reply: FastifyReply) {
  if (error instanceof CanonVotingError) {
    return reply.code(error.statusCode).send({
      code: error.code,
      error: error.message,
    });
  }

  throw error;
}

function handleProposalCommentError(error: unknown, reply: FastifyReply) {
  if (error instanceof ProposalCommentError) {
    return reply.code(error.statusCode).send({
      code: error.code,
      error: error.message,
    });
  }

  throw error;
}

function proposalCommentRateLimitOptions(database: typeof prisma) {
  return {
    cache: env.PROPOSAL_COMMENT_WRITE_RATE_LIMIT_CACHE,
    errorResponseBuilder: () => ({
      code: 'COMMENT_RATE_LIMITED',
      error: 'Too many proposal comments. Try again later.',
      statusCode: 429,
    }),
    keyGenerator: async (request: FastifyRequest) => {
      const user = await authenticateRequest(request, authOptions(database));

      return user ? `proposal-comments:user:${user.id}` : `proposal-comments:ip:${request.ip}`;
    },
    max: env.PROPOSAL_COMMENT_WRITE_RATE_LIMIT_MAX,
    timeWindow: `${env.PROPOSAL_COMMENT_WRITE_RATE_LIMIT_WINDOW_SECONDS} seconds`,
  };
}

function canonTransactionConfirmRateLimitOptions(database: typeof prisma) {
  return {
    cache: env.PROPOSAL_COMMENT_WRITE_RATE_LIMIT_CACHE,
    errorResponseBuilder: () => ({
      code: 'CANON_TRANSACTION_CONFIRM_RATE_LIMITED',
      error: 'Too many canon transaction confirmations. Try again later.',
      statusCode: 429,
    }),
    keyGenerator: async (request: FastifyRequest) => {
      const user = await authenticateRequest(request, authOptions(database));

      return user ? `canon-confirm:user:${user.id}` : `canon-confirm:ip:${request.ip}`;
    },
    max: 3,
    timeWindow: '60 seconds',
  };
}

export async function registerProposalRoutes(
  app: FastifyInstance,
  options: RegisterProposalRoutesOptions = {},
) {
  const database = options.database ?? prisma;
  const hafClient = options.hafClient ?? new HafClient({ baseUrl: env.HAF_API_URL });
  const hiveBroadcaster = options.hiveBroadcaster ?? createHiveReliableBroadcaster();

  app.get('/worlds/:worldId/proposals/:proposalId', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        code: 'INVALID_PROPOSAL_ROUTE',
        error: 'Invalid proposal route.',
      });
    }

    const currentUser = await authenticateRequest(request, authOptions(database));

    try {
      const proposal = await getProposalDetail(database, {
        ...(currentUser ? { currentUserId: currentUser.id } : {}),
        proposalId: params.data.proposalId,
        worldId: params.data.worldId,
      });

      return {
        proposal,
      };
    } catch (error) {
      return handleCanonVotingError(error, reply);
    }
  });

  app.get('/worlds/:worldId/proposals/:proposalId/votes/summary', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        code: 'INVALID_PROPOSAL_ROUTE',
        error: 'Invalid proposal route.',
      });
    }

    try {
      return await getVoteSummary(database, params.data);
    } catch (error) {
      return handleCanonVotingError(error, reply);
    }
  });

  app.get('/worlds/:worldId/proposals/:proposalId/comments', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const query = commentsQuerySchema.safeParse(request.query);

    if (!params.success || !query.success) {
      return reply.code(400).send({
        code: 'INVALID_COMMENT_QUERY',
        error: 'Invalid comment query.',
      });
    }

    try {
      return await listProposalComments(database, {
        cursor: query.data.cursor,
        pageSize: query.data.pageSize,
        proposalId: params.data.proposalId,
        worldId: params.data.worldId,
      });
    } catch (error) {
      return handleProposalCommentError(error, reply);
    }
  });

  app.post(
    '/worlds/:worldId/proposals/:proposalId/comments',
    {
      preHandler: [
        app.rateLimit(proposalCommentRateLimitOptions(database)),
        requireSession(authOptions(database)),
      ],
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = commentBodySchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          code: 'INVALID_COMMENT_PAYLOAD',
          error: 'Invalid comment payload.',
        });
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.VOTE_ON_PROPOSAL,
        database,
      );

      if (!authorized || !request.user) {
        return;
      }

      try {
        const result = await createProposalComment(database, {
          authorId: request.user.id,
          body: body.data.body,
          proposalId: params.data.proposalId,
          worldId: params.data.worldId,
        });

        return reply.code(201).send(result);
      } catch (error) {
        return handleProposalCommentError(error, reply);
      }
    },
  );

  app.post(
    '/worlds/:worldId/proposals/:proposalId/votes',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = voteBodySchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          code: 'INVALID_VOTE_PAYLOAD',
          error: 'Invalid vote payload.',
        });
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.VOTE_ON_PROPOSAL,
        database,
      );

      if (!authorized || !request.user) {
        return;
      }

      try {
        return await castCanonVote(database, {
          choice: body.data.choice,
          proposalId: params.data.proposalId,
          voterId: request.user.id,
          worldId: params.data.worldId,
        });
      } catch (error) {
        return handleCanonVotingError(error, reply);
      }
    },
  );

  app.post(
    '/worlds/:worldId/proposals/:proposalId/ai-warning/acknowledge',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          code: 'INVALID_PROPOSAL_ROUTE',
          error: 'Invalid proposal route.',
        });
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.COMMENT_ON_AI_WARNING,
        database,
      );

      if (!authorized || !request.user) {
        return;
      }

      try {
        return await acknowledgeProposalAiWarning(database, {
          actorId: request.user.id,
          proposalId: params.data.proposalId,
          worldId: params.data.worldId,
        });
      } catch (error) {
        return handleCanonVotingError(error, reply);
      }
    },
  );

  app.post(
    '/worlds/:worldId/proposals/:proposalId/finalize',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          code: 'INVALID_PROPOSAL_ROUTE',
          error: 'Invalid proposal route.',
        });
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.EXECUTE_CANON_STATUS_AFTER_THRESHOLD,
        database,
      );

      if (!authorized || !request.user) {
        return;
      }

      try {
        return await finalizeCanonDecision(database, {
          actorId: request.user.id,
          proposalId: params.data.proposalId,
          worldId: params.data.worldId,
        });
      } catch (error) {
        return handleCanonVotingError(error, reply);
      }
    },
  );

  app.post(
    '/worlds/:worldId/proposals/:proposalId/canon-transaction',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          code: 'INVALID_PROPOSAL_ROUTE',
          error: 'Invalid proposal route.',
        });
      }

      if (!request.user) {
        return reply.code(401).send({
          code: 'AUTHENTICATION_REQUIRED',
          error: 'Authentication required.',
        });
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
        database,
      );

      if (!authorized) {
        return;
      }

      try {
        return await createCanonTransactionOperation(database, {
          proposalId: params.data.proposalId,
          signerId: request.user.id,
          worldId: params.data.worldId,
        });
      } catch (error) {
        return handleCanonVotingError(error, reply);
      }
    },
  );

  app.post(
    '/worlds/:worldId/proposals/:proposalId/canon-transaction/confirm',
    {
      preHandler: [
        app.rateLimit(canonTransactionConfirmRateLimitOptions(database)),
        requireSession(authOptions(database)),
      ],
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = confirmBodySchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          code: 'INVALID_CONFIRMATION_PAYLOAD',
          error: 'Invalid canon transaction confirmation payload.',
        });
      }

      if (!request.user) {
        return reply.code(401).send({
          code: 'AUTHENTICATION_REQUIRED',
          error: 'Authentication required.',
        });
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
        database,
      );

      if (!authorized) {
        return;
      }

      try {
        return await confirmCanonTransaction(database, {
          ...body.data,
          hafClient,
          hiveBroadcaster,
          proposalId: params.data.proposalId,
          worldId: params.data.worldId,
        });
      } catch (error) {
        return handleCanonVotingError(error, reply);
      }
    },
  );
}
