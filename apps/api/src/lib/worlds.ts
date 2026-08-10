import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  LoreStatus,
  ProposalStatus,
  WorldAuditAction,
  WorldRole,
} from '../generated/prisma/enums.js';
import { mapWorldSlugConflict } from './prisma-conflicts.js';

export type WorldSeedInput = {
  premise: string;
  genre: string;
  tone: string;
  mainConflict: string;
  startingLocation?: string | undefined;
  firstCharacters?: string[] | undefined;
  firstFactions?: string[] | undefined;
  firstHistoricalEvent?: string | undefined;
};

export type WorldBibleInput = {
  content: Prisma.InputJsonValue;
  changeSummary?: string | undefined;
};

export type CreateWorldInput = {
  creatorId: string;
  title: string;
  description: string;
  seed: WorldSeedInput;
  bible: WorldBibleInput;
};

export type UpdateWorldInput = {
  worldId: string;
  actorId: string;
  title?: string | undefined;
  description?: string | undefined;
  seed?: Partial<WorldSeedInput> | undefined;
  bible?: WorldBibleInput | undefined;
};

export type WorldDatabase = Pick<
  PrismaClient,
  | '$transaction'
  | 'loreEntry'
  | 'proposal'
  | 'refreshSession'
  | 'world'
  | 'worldAuditLog'
  | 'worldBibleVersion'
  | 'worldMembership'
  | 'worldSeed'
>;

export class WorldError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

const worldInclude = {
  bibleVersions: {
    orderBy: {
      versionNumber: 'desc',
    },
    take: 1,
  },
  founder: {
    select: {
      avatarUrl: true,
      displayName: true,
      hiveUsername: true,
      id: true,
      normalizedHiveUsername: true,
    },
  },
  seed: true,
} as const;

const worldListInclude = {
  bibleVersions: {
    orderBy: {
      versionNumber: 'desc',
    },
    select: {
      changeSummary: true,
      createdAt: true,
      creatorId: true,
      hiveReferenceId: true,
      id: true,
      publishedAt: true,
      updatedAt: true,
      versionNumber: true,
    },
    take: 1,
  },
  founder: {
    select: {
      avatarUrl: true,
      displayName: true,
      hiveUsername: true,
      id: true,
      normalizedHiveUsername: true,
    },
  },
  seed: true,
} as const;

type WorldWithRelations = Prisma.WorldGetPayload<{
  include: typeof worldInclude;
}>;

type WorldListItemWithRelations = Prisma.WorldGetPayload<{
  include: typeof worldListInclude;
}>;

export function createSlug(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'world';
}

function normalizeSeedInput(seed: WorldSeedInput) {
  return {
    firstCharacters: seed.firstCharacters?.map((value) => value.trim()).filter(Boolean) ?? [],
    firstFactions: seed.firstFactions?.map((value) => value.trim()).filter(Boolean) ?? [],
    firstHistoricalEvent: seed.firstHistoricalEvent?.trim() || null,
    genre: seed.genre.trim(),
    mainConflict: seed.mainConflict.trim(),
    premise: seed.premise.trim(),
    startingLocation: seed.startingLocation?.trim() || null,
    tone: seed.tone.trim(),
  };
}

function serializeSeed(seed: NonNullable<WorldWithRelations['seed']>) {
  return {
    createdAt: seed.createdAt.toISOString(),
    firstCharacters: Array.isArray(seed.firstCharacters) ? seed.firstCharacters : [],
    firstFactions: Array.isArray(seed.firstFactions) ? seed.firstFactions : [],
    firstHistoricalEvent: seed.firstHistoricalEvent,
    genre: seed.genre,
    id: seed.id,
    mainConflict: seed.mainConflict,
    premise: seed.premise,
    startingLocation: seed.startingLocation,
    tone: seed.tone,
    updatedAt: seed.updatedAt.toISOString(),
  };
}

function serializeBibleVersion(
  version:
    | WorldWithRelations['bibleVersions'][number]
    | WorldListItemWithRelations['bibleVersions'][number]
    | null,
) {
  if (!version) {
    return null;
  }

  return {
    changeSummary: version.changeSummary,
    ...('content' in version ? { content: version.content } : {}),
    createdAt: version.createdAt.toISOString(),
    creatorId: version.creatorId,
    hiveReferenceId: version.hiveReferenceId,
    id: version.id,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    updatedAt: version.updatedAt.toISOString(),
    versionNumber: version.versionNumber,
  };
}

