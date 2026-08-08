import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { env } from '../config/env.js';
import { ContributionKind, ContributionStatus } from '../generated/prisma/enums.js';
import { requireSession } from '../lib/auth-middleware.js';
import type { SessionVerificationDatabase } from '../lib/auth-sessions.js';
import {
  ContributionError,
  createContribution,
  deleteContribution,
  getOwnedContribution,
  listOwnedContributions,
  submitContribution,
  updateContribution,
  type ContributionDatabase,
} from '../lib/contributions.js';
import { prisma } from '../lib/prisma.js';
import { authorizeWorldPermission } from '../lib/world-authorization.js';
import { WORLD_PERMISSIONS } from '../lib/world-permissions.js';
import type { WorldMembershipLookup } from '../lib/world-authorization.js';

const routeParamsSchema = z.object({
  contributionId: z.string().min(1).optional(),
  worldId: z.string().min(1),
});

const contributionKindSchema = z.enum([ContributionKind.LORE, ContributionKind.STORY]);
const contributionStatusSchema = z.enum([ContributionStatus.DRAFT, ContributionStatus.SUBMITTED]);

const createContributionBodySchema = z
  .object({
    content: z.unknown(),
    kind: contributionKindSchema,
    summary: z.string().trim().max(1_000).optional(),
    targetLoreEntryId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

const updateContributionBodySchema = z
  .object({
    content: z.unknown().optional(),
    kind: contributionKindSchema.optional(),
    summary: z.string().trim().max(1_000).nullable().optional(),
    targetLoreEntryId: z.string().trim().min(1).nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable contribution field is required.',
  });

const listContributionsQuerySchema = z.object({
  kind: contributionKindSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: contributionStatusSchema.optional(),
});

type RegisterContributionRoutesOptions = {
  database?: ContributionDatabase & WorldMembershipLookup & SessionVerificationDatabase;
};

function authOptions(database: SessionVerificationDatabase) {
  return {
    audience: env.AUTH_JWT_AUDIENCE,
    database,
    issuer: env.AUTH_JWT_ISSUER,
    jwtSecret: env.AUTH_JWT_SECRET,
  };
}

function handleContributionError(error: unknown, reply: FastifyReply) {
  if (error instanceof ContributionError) {
    return reply.code(error.statusCode).send({
      error: error.message,
    });
  }

  throw error;
}

async function ensureWorldExists(
  database: Pick<ContributionDatabase, 'world'>,
  worldId: string,
  reply: FastifyReply,
) {
  const world = await database.world.findUnique({
    select: {
      id: true,
    },
    where: {
      id: worldId,
    },
  });

  if (!world) {
    await reply.code(404).send({
      error: 'World not found.',
    });

    return false;
  }

  return true;
}

export async function registerContributionRoutes(
  app: FastifyInstance,
  options: RegisterContributionRoutesOptions = {},
) {
  const database = options.database ?? prisma;

  app.post(
    '/worlds/:worldId/contributions',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const params = routeParamsSchema.safeParse(request.params);
      const body = createContributionBodySchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: 'Invalid contribution payload.',
        });
      }

      const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

      if (!worldExists) {
        return;
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.CREATE_LORE_DRAFT,
        database,
      );

      if (!authorized) {
        return;
      }

      if (!request.user) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      try {
        const contribution = await createContribution(database, {
          ...body.data,
          authorId: request.user.id,
          worldId: params.data.worldId,
        });

        return reply.code(201).send({
          contribution,
        });
      } catch (error) {
        return handleContributionError(error, reply);
      }
    },
  );

  app.get(
    '/worlds/:worldId/contributions',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const params = routeParamsSchema.safeParse(request.params);
      const query = listContributionsQuerySchema.safeParse(request.query);

      if (!params.success || !query.success) {
        return reply.code(400).send({
          error: 'Invalid contributions query.',
        });
      }

      const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

      if (!worldExists) {
        return;
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.CREATE_LORE_DRAFT,
        database,
      );

      if (!authorized) {
        return;
      }

      if (!request.user) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      return listOwnedContributions(database, {
        ...query.data,
        authorId: request.user.id,
        worldId: params.data.worldId,
      });
    },
  );

  app.get(
    '/worlds/:worldId/contributions/:contributionId',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const params = routeParamsSchema.required().safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          error: 'Invalid contribution route.',
        });
      }

      const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

      if (!worldExists) {
        return;
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.CREATE_LORE_DRAFT,
        database,
      );

      if (!authorized) {
        return;
      }

      if (!request.user) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      const contribution = await getOwnedContribution(database, {
        authorId: request.user.id,
        contributionId: params.data.contributionId,
        worldId: params.data.worldId,
      });

      if (!contribution) {
        return reply.code(404).send({
          error: 'Contribution not found.',
        });
      }

      return {
        contribution,
      };
    },
  );

  app.patch(
    '/worlds/:worldId/contributions/:contributionId',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const params = routeParamsSchema.required().safeParse(request.params);
      const body = updateContributionBodySchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: 'Invalid contribution payload.',
        });
      }

      const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

      if (!worldExists) {
        return;
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.EDIT_OWN_DRAFT,
        database,
      );

      if (!authorized) {
        return;
      }

      if (!request.user) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      try {
        const contribution = await updateContribution(database, {
          ...body.data,
          authorId: request.user.id,
          contributionId: params.data.contributionId,
          worldId: params.data.worldId,
        });

        return {
          contribution,
        };
      } catch (error) {
        return handleContributionError(error, reply);
      }
    },
  );

  app.delete(
    '/worlds/:worldId/contributions/:contributionId',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const params = routeParamsSchema.required().safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          error: 'Invalid contribution route.',
        });
      }

      const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

      if (!worldExists) {
        return;
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.EDIT_OWN_DRAFT,
        database,
      );

      if (!authorized) {
        return;
      }

      if (!request.user) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      try {
        await deleteContribution(database, {
          authorId: request.user.id,
          contributionId: params.data.contributionId,
          worldId: params.data.worldId,
        });

        return reply.code(204).send();
      } catch (error) {
        return handleContributionError(error, reply);
      }
    },
  );

  app.post(
    '/worlds/:worldId/contributions/:contributionId/submit',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const params = routeParamsSchema.required().safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          error: 'Invalid contribution route.',
        });
      }

      const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

      if (!worldExists) {
        return;
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

      if (!request.user) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      try {
        const result = await submitContribution(database, {
          authorId: request.user.id,
          contributionId: params.data.contributionId,
          worldId: params.data.worldId,
        });

        return reply.code(result.alreadySubmitted ? 200 : 201).send(result);
      } catch (error) {
        return handleContributionError(error, reply);
      }
    },
  );
}
