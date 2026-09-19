import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { LoreStatus, LoreType, WorldAuditAction } from '../generated/prisma/enums.js';
import { authenticateRequest, requireSession } from '../lib/auth-middleware.js';
import type { SessionVerificationDatabase } from '../lib/auth-sessions.js';
import { prisma } from '../lib/prisma.js';
import { upsertLoreSearchIndex } from '../lib/search-index.js';
import {
  authorizeWorldPermission,
  resolveWorldMembership,
  type WorldMembershipLookup,
} from '../lib/world-authorization.js';
import { roleHasWorldPermission, WORLD_PERMISSIONS } from '../lib/world-permissions.js';

const STRUCTURED_CONTENT_MAX_BYTES = 100 * 1024;
const STRUCTURED_CONTENT_MAX_DEPTH = 32;
const RELATIONSHIP_METADATA_MAX_BYTES = 16 * 1024;
const MAX_RELATIONSHIPS_PER_ENTRY = 100;
const MAX_CROSS_AUTHOR_INBOUND_RELATIONSHIPS_PER_AUTHOR_PER_ENTRY = 50;
const RELATIONSHIP_TRANSACTION_RETRIES = 10;
const RELATIONSHIP_TYPES = [
  'allied_with',
  'enemy_of',
  'member_of',
  'rules',
  'located_in',
  'involved_in',
  'created_by',
  'related_to',
] as const;
const CONTENT_ENTITY_TYPE_BY_LORE_TYPE: Record<LoreType, string> = {
  [LoreType.ARTIFACT]: 'ARTIFACT',
  [LoreType.CHARACTER]: 'CHARACTER',
  [LoreType.EVENT]: 'HISTORICAL_EVENT',
  [LoreType.FACTION]: 'FACTION',
  [LoreType.HISTORY]: 'HISTORY',
  [LoreType.LOCATION]: 'CITY_KINGDOM',
  [LoreType.OTHER]: 'OTHER',
  [LoreType.QUEST]: 'QUEST',
  [LoreType.RULE]: 'RULE',
  [LoreType.STORY]: 'STORY_CONTRIBUTION',
};

type LoreDatabase = Pick<
  PrismaClient,
  | '$transaction'
  | 'loreEntry'
  | 'loreRelationship'
  | 'searchIndex'
  | 'world'
  | 'worldAuditLog'
  | 'worldMembership'
>;

type RegisterLoreRoutesOptions = {
  database?: LoreDatabase & WorldMembershipLookup & SessionVerificationDatabase;
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
  page: z.coerce.number().int().positive().max(100).default(1),
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
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable lore field is required.',
  });

const createRelationshipBodySchema = z
  .object({
    metadata: z.unknown().optional(),
    relationType: z.enum(RELATIONSHIP_TYPES),
    targetId: z.string().trim().min(1),
  })
  .strict();

function visibleRelatedEntryWhere(
  side: 'source' | 'target',
  options: {
    includeAllNonPublicRelations?: boolean;
    viewerId?: string | undefined;
  },
): Prisma.LoreRelationshipWhereInput {
  if (options.includeAllNonPublicRelations) {
    return {};
  }

  const relatedEntryWhere: Prisma.LoreEntryWhereInput = {
    OR: [
      {
        status: LoreStatus.PUBLISHED_CANON,
      },
      ...(options.viewerId
        ? [
            {
              authorId: options.viewerId,
            },
          ]
        : []),
    ],
  };

  return side === 'source' ? { source: relatedEntryWhere } : { target: relatedEntryWhere };
}

function loreEntryInclude(
  options: {
    includeAllNonPublicRelations?: boolean;
    viewerId?: string | undefined;
  } = {},
) {
  const incomingRelationOrderBy: Prisma.LoreRelationshipOrderByWithRelationInput[] = [
    {
      source: {
        publishedAt: {
          sort: 'desc',
          nulls: 'last',
        },
      },
    },
    {
      updatedAt: 'desc',
    },
    {
      id: 'desc',
    },
  ];
  const outgoingRelationOrderBy: Prisma.LoreRelationshipOrderByWithRelationInput[] = [
    {
      target: {
        publishedAt: {
          sort: 'desc',
          nulls: 'last',
        },
      },
    },
    {
      updatedAt: 'desc',
    },
    {
      id: 'desc',
    },
  ];

  return {
    author: {
      select: {
        avatarUrl: true,
        displayName: true,
        hiveUsername: true,
        id: true,
      },
    },
    incomingRelations: {
      orderBy: incomingRelationOrderBy,
      select: {
        id: true,
        relationType: true,
        source: {
          select: {
            authorId: true,
            id: true,
            loreType: true,
            slug: true,
            status: true,
            title: true,
          },
        },
      },
      take: MAX_RELATIONSHIPS_PER_ENTRY,
      where: visibleRelatedEntryWhere('source', options),
    },
    outgoingRelations: {
      orderBy: outgoingRelationOrderBy,
      select: {
        id: true,
        relationType: true,
        target: {
          select: {
            authorId: true,
            id: true,
            loreType: true,
            slug: true,
            status: true,
            title: true,
          },
        },
      },
      take: MAX_RELATIONSHIPS_PER_ENTRY,
      where: visibleRelatedEntryWhere('target', options),
    },
  } satisfies Prisma.LoreEntryInclude;
}