export function serializeWorld(world: WorldWithRelations) {
  return {
    createdAt: world.createdAt.toISOString(),
    currentBibleVersion: serializeBibleVersion(world.bibleVersions[0] ?? null),
    description: world.description,
    founder: world.founder,
    founderId: world.founderId,
    id: world.id,
    seed: world.seed ? serializeSeed(world.seed) : null,
    slug: world.slug,
    title: world.title,
    updatedAt: world.updatedAt.toISOString(),
  };
}

export type SerializedWorld = ReturnType<typeof serializeWorld>;

export function serializeWorldListItem(world: WorldListItemWithRelations) {
  return {
    createdAt: world.createdAt.toISOString(),
    currentBibleVersion: serializeBibleVersion(world.bibleVersions[0] ?? null),
    description: world.description,
    founder: world.founder,
    founderId: world.founderId,
    id: world.id,
    seed: world.seed ? serializeSeed(world.seed) : null,
    slug: world.slug,
    title: world.title,
    updatedAt: world.updatedAt.toISOString(),
  };
}

async function generateUniqueWorldSlug(database: Pick<WorldDatabase, 'world'>, title: string) {
  const baseSlug = createSlug(title);
  let slug = baseSlug;

  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const existing = await database.world.findUnique({
      where: {
        slug,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
  }

  throw new WorldError(409, 'Unable to create a unique world slug.');
}

export async function createWorld(database: WorldDatabase, input: CreateWorldInput) {
  const seed = normalizeSeedInput(input.seed);

  try {
    const world = await database.$transaction(async (transaction) => {
      const slug = await generateUniqueWorldSlug(transaction, input.title);
      const createdWorld = await transaction.world.create({
        data: {
          description: input.description.trim(),
          founderId: input.creatorId,
          slug,
          title: input.title.trim(),
        },
      });

      await transaction.worldSeed.create({
        data: {
          firstCharacters: seed.firstCharacters,
          firstFactions: seed.firstFactions,
          firstHistoricalEvent: seed.firstHistoricalEvent,
          genre: seed.genre,
          mainConflict: seed.mainConflict,
          premise: seed.premise,
          startingLocation: seed.startingLocation,
          tone: seed.tone,
          worldId: createdWorld.id,
        },
      });

      await transaction.worldBibleVersion.create({
        data: {
          changeSummary: input.bible.changeSummary?.trim() || 'Initial world bible.',
          content: input.bible.content,
          creatorId: input.creatorId,
          versionNumber: 1,
          worldId: createdWorld.id,
        },
      });

      const membership = await transaction.worldMembership.create({
        data: {
          grantedById: input.creatorId,
          role: WorldRole.FOUNDER,
          userId: input.creatorId,
          worldId: createdWorld.id,
        },
      });

      await transaction.worldAuditLog.create({
        data: {
          action: WorldAuditAction.ROLE_ASSIGNED,
          actorId: input.creatorId,
          metadata: {
            role: WorldRole.FOUNDER,
          },
          targetId: membership.id,
          targetType: 'WORLD_MEMBERSHIP',
          worldId: createdWorld.id,
        },
      });

      return transaction.world.findUniqueOrThrow({
        include: worldInclude,
        where: {
          id: createdWorld.id,
        },
      });
    });

    return serializeWorld(world);
  } catch (error) {
    const conflict = mapWorldSlugConflict(error);

    if (conflict) {
      throw new WorldError(conflict.statusCode, conflict.error);
    }

    throw error;
  }
}

export async function listWorlds(
  database: WorldDatabase,
  input: {
    genre?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    tone?: string | undefined;
  },
) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const where: Prisma.WorldWhereInput = {};

  if (input.q) {
    where.OR = [
      {
        title: {
          contains: input.q,
          mode: 'insensitive',
        },
      },
      {
        description: {
          contains: input.q,
          mode: 'insensitive',
        },
      },
    ];
  }

  if (input.genre || input.tone) {
    where.seed = {
      ...(input.genre
        ? {
            genre: {
              equals: input.genre,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(input.tone
        ? {
            tone: {
              equals: input.tone,
              mode: 'insensitive',
            },
          }
        : {}),
    };
  }

  const [worlds, total] = await Promise.all([
    database.world.findMany({
      include: worldListInclude,
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      where,
    }),
    database.world.count({
      where,
    }),
  ]);

  return {
    pagination: {
      page,
      pageSize,
      total,
    },
    worlds: worlds.map(serializeWorldListItem),
  };
}

export async function getWorld(database: WorldDatabase, worldId: string) {
  const world = await database.world.findUnique({
    include: worldInclude,
    where: {
      id: worldId,
    },
  });

  return world ? serializeWorld(world) : null;
}

export async function getWorldHub(database: WorldDatabase, worldId: string) {
  const world = await getWorld(database, worldId);

  if (!world) {
    return null;
  }

  const [canonLoreCount, activeProposalCount, latestLoreEntries] = await Promise.all([
    database.loreEntry.count({
      where: {
        status: LoreStatus.PUBLISHED_CANON,
        worldId,
      },
    }),
    database.proposal.count({
      where: {
        status: {
          in: [ProposalStatus.SUBMITTED, ProposalStatus.VOTING],
        },
        worldId,
      },
    }),
    database.loreEntry.findMany({
      orderBy: [
        {
          updatedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      select: {
        id: true,
        loreType: true,
        slug: true,
        status: true,
        title: true,
        updatedAt: true,
      },
      take: 6,
      where: {
        status: LoreStatus.PUBLISHED_CANON,
        worldId,
      },
    }),
  ]);

  return {
    latestLoreEntries: latestLoreEntries.map((entry) => ({
      ...entry,
      updatedAt: entry.updatedAt.toISOString(),
    })),
    stats: {
      activeProposalCount,
      canonLoreCount,
    },
    world,
  };
}

export async function updateWorld(database: WorldDatabase, input: UpdateWorldInput) {
  const world = await database.$transaction(async (transaction) => {
    const current = await transaction.world.findUnique({
      include: {
        bibleVersions: {
          orderBy: {
            versionNumber: 'desc',
          },
          take: 1,
        },
        seed: true,
      },
      where: {
        id: input.worldId,
      },
    });

    if (!current) {
      throw new WorldError(404, 'World not found.');
    }

    if (input.title || input.description) {
      await transaction.world.update({
        data: {
          ...(input.description ? { description: input.description.trim() } : {}),
          ...(input.title ? { title: input.title.trim() } : {}),
        },
        where: {
          id: input.worldId,
        },
      });
    }

    if (input.seed) {
      const currentSeed = current.seed;

      if (!currentSeed) {
        throw new WorldError(409, 'World seed is missing.');
      }

      const normalizedSeed = normalizeSeedInput({
        firstCharacters:
          input.seed.firstCharacters ??
          (Array.isArray(currentSeed.firstCharacters)
            ? currentSeed.firstCharacters.filter(
                (value): value is string => typeof value === 'string',
              )
            : []),
        firstFactions:
          input.seed.firstFactions ??
          (Array.isArray(currentSeed.firstFactions)
            ? currentSeed.firstFactions.filter(
                (value): value is string => typeof value === 'string',
              )
            : []),
        firstHistoricalEvent:
          input.seed.firstHistoricalEvent ?? currentSeed.firstHistoricalEvent ?? undefined,
        genre: input.seed.genre ?? currentSeed.genre,
        mainConflict: input.seed.mainConflict ?? currentSeed.mainConflict,
        premise: input.seed.premise ?? currentSeed.premise,
        startingLocation: input.seed.startingLocation ?? currentSeed.startingLocation ?? undefined,
        tone: input.seed.tone ?? currentSeed.tone,
      });

      await transaction.worldSeed.update({
        data: normalizedSeed,
        where: {
          worldId: input.worldId,
        },
      });
    }

    if (input.bible) {
      const currentBible = current.bibleVersions[0];

      if (!currentBible) {
        throw new WorldError(409, 'World bible version is missing.');
      }

      if (currentBible.publishedAt || currentBible.hiveReferenceId) {
        throw new WorldError(409, 'Published world bible versions cannot be edited in place.');
      }

      await transaction.worldBibleVersion.update({
        data: {
          changeSummary: input.bible.changeSummary?.trim() || currentBible.changeSummary,
          content: input.bible.content,
        },
        where: {
          id: currentBible.id,
        },
      });

      await transaction.worldAuditLog.create({
        data: {
          action: WorldAuditAction.WORLD_BIBLE_UPDATED,
          actorId: input.actorId,
          metadata: {
            changeSummary: input.bible.changeSummary?.trim() || currentBible.changeSummary,
            versionNumber: currentBible.versionNumber,
          },
          targetId: currentBible.id,
          targetType: 'WORLD_BIBLE_VERSION',
          worldId: input.worldId,
        },
      });
    }

    return transaction.world.findUniqueOrThrow({
      include: worldInclude,
      where: {
        id: input.worldId,
      },
    });
  });

  return serializeWorld(world);
}
