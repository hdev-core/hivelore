import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { env } from '../config/env.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { LoreStatus, LoreType } from '../generated/prisma/enums.js';
import { authenticateRequest, requireSession } from '../lib/auth-middleware.js';
import { prisma } from '../lib/prisma.js';
import {
  authorizeWorldPermission,
  resolveWorldMembership,
  type WorldMembershipLookup,
} from '../lib/world-authorization.js';
import { roleHasWorldPermission, WORLD_PERMISSIONS } from '../lib/world-permissions.js';

const STRUCTURED_CONTENT_MAX_BYTES = 100 * 1024;

type LoreDatabase = Pick<PrismaClient, '$transaction' | 'loreEntry' | 'world' | 'worldMembership'>;

type RegisterLoreRoutesOptions = {
  database?: LoreDatabase & WorldMembershipLookup;
};

const routeParamsSchema = z.object({
  entryId: z.string().min(1).optional(),
  worldId: z.string().min(1),
});

const loreTypeSchema = z.enum([
  LoreType.CHARACTER,
  LoreType.LOCATION,
  LoreType.FACTION,
  LoreType.QUEST,
  LoreType.EVENT,
  LoreType.STORY,
  LoreType.ARTIFACT,
  LoreType.HISTORY,
  LoreType.RULE,
  LoreType.OTHER,
]);

const loreStatusSchema = z.enum([
  LoreStatus.DRAFT,
  LoreStatus.SUBMITTED,
  LoreStatus.APPROVED_FOR_PUBLICATION,
  LoreStatus.PUBLISHED_CANON,
  LoreStatus.ARCHIVED,
]);

const listLoreQuerySchema = z.object({
  loreType: loreTypeSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().max(200).optional(),
  status: loreStatusSchema.optional(),
});