type LoreEntryWithRelations = Prisma.LoreEntryGetPayload<{
  include: ReturnType<typeof loreEntryInclude>;
}>;

function loreEntryListInclude() {
  return {
    author: {
      select: {
        avatarUrl: true,
        displayName: true,
        hiveUsername: true,
        id: true,
      },
    },
  } satisfies Prisma.LoreEntryInclude;
}

type LoreEntryListItem = Prisma.LoreEntryGetPayload<{
  include: ReturnType<typeof loreEntryListInclude>;
}>;

class LoreRouteError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function authOptions(database: SessionVerificationDatabase) {
  return {
    audience: env.AUTH_JWT_AUDIENCE,
    database,
    issuer: env.AUTH_JWT_ISSUER,
    jwtSecret: env.AUTH_JWT_SECRET,
  };
}

function serializeDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

function serializeLoreEntry(
  entry: LoreEntryWithRelations,
  options: {
    includeAllNonPublicRelations?: boolean;
    viewerId?: string | undefined;
  } = {},
) {
  const canShowRelatedEntry = (relatedEntry: { authorId?: string; status: LoreStatus }) =>
    relatedEntry.status === LoreStatus.PUBLISHED_CANON ||
    options.includeAllNonPublicRelations ||
    ('authorId' in relatedEntry && relatedEntry.authorId === options.viewerId);
  const relationshipStatusRank = (status: LoreStatus) =>
    status === LoreStatus.PUBLISHED_CANON ? 0 : 1;

  return {
    author: entry.author,
    authorId: entry.authorId,
    content: entry.content,
    createdAt: entry.createdAt.toISOString(),
    hiveReferenceId: entry.hiveReferenceId,
    id: entry.id,
    incomingRelations: entry.incomingRelations
      .filter((relation) => canShowRelatedEntry(relation.source))
      .sort(
        (left, right) =>
          relationshipStatusRank(left.source.status) - relationshipStatusRank(right.source.status),
      )
      .map((relation) => ({
        id: relation.id,
        relationType: relation.relationType,
        source: {
          id: relation.source.id,
          loreType: relation.source.loreType,
          slug: relation.source.slug,
          status: relation.source.status,
          title: relation.source.title,
        },
      })),
    loreType: entry.loreType,
    outgoingRelations: entry.outgoingRelations
      .filter((relation) => canShowRelatedEntry(relation.target))
      .sort(
        (left, right) =>
          relationshipStatusRank(left.target.status) - relationshipStatusRank(right.target.status),
      )
      .map((relation) => ({
        id: relation.id,
        relationType: relation.relationType,
        target: {
          id: relation.target.id,
          loreType: relation.target.loreType,
          slug: relation.target.slug,
          status: relation.target.status,
          title: relation.target.title,
        },
      })),
    publishedAt: serializeDate(entry.publishedAt),
    slug: entry.slug,
    status: entry.status,
    title: entry.title,
    updatedAt: entry.updatedAt.toISOString(),
    worldId: entry.worldId,
  };
}

function serializeLoreListEntry(entry: LoreEntryListItem) {
  return {
    author: entry.author,
    authorId: entry.authorId,
    content: entry.content,
    createdAt: entry.createdAt.toISOString(),
    hiveReferenceId: entry.hiveReferenceId,
    id: entry.id,
    loreType: entry.loreType,
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

function validateJsonValue(value: unknown, depth = 0): Prisma.InputJsonValue {
  if (depth > STRUCTURED_CONTENT_MAX_DEPTH) {
    throw new LoreRouteError(400, 'Lore content nesting is too deep.');
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value as Prisma.InputJsonValue;
  }

  if (Array.isArray(value)) {
    return value.map((item) => validateJsonValue(item, depth + 1)) as Prisma.InputJsonArray;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        validateJsonValue(nestedValue, depth + 1),
      ]),
    ) as Prisma.InputJsonObject;
  }

  throw new LoreRouteError(400, 'Lore content must be JSON-serializable.');
}

