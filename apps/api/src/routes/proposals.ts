import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { env } from '../config/env.js';
import { authenticateRequest, requireSession } from '../lib/auth-middleware.js';
import {
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
import { authorizeWorldPermission } from '../lib/world-authorization.js';
import type { WorldMembershipLookup } from '../lib/world-authorization.js';
import { WORLD_PERMISSIONS } from '../lib/world-permissions.js';

const paramsSchema = z.object({
  proposalId: z.string().min(1),
  worldId: z.string().min(1),
});

const voteBodySchema = z
  .object({
    choice: z.enum(['APPROVE', 'REJECT', 'NEEDS_REVISION', 'ALTERNATE_TIMELINE']),
  })
  .strict();

const confirmBodySchema = z
  .object({
    blockNumber: z.coerce.number().int().positive(),
    operationIndex: z.coerce.number().int().nonnegative(),
    transactionId: z.string().trim().min(1).max(128),
  })
  .strict();

type RegisterProposalRoutesOptions = {
  database?: typeof prisma & WorldMembershipLookup;
  hafClient?: HafClient;
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

export async function registerProposalRoutes(
  app: FastifyInstance,
  options: RegisterProposalRoutesOptions = {},
) {
  const database = options.database ?? prisma;
  const hafClient = options.hafClient ?? new HafClient({ baseUrl: env.HAF_API_URL });

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
        currentUserId: currentUser?.id,
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
      return getVoteSummary(database, params.data);
    } catch (error) {
      return handleCanonVotingError(error, reply);
    }
  });

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
        return castCanonVote(database, {
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
        return finalizeCanonDecision(database, {
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

      try {
        return createCanonTransactionOperation(database, {
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
      preHandler: requireSession(authOptions(database)),
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

      try {
        return confirmCanonTransaction(database, {
          ...body.data,
          hafClient,
          proposalId: params.data.proposalId,
          worldId: params.data.worldId,
        });
      } catch (error) {
        return handleCanonVotingError(error, reply);
      }
    },
  );
}