const createLoreBodySchema = z
  .object({
    content: z.unknown(),
    loreType: loreTypeSchema,
    status: z.literal(LoreStatus.DRAFT).optional(),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

const updateLoreBodySchema = z
  .object({
    content: z.unknown().optional(),
    loreType: loreTypeSchema.optional(),
    status: z.literal(LoreStatus.DRAFT).optional(),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable lore field is required.',
  });

const loreEntryInclude = {
  author: {
    select: {
      avatarUrl: true,
      displayName: true,
      hiveUsername: true,
      id: true,
    },
  },
  incomingRelations: {
    select: {
      id: true,
      relationType: true,
      source: {
        select: {
          id: true,
          loreType: true,
          slug: true,
          status: true,
          title: true,
        },
      },
    },
  },
  outgoingRelations: {
    select: {
      id: true,
      relationType: true,
      target: {
        select: {
          id: true,
          loreType: true,
          slug: true,
          status: true,
          title: true,
        },
      },
    },
  },
} as const;

type LoreEntryWithRelations = Prisma.LoreEntryGetPayload<{
  include: typeof loreEntryInclude;
}>;

class LoreRouteError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function authOptions() {
  return {
    audience: env.AUTH_JWT_AUDIENCE,
    issuer: env.AUTH_JWT_ISSUER,
    jwtSecret: env.AUTH_JWT_SECRET,
  };
}

function serializeDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

function serializeLoreEntry(entry: LoreEntryWithRelations) {
  return {
    author: entry.author,
    authorId: entry.authorId,
    content: entry.content,
    createdAt: entry.createdAt.toISOString(),
    hiveReferenceId: entry.hiveReferenceId,
    id: entry.id,
    incomingRelations: entry.incomingRelations,
    loreType: entry.loreType,
    outgoingRelations: entry.outgoingRelations,
    publishedAt: serializeDate(entry.publishedAt),
    slug: entry.slug,
    status: entry.status,
    title: entry.title,
    updatedAt: entry.updatedAt.toISOString(),
    worldId: entry.worldId,
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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeStructuredContent(value: unknown): Prisma.InputJsonValue {
  if (typeof value === 'string') {
    return escapeHtml(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeStructuredContent) as Prisma.InputJsonArray;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sanitizeStructuredContent(nestedValue),
      ]),
    ) as Prisma.InputJsonObject;
  }

  if (value === null) {
    return value as unknown as Prisma.InputJsonValue;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  throw new LoreRouteError(400, 'Lore content must be JSON-serializable.');
}

function validateLoreContent(value: unknown) {
  if (!isPlainObject(value)) {
    throw new LoreRouteError(400, 'Lore content must be a JSON object.');
  }

  const serialized = JSON.stringify(value);

  if (!serialized || Buffer.byteLength(serialized, 'utf8') > STRUCTURED_CONTENT_MAX_BYTES) {
    throw new LoreRouteError(400, 'Lore content exceeds the 100 KB limit.');
  }

  const summary = value.summary;

  if (summary !== undefined && (typeof summary !== 'string' || summary.trim().length > 1_000)) {
    throw new LoreRouteError(400, 'Lore summary must be at most 1000 characters.');
  }

  const body = value.body;

  if (body !== undefined && typeof body !== 'string') {
    throw new LoreRouteError(400, 'Lore body must be a string.');
  }

  return sanitizeStructuredContent(value);
}

function normalizeTitle(title: string) {
  const normalized = title.trim();

  if (!normalized) {
    throw new LoreRouteError(400, 'Lore title is required.');
  }

  if (normalized.length > 200) {
    throw new LoreRouteError(400, 'Lore title must be at most 200 characters.');
  }

  return normalized;
}

function slugify(title: string) {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'lore-entry';
}

async function createUniqueSlug(
  database: Pick<LoreDatabase, 'loreEntry'>,
  worldId: string,
  title: string,
  excludeEntryId?: string,
) {
  const baseSlug = slugify(title);

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const existing = await database.loreEntry.findFirst({
      select: {
        id: true,
      },
      where: {
        slug,
        worldId,
      },
    });

    if (!existing || existing.id === excludeEntryId) {
      return slug;
    }
  }

  throw new LoreRouteError(409, 'Unable to generate a unique lore slug.');
}

async function ensureWorldExists(
  database: Pick<LoreDatabase, 'world'>,
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

function sendLoreError(error: unknown, reply: FastifyReply) {
  if (error instanceof LoreRouteError) {
    return reply.code(error.statusCode).send({
      error: error.message,
    });
  }

  throw error;
}

async function authenticateOptional(request: FastifyRequest) {
  return authenticateRequest(request, authOptions());
}

async function canReadNonPublicLore(
  request: FastifyRequest,
  database: LoreDatabase & WorldMembershipLookup,
  worldId: string,
  authorId?: string,
) {
  const user = request.user;

  if (!user) {
    return false;
  }

  const membership = await resolveWorldMembership(request, worldId, database);

  if (!membership) {
    return false;
  }

  if (roleHasWorldPermission(membership.role, WORLD_PERMISSIONS.EDIT_ANY_DRAFT)) {
    return true;
  }

  return (
    authorId === user.id &&
    roleHasWorldPermission(membership.role, WORLD_PERMISSIONS.EDIT_OWN_DRAFT)
  );
}

async function scopeNonPublicLoreList(
  request: FastifyRequest,
  database: LoreDatabase & WorldMembershipLookup,
  worldId: string,
) {
  const user = request.user;

  if (!user) {
    return {
      allowed: false as const,
      statusCode: 401 as const,
      where: {},
    };
  }

  const membership = await resolveWorldMembership(request, worldId, database);

  if (!membership) {
    return {
      allowed: false as const,
      statusCode: 403 as const,
      where: {},
    };
  }

  if (roleHasWorldPermission(membership.role, WORLD_PERMISSIONS.EDIT_ANY_DRAFT)) {
    return {
      allowed: true as const,
      where: {},
    };
  }

  if (roleHasWorldPermission(membership.role, WORLD_PERMISSIONS.EDIT_OWN_DRAFT)) {
    return {
      allowed: true as const,
      where: {
        authorId: user.id,
      },
    };
  }

  return {
    allowed: false as const,
    statusCode: 403 as const,
    where: {},
  };
}

async function canMutateDraft(
  request: FastifyRequest,
  database: LoreDatabase & WorldMembershipLookup,
  worldId: string,
  authorId: string,
) {
  const user = request.user;

  if (!user) {
    return false;
  }

  const membership = await resolveWorldMembership(request, worldId, database);

  if (!membership) {
    return false;
  }

  if (roleHasWorldPermission(membership.role, WORLD_PERMISSIONS.EDIT_ANY_DRAFT)) {
    return true;
  }

  return (
    authorId === user.id &&
    roleHasWorldPermission(membership.role, WORLD_PERMISSIONS.EDIT_OWN_DRAFT)
  );
}

export async function registerLoreRoutes(
  app: FastifyInstance,
  options: RegisterLoreRoutesOptions = {},
) {
  const database = options.database ?? prisma;

  app.get('/worlds/:worldId/lore', async (request, reply) => {
    const params = routeParamsSchema.safeParse(request.params);
    const query = listLoreQuerySchema.safeParse(request.query);

    if (!params.success || !query.success) {
      return reply.code(400).send({
        error: 'Invalid lore query.',
      });
    }

    const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

    if (!worldExists) {
      return;
    }

    await authenticateOptional(request);

    const requestedStatus = query.data.status ?? LoreStatus.PUBLISHED_CANON;
    const page = query.data.page;
    const pageSize = query.data.pageSize;
    const where: Prisma.LoreEntryWhereInput = {
      ...(query.data.loreType ? { loreType: query.data.loreType } : {}),
      ...(query.data.q
        ? {
            OR: [
              {
                title: {
                  contains: query.data.q,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      status: requestedStatus,
      worldId: params.data.worldId,
    };

    if (requestedStatus !== LoreStatus.PUBLISHED_CANON) {
      const scope = await scopeNonPublicLoreList(request, database, params.data.worldId);

      if (!scope.allowed) {
        return reply.code(scope.statusCode).send({
          error:
            scope.statusCode === 401
              ? 'Authentication required.'
              : 'Insufficient world permissions.',
        });
      }

      Object.assign(where, scope.where);
    }

    const [entries, total] = await Promise.all([
      database.loreEntry.findMany({
        include: loreEntryInclude,
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
      database.loreEntry.count({
        where,
      }),
    ]);

    return {
      entries: entries.map(serializeLoreEntry),
      pagination: {
        page,
        pageSize,
        total,
      },
    };
  });

  app.get('/worlds/:worldId/lore/:entryId', async (request, reply) => {
    const params = routeParamsSchema.required().safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({
        error: 'Invalid lore route.',
      });
    }

    const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

    if (!worldExists) {
      return;
    }

    await authenticateOptional(request);

    const entry = await database.loreEntry.findFirst({
      include: loreEntryInclude,
      where: {
        id: params.data.entryId,
        worldId: params.data.worldId,
      },
    });

    if (!entry) {
      return reply.code(404).send({
        error: 'Lore entry not found.',
      });
    }

    if (entry.status !== LoreStatus.PUBLISHED_CANON) {
      const permitted = await canReadNonPublicLore(
        request,
        database,
        params.data.worldId,
        entry.authorId,
      );

      if (!permitted) {
        return reply.code(404).send({
          error: 'Lore entry not found.',
        });
      }
    }

    return {
      entry: serializeLoreEntry(entry),
    };
  });

  app.post(
    '/worlds/:worldId/lore',
    {
      preHandler: requireSession(authOptions()),
    },
    async (request, reply) => {
      const params = routeParamsSchema.safeParse(request.params);
      const body = createLoreBodySchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: 'Invalid lore payload.',
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

      if (!authorized || !request.user) {
        return;
      }

      try {
        const title = normalizeTitle(body.data.title);
        const content = validateLoreContent(body.data.content);
        const slug = await createUniqueSlug(database, params.data.worldId, title);
        const entry = await database.loreEntry.create({
          data: {
            authorId: request.user.id,
            content,
            loreType: body.data.loreType,
            publishedAt: null,
            slug,
            status: LoreStatus.DRAFT,
            title,
            worldId: params.data.worldId,
          },
          include: loreEntryInclude,
        });

        return reply.code(201).send({
          entry: serializeLoreEntry(entry),
        });
      } catch (error) {
        return sendLoreError(error, reply);
      }
    },
  );

  app.patch(
    '/worlds/:worldId/lore/:entryId',
    {
      preHandler: requireSession(authOptions()),
    },
    async (request, reply) => {
      const params = routeParamsSchema.required().safeParse(request.params);
      const body = updateLoreBodySchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: 'Invalid lore payload.',
        });
      }

      const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

      if (!worldExists || !request.user) {
        return;
      }

      const existing = await database.loreEntry.findFirst({
        include: loreEntryInclude,
        where: {
          id: params.data.entryId,
          worldId: params.data.worldId,
        },
      });

      if (!existing) {
        return reply.code(404).send({
          error: 'Lore entry not found.',
        });
      }

      if (existing.status !== LoreStatus.DRAFT) {
        return reply.code(409).send({
          error: 'Only draft lore entries can be edited here.',
        });
      }

      const permitted = await canMutateDraft(
        request,
        database,
        params.data.worldId,
        existing.authorId,
      );

      if (!permitted) {
        return reply.code(403).send({
          error: 'Insufficient world permissions.',
        });
      }

      try {
        const data: Prisma.LoreEntryUpdateInput = {};

        if (body.data.title !== undefined) {
          const title = normalizeTitle(body.data.title);
          data.title = title;
          data.slug = await createUniqueSlug(database, params.data.worldId, title, existing.id);
        }

        if (body.data.loreType !== undefined) {
          data.loreType = body.data.loreType;
        }

        if (body.data.content !== undefined) {
          data.content = validateLoreContent(body.data.content);
        }

        const entry = await database.loreEntry.update({
          data,
          include: loreEntryInclude,
          where: {
            id: existing.id,
          },
        });

        return {
          entry: serializeLoreEntry(entry),
        };
      } catch (error) {
        return sendLoreError(error, reply);
      }
    },
  );

  app.delete(
    '/worlds/:worldId/lore/:entryId',
    {
      preHandler: requireSession(authOptions()),
    },
    async (request, reply) => {
      const params = routeParamsSchema.required().safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          error: 'Invalid lore route.',
        });
      }

      const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

      if (!worldExists || !request.user) {
        return;
      }

      const existing = await database.loreEntry.findFirst({
        include: loreEntryInclude,
        where: {
          id: params.data.entryId,
          worldId: params.data.worldId,
        },
      });

      if (!existing) {
        return reply.code(404).send({
          error: 'Lore entry not found.',
        });
      }

      if (existing.status !== LoreStatus.DRAFT) {
        return reply.code(409).send({
          error: 'Only draft lore entries can be deleted here.',
        });
      }

      const permitted = await canMutateDraft(
        request,
        database,
        params.data.worldId,
        existing.authorId,
      );

      if (!permitted) {
        return reply.code(403).send({
          error: 'Insufficient world permissions.',
        });
      }

      await database.loreEntry.delete({
        where: {
          id: existing.id,
        },
      });

      return {
        ok: true,
      };
    },
  );
}
