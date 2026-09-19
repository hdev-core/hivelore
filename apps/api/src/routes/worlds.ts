import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { authenticateRequest, requireSession } from '../lib/auth-middleware.js';
import type { SessionVerificationDatabase } from '../lib/auth-sessions.js';
import { prisma } from '../lib/prisma.js';
import {
  createWorld,
  getWorld,
  getWorldHub,
  listWorlds,
  updateWorld,
  WorldError,
  type WorldDatabase,
  type WorldSeedInput,
} from '../lib/worlds.js';
import { WORLD_PERMISSIONS } from '../lib/world-permissions.js';
import { authorizeWorldPermission } from '../lib/world-authorization.js';
import type { WorldMembershipLookup } from '../lib/world-authorization.js';

const paramsSchema = z.object({
  worldId: z.string().min(1),
});

const stringListSchema = z.array(z.string().trim().min(1).max(120)).max(20);
const WORLD_BIBLE_MAX_BYTES = 100 * 1024;
const WORLD_BIBLE_MAX_DEPTH = 40;

type JsonValidationResult =
  | {
      ok: true;
      value: Prisma.InputJsonValue;
    }
  | {
      ok: false;
      message: string;
    };

function validateJsonValue(value: unknown): JsonValidationResult {
  if (value === null) {
    return {
      message: 'World bible content cannot be null.',
      ok: false,
    };
  }

  const pending: Array<{ value: unknown; depth: number }> = [{ depth: 0, value }];

  while (pending.length > 0) {
    const item = pending.pop()!;

    if (item.depth > WORLD_BIBLE_MAX_DEPTH) {
      return {
        message: 'World bible content exceeds the maximum nesting depth.',
        ok: false,
      };
    }

    if (item.value === null) {
      continue;
    }

    if (typeof item.value === 'string' || typeof item.value === 'boolean') {
      continue;
    }

    if (typeof item.value === 'number') {
      if (!Number.isFinite(item.value)) {
        return {
          message: 'World bible content must be valid JSON.',
          ok: false,
        };
      }

      continue;
    }

    if (Array.isArray(item.value)) {
      for (const child of item.value) {
        pending.push({ depth: item.depth + 1, value: child });
      }

      continue;
    }

    if (typeof item.value === 'object') {
      const prototype = Object.getPrototypeOf(item.value);

      if (prototype !== Object.prototype && prototype !== null) {
        return {
          message: 'World bible content must be valid JSON.',
          ok: false,
        };
      }

      for (const child of Object.values(item.value)) {
        if (child === undefined) {
          return {
            message: 'World bible content must be valid JSON.',
            ok: false,
          };
        }

        pending.push({ depth: item.depth + 1, value: child });
      }

      continue;
    }

    return {
      message: 'World bible content must be valid JSON.',
      ok: false,
    };
  }

  let serialized: string;

  try {
    serialized = JSON.stringify(value);
  } catch {
    return {
      message: 'World bible content must be valid JSON.',
      ok: false,
    };
  }

  if (!serialized || Buffer.byteLength(serialized, 'utf8') > WORLD_BIBLE_MAX_BYTES) {
    return {
      message: 'World bible content exceeds the 100 KB limit.',
      ok: false,
    };
  }

  return {
    ok: true,
    value: value as Prisma.InputJsonValue,
  };
}

const jsonValueSchema = z
  .unknown()
  .superRefine((value, context) => {
    const validation = validateJsonValue(value);

    if (!validation.ok) {
      context.addIssue({
        code: 'custom',
        message: validation.message,
      });
    }
  })
  .transform((value) => value as Prisma.InputJsonValue);

const worldSeedSchema = z.object({
  firstCharacters: stringListSchema.optional(),
  firstFactions: stringListSchema.optional(),
  firstHistoricalEvent: z.string().trim().min(1).max(1_000).optional(),
  genre: z.string().trim().min(1).max(80),
  mainConflict: z.string().trim().min(1).max(2_000),
  premise: z.string().trim().min(1).max(3_000),
  startingLocation: z.string().trim().min(1).max(500).optional(),
  tone: z.string().trim().min(1).max(80),
});