function validateLoreContent(value: unknown, loreType: LoreType): Prisma.InputJsonValue {
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

  const entityType = value.entityType;
  const expectedEntityType = CONTENT_ENTITY_TYPE_BY_LORE_TYPE[loreType];

  if (entityType !== undefined) {
    if (typeof entityType !== 'string') {
      throw new LoreRouteError(400, 'Lore entity type must be a string.');
    }

    if (entityType !== expectedEntityType) {
      throw new LoreRouteError(400, 'Lore entity type must match the lore type.');
    }
  }

  return validateJsonValue(value);
}

function validateRelationshipMetadata(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);

  if (!serialized || Buffer.byteLength(serialized, 'utf8') > RELATIONSHIP_METADATA_MAX_BYTES) {
    throw new LoreRouteError(400, 'Relationship metadata exceeds the 16 KB limit.');
  }

  return validateJsonValue(value);
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

function isPrismaUniqueConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function isPrismaTransactionConflict(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const record = error as {
    cause?: { code?: unknown; kind?: unknown };
    code?: unknown;
  };

  return (
    record.code === 'P2034' ||
    record.code === '40001' ||
    record.code === '40P01' ||
    record.cause?.kind === 'TransactionWriteConflict' ||
    record.cause?.code === '40001' ||
    record.cause?.code === '40P01'
  );
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function relationshipRetryDelay(attempt: number) {
  return 25 * attempt + Math.floor(Math.random() * 25);
}

async function createLoreAuditLog(
  database: Pick<LoreDatabase, 'worldAuditLog'>,
  input: {
    action: (typeof WorldAuditAction)[keyof typeof WorldAuditAction];
    actorId: string;
    metadata?: Prisma.InputJsonObject | undefined;
    targetId: string;
    targetType: string;
    worldId: string;
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

async function authenticateOptional(
  request: FastifyRequest,
  database: SessionVerificationDatabase,
) {
  return authenticateRequest(request, authOptions(database));
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
      includeAllNonPublicRelations: true,
      where: {},
    };
  }

  if (roleHasWorldPermission(membership.role, WORLD_PERMISSIONS.EDIT_OWN_DRAFT)) {
    return {
      allowed: true as const,
      includeAllNonPublicRelations: false,
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

async function canAttemptDraftMutation(
  request: FastifyRequest,
  database: LoreDatabase & WorldMembershipLookup,
  worldId: string,
) {
  const user = request.user;

  if (!user) {
    return false;
  }

  const membership = await resolveWorldMembership(request, worldId, database);

  return Boolean(
    membership &&
    (roleHasWorldPermission(membership.role, WORLD_PERMISSIONS.EDIT_ANY_DRAFT) ||
      roleHasWorldPermission(membership.role, WORLD_PERMISSIONS.EDIT_OWN_DRAFT)),
  );
}

async function canViewAllNonPublicLore(
  request: FastifyRequest,
  database: LoreDatabase & WorldMembershipLookup,
  worldId: string,
) {
  if (!request.user) {
    return false;
  }

  const membership = await resolveWorldMembership(request, worldId, database);

  return Boolean(
    membership && roleHasWorldPermission(membership.role, WORLD_PERMISSIONS.EDIT_ANY_DRAFT),
  );
}

export async function registerLoreRoutes(
  app: FastifyInstance,
  options: RegisterLoreRoutesOptions = {},
) {
  const database = options.database ?? prisma;
  const routeAuthOptions = authOptions(database);

  app.get(
    '/worlds/:worldId/lore',
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
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

      await authenticateOptional(request, database);

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
          include: loreEntryListInclude(),
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
        entries: entries.map((entry) => serializeLoreListEntry(entry)),
        pagination: {
          page,
          pageSize,
          total,
        },
      };
    },
  );

  app.get(
    '/worlds/:worldId/lore/:entryId',
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
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

      await authenticateOptional(request, database);
      const includeAllNonPublicRelations = await canViewAllNonPublicLore(
        request,
        database,
        params.data.worldId,
      );

      const entry = await database.loreEntry.findFirst({
        include: loreEntryInclude({
          includeAllNonPublicRelations,
          viewerId: request.user?.id,
        }),
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

      const canReadEntry = await canReadNonPublicLore(
        request,
        database,
        params.data.worldId,
        entry.authorId,
      );

      if (entry.status !== LoreStatus.PUBLISHED_CANON) {
        if (!canReadEntry) {
          return reply.code(404).send({
            error: 'Lore entry not found.',
          });
        }
      }

      return {
        entry: serializeLoreEntry(entry, {
          includeAllNonPublicRelations,
          viewerId: request.user?.id,
        }),
      };
    },
  );

  app.post(
    '/worlds/:worldId/lore/:entryId/relationships',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
      preHandler: requireSession(routeAuthOptions),
    },
    async (request, reply) => {
      const params = routeParamsSchema.required().safeParse(request.params);
      const body = createRelationshipBodySchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: 'Invalid lore relationship payload.',
        });
      }

      const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

      if (!worldExists || !request.user) {
        return;
      }

      const canAttemptMutation = await canAttemptDraftMutation(
        request,
        database,
        params.data.worldId,
      );

      if (!canAttemptMutation) {
        return reply.code(403).send({
          error: 'Insufficient world permissions.',
        });
      }

      if (params.data.entryId === body.data.targetId) {
        return reply.code(400).send({
          error: 'A lore entry cannot be related to itself.',
        });
      }

      const [source, target] = await Promise.all([
        database.loreEntry.findFirst({
          select: {
            authorId: true,
            id: true,
            status: true,
          },
          where: {
            id: params.data.entryId,
            worldId: params.data.worldId,
          },
        }),
        database.loreEntry.findFirst({
          select: {
            authorId: true,
            id: true,
            status: true,
          },
          where: {
            id: body.data.targetId,
            worldId: params.data.worldId,
          },
        }),
      ]);

      if (!source || !target) {
        return reply.code(404).send({
          error: 'Related lore entry not found.',
        });
      }

      const canReadTarget =
        target.status === LoreStatus.PUBLISHED_CANON ||
        (await canReadNonPublicLore(request, database, params.data.worldId, target.authorId));

      if (!canReadTarget) {
        return reply.code(404).send({
          error: 'Related lore entry not found.',
        });
      }

      const permitted = await canMutateDraft(
        request,
        database,
        params.data.worldId,
        source.authorId,
      );

      if (!permitted) {
        return reply.code(404).send({
          error: 'Lore entry not found.',
        });
      }

      if (
        source.status !== LoreStatus.DRAFT ||
        (target.status !== LoreStatus.DRAFT && target.status !== LoreStatus.PUBLISHED_CANON)
      ) {
        return reply.code(409).send({
          error: 'Draft lore can only link to draft or published canon entries here.',
        });
      }

      for (let attempt = 1; attempt <= RELATIONSHIP_TRANSACTION_RETRIES; attempt += 1) {
        try {
          const relationship = await database.$transaction(
            async (transaction) => {
              const sourceRelationshipCount = await transaction.loreRelationship.count({
                where: {
                  OR: [{ sourceId: source.id }, { targetId: source.id }],
                  worldId: params.data.worldId,
                },
              });

              if (sourceRelationshipCount >= MAX_RELATIONSHIPS_PER_ENTRY) {
                throw new LoreRouteError(409, 'A lore entry has reached the relationship limit.');
              }

              if (source.authorId !== target.authorId) {
                const crossAuthorInboundCount = await transaction.loreRelationship.count({
                  where: {
                    source: {
                      authorId: source.authorId,
                    },
                    target: {
                      authorId: {
                        not: source.authorId,
                      },
                    },
                    targetId: target.id,
                    worldId: params.data.worldId,
                  },
                });

                if (
                  crossAuthorInboundCount >=
                  MAX_CROSS_AUTHOR_INBOUND_RELATIONSHIPS_PER_AUTHOR_PER_ENTRY
                ) {
                  throw new LoreRouteError(
                    409,
                    'This author has reached the cross-author relationship limit for that entry.',
                  );
                }
              }

              const created = await transaction.loreRelationship.create({
                data: {
                  ...(body.data.metadata === undefined
                    ? {}
                    : { metadata: validateRelationshipMetadata(body.data.metadata) }),
                  relationType: body.data.relationType,
                  sourceId: source.id,
                  targetId: target.id,
                  worldId: params.data.worldId,
                },
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
              });

              await transaction.worldAuditLog.create({
                data: {
                  action: WorldAuditAction.LORE_RELATIONSHIP_CREATED,
                  actorId: request.user!.id,
                  metadata: {
                    relationType: created.relationType,
                    sourceId: source.id,
                    targetId: target.id,
                  },
                  targetId: created.id,
                  targetType: 'LORE_RELATIONSHIP',
                  worldId: params.data.worldId,
                },
              });

              return created;
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            },
          );

          return reply.code(201).send({
            relationship,
          });
        } catch (error) {
          if (isPrismaTransactionConflict(error) && attempt < RELATIONSHIP_TRANSACTION_RETRIES) {
            await delay(relationshipRetryDelay(attempt));
            continue;
          }

          if (isPrismaTransactionConflict(error)) {
            return reply.code(409).send({
              error: 'Relationship write conflicted. Please retry.',
            });
          }

          if (isPrismaUniqueConflict(error)) {
            return reply.code(409).send({
              error: 'This lore relationship already exists.',
            });
          }

          return sendLoreError(error, reply);
        }
      }
    },
  );

  app.delete(
    '/worlds/:worldId/lore/:entryId/relationships/:relationshipId',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
      preHandler: requireSession(routeAuthOptions),
    },
    async (request, reply) => {
      const params = z
        .object({
          entryId: z.string().min(1),
          relationshipId: z.string().min(1),
          worldId: z.string().min(1),
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          error: 'Invalid lore relationship route.',
        });
      }

      const worldExists = await ensureWorldExists(database, params.data.worldId, reply);

      if (!worldExists || !request.user) {
        return;
      }

      const canAttemptMutation = await canAttemptDraftMutation(
        request,
        database,
        params.data.worldId,
      );

      if (!canAttemptMutation) {
        return reply.code(403).send({
          error: 'Insufficient world permissions.',
        });
      }

      const relationship = await database.loreRelationship.findFirst({
        include: {
          source: {
            select: {
              authorId: true,
              status: true,
            },
          },
          target: {
            select: {
              status: true,
            },
          },
        },
        where: {
          id: params.data.relationshipId,
          sourceId: params.data.entryId,
          worldId: params.data.worldId,
        },
      });

      if (!relationship) {
        return reply.code(404).send({
          error: 'Lore relationship not found.',
        });
      }

      const permitted = await canMutateDraft(
        request,
        database,
        params.data.worldId,
        relationship.source.authorId,
      );

      if (!permitted) {
        return reply.code(403).send({
          error: 'Insufficient world permissions.',
        });
      }

      if (relationship.source.status !== LoreStatus.DRAFT) {
        return reply.code(409).send({
          error: 'Only relationships owned by draft lore can be deleted here.',
        });
      }

      await database.$transaction(async (transaction) => {
        await transaction.loreRelationship.delete({
          where: {
            id: relationship.id,
          },
        });

        await transaction.worldAuditLog.create({
          data: {
            action: WorldAuditAction.LORE_RELATIONSHIP_DELETED,
            actorId: request.user!.id,
            metadata: {
              relationType: relationship.relationType,
              sourceId: relationship.sourceId,
              targetId: relationship.targetId,
            },
            targetId: relationship.id,
            targetType: 'LORE_RELATIONSHIP',
            worldId: params.data.worldId,
          },
        });
      });

      return reply.code(204).send();
    },
  );

  app.post(
    '/worlds/:worldId/lore',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
      preHandler: requireSession(routeAuthOptions),
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

      const includeAllNonPublicRelations = await canViewAllNonPublicLore(
        request,
        database,
        params.data.worldId,
      );

      try {
        const title = normalizeTitle(body.data.title);
        const content = validateLoreContent(body.data.content, body.data.loreType);
        const slug = await createUniqueSlug(database, params.data.worldId, title);
        const entry = await database.$transaction(async (transaction) => {
          const created = await transaction.loreEntry.create({
            data: {
              authorId: request.user!.id,
              content,
              loreType: body.data.loreType,
              publishedAt: null,
              slug,
              status: LoreStatus.DRAFT,
              title,
              worldId: params.data.worldId,
            },
            include: loreEntryInclude({
              includeAllNonPublicRelations,
              viewerId: request.user!.id,
            }),
          });

          await createLoreAuditLog(transaction, {
            action: WorldAuditAction.LORE_ENTRY_CREATED,
            actorId: request.user!.id,
            metadata: {
              loreType: created.loreType,
              status: created.status,
            },
            targetId: created.id,
            targetType: 'LORE_ENTRY',
            worldId: params.data.worldId,
          });

          await upsertLoreSearchIndex(transaction, created.id);

          return created;
        });

        return reply.code(201).send({
          entry: serializeLoreEntry(entry, {
            includeAllNonPublicRelations,
            viewerId: request.user.id,
          }),
        });
      } catch (error) {
        if (isPrismaUniqueConflict(error)) {
          return reply.code(409).send({
            error: 'A lore entry with this title already exists.',
          });
        }

        return sendLoreError(error, reply);
      }
    },
  );

  app.patch(
    '/worlds/:worldId/lore/:entryId',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
      preHandler: requireSession(routeAuthOptions),
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

      const canAttemptMutation = await canAttemptDraftMutation(
        request,
        database,
        params.data.worldId,
      );

      if (!canAttemptMutation) {
        return reply.code(403).send({
          error: 'Insufficient world permissions.',
        });
      }

      const existing = await database.loreEntry.findFirst({
        select: {
          authorId: true,
          content: true,
          id: true,
          loreType: true,
          status: true,
        },
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

      if (existing.status !== LoreStatus.DRAFT) {
        return reply.code(409).send({
          error: 'Only draft lore entries can be edited here.',
        });
      }

      const includeAllNonPublicRelations = await canViewAllNonPublicLore(
        request,
        database,
        params.data.worldId,
      );

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

        if (body.data.content !== undefined || body.data.loreType !== undefined) {
          const nextLoreType = body.data.loreType ?? existing.loreType;
          const nextContent = body.data.content ?? existing.content;
          const validatedContent = validateLoreContent(nextContent, nextLoreType);

          if (body.data.content !== undefined) {
            data.content = validatedContent;
          }
        }

        const entry = await database.$transaction(async (transaction) => {
          const updated = await transaction.loreEntry.update({
            data,
            include: loreEntryInclude({
              includeAllNonPublicRelations,
              viewerId: request.user!.id,
            }),
            where: {
              id: existing.id,
            },
          });

          await createLoreAuditLog(transaction, {
            action: WorldAuditAction.LORE_ENTRY_UPDATED,
            actorId: request.user!.id,
            metadata: {
              changedFields: Object.keys(data).sort(),
            },
            targetId: updated.id,
            targetType: 'LORE_ENTRY',
            worldId: params.data.worldId,
          });

          await upsertLoreSearchIndex(transaction, updated.id);

          return updated;
        });

        return {
          entry: serializeLoreEntry(entry, {
            includeAllNonPublicRelations,
            viewerId: request.user.id,
          }),
        };
      } catch (error) {
        if (isPrismaUniqueConflict(error)) {
          return reply.code(409).send({
            error: 'A lore entry with this title already exists.',
          });
        }

        return sendLoreError(error, reply);
      }
    },
  );

  app.delete(
    '/worlds/:worldId/lore/:entryId',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
      preHandler: requireSession(routeAuthOptions),
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

      const canAttemptMutation = await canAttemptDraftMutation(
        request,
        database,
        params.data.worldId,
      );

      if (!canAttemptMutation) {
        return reply.code(403).send({
          error: 'Insufficient world permissions.',
        });
      }

      const existing = await database.loreEntry.findFirst({
        select: {
          authorId: true,
          id: true,
          loreType: true,
          status: true,
          title: true,
        },
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

      if (existing.status !== LoreStatus.DRAFT) {
        return reply.code(409).send({
          error: 'Only draft lore entries can be deleted here.',
        });
      }

      await database.$transaction(async (transaction) => {
        await transaction.loreRelationship.deleteMany({
          where: {
            OR: [{ sourceId: existing.id }, { targetId: existing.id }],
            worldId: params.data.worldId,
          },
        });

        await transaction.loreEntry.delete({
          where: {
            id: existing.id,
          },
        });

        await transaction.searchIndex.deleteMany({
          where: {
            entityId: existing.id,
            entityType: 'LORE_ENTRY',
          },
        });

        await createLoreAuditLog(transaction, {
          action: WorldAuditAction.LORE_ENTRY_DELETED,
          actorId: request.user!.id,
          metadata: {
            loreType: existing.loreType,
            title: existing.title,
          },
          targetId: existing.id,
          targetType: 'LORE_ENTRY',
          worldId: params.data.worldId,
        });
      });

      return {
        ok: true,
      };
    },
  );
}