const worldBibleSchema = z.object({
  changeSummary: z.string().trim().min(1).max(500).optional(),
  content: jsonValueSchema,
});

const createWorldSchema = z.object({
  bible: worldBibleSchema,
  description: z.string().trim().min(1).max(1_000),
  seed: worldSeedSchema,
  title: z.string().trim().min(1).max(160),
});

const updateWorldSchema = z
  .object({
    bible: worldBibleSchema.optional(),
    description: z.string().trim().min(1).max(1_000).optional(),
    seed: worldSeedSchema.partial().optional(),
    title: z.string().trim().min(1).max(160).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable world field is required.',
  });

const listWorldsSchema = z.object({
  genre: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().min(1).max(120).optional(),
  tone: z.string().trim().min(1).max(80).optional(),
});

type RegisterWorldRoutesOptions = {
  database?: WorldDatabase & WorldMembershipLookup & SessionVerificationDatabase;
};

function authOptions(database: SessionVerificationDatabase) {
  return {
    audience: env.AUTH_JWT_AUDIENCE,
    database,
    issuer: env.AUTH_JWT_ISSUER,
    jwtSecret: env.AUTH_JWT_SECRET,
  };
}

function handleWorldError(
  error: unknown,
  reply: { code(statusCode: number): { send(body: unknown): unknown } },
) {
  if (error instanceof WorldError) {
    return reply.code(error.statusCode).send({
      error: error.message,
    });
  }

  throw error;
}

export async function registerWorldRoutes(
  app: FastifyInstance,
  options: RegisterWorldRoutesOptions = {},
) {
  const database = options.database ?? prisma;

  app.post(
    '/worlds',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const body = createWorldSchema.safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({
          error: 'Invalid world payload.',
        });
      }

      const authenticatedUser = await authenticateRequest(request, authOptions(database));

      if (!authenticatedUser) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      try {
        const world = await createWorld(database, {
          ...body.data,
          bible: {
            ...body.data.bible,
            content: body.data.bible.content,
          },
          creatorId: authenticatedUser.id,
        });

        return reply.code(201).send({
          world,
        });
      } catch (error) {
        return handleWorldError(error, reply);
      }
    },
  );

  app.get('/worlds', async (request, reply) => {
    const query = listWorldsSchema.safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send({
        error: 'Invalid worlds query.',
      });
    }

    return listWorlds(database, query.data);
  });

  app.get('/worlds/:worldId', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        error: 'Invalid world route.',
      });
    }

    const world = await getWorld(database, params.data.worldId);

    if (!world) {
      return reply.code(404).send({
        error: 'World not found.',
      });
    }

    return {
      world,
    };
  });

  app.get('/worlds/:worldId/hub', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        error: 'Invalid world route.',
      });
    }

    const hub = await getWorldHub(database, params.data.worldId);

    if (!hub) {
      return reply.code(404).send({
        error: 'World not found.',
      });
    }

    return hub;
  });

  app.patch(
    '/worlds/:worldId',
    {
      preHandler: requireSession(authOptions(database)),
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = updateWorldSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: 'Invalid world payload.',
        });
      }

      const authorized = await authorizeWorldPermission(
        request,
        reply,
        params.data.worldId,
        WORLD_PERMISSIONS.EDIT_INITIAL_CANON,
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
        const world = await updateWorld(database, {
          actorId: request.user.id,
          ...(body.data.description ? { description: body.data.description } : {}),
          ...(body.data.seed ? { seed: body.data.seed as Partial<WorldSeedInput> } : {}),
          ...(body.data.title ? { title: body.data.title } : {}),
          ...(body.data.bible
            ? {
                bible: {
                  ...body.data.bible,
                  content: body.data.bible.content,
                },
              }
            : {}),
          worldId: params.data.worldId,
        });

        return {
          world,
        };
      } catch (error) {
        return handleWorldError(error, reply);
      }
    },
  );
}
