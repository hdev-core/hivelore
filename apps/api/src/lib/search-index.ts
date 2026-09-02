import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { LoreStatus, SearchEntityType } from '../generated/prisma/enums.js';

const MAX_QUERY_LENGTH = 120;
const MAX_PAGE_SIZE = 50;

type SearchDatabase = Pick<
  PrismaClient,
  '$queryRaw' | '$transaction' | 'loreEntry' | 'searchIndex' | 'world' | 'worldBibleVersion'
>;

type SearchIndexWriter = Pick<
  PrismaClient,
  'loreEntry' | 'searchIndex' | 'world' | 'worldBibleVersion'
>;

export type SearchQueryInput = {
  page?: number | undefined;
  pageSize?: number | undefined;
  q: string;
  type?: SearchEntityType | undefined;
  worldId?: string | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function flattenSearchText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(flattenSearchText).filter(Boolean).join(' ');
  }

  if (isRecord(value)) {
    return Object.values(value).map(flattenSearchText).filter(Boolean).join(' ');
  }

  return '';
}

function cleanQuery(q: string) {
  return q.trim().replace(/\s+/g, ' ');
}

function cleanPageSize(pageSize = 20) {
  return Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
}

function cleanPage(page = 1) {
  return Math.max(page, 1);
}

export async function upsertWorldSearchIndex(database: SearchIndexWriter, worldId: string) {
  const world = await database.world.findUnique({
    include: {
      bibleVersions: {
        orderBy: {
          versionNumber: 'desc',
        },
        take: 1,
      },
    },
    where: {
      id: worldId,
    },
  });

  if (!world) {
    await database.searchIndex.deleteMany({
      where: {
        entityId: worldId,
        entityType: SearchEntityType.WORLD,
      },
    });
    return;
  }

  const currentBible = world.bibleVersions[0];
  await database.searchIndex.upsert({
    create: {
      entityId: world.id,
      entityType: SearchEntityType.WORLD,
      metadata: {
        slug: world.slug,
      },
      searchableContent: [world.description, flattenSearchText(currentBible?.content)]
        .filter(Boolean)
        .join(' '),
      title: world.title,
      worldId: world.id,
    },
    update: {
      metadata: {
        slug: world.slug,
      },
      searchableContent: [world.description, flattenSearchText(currentBible?.content)]
        .filter(Boolean)
        .join(' '),
      title: world.title,
      worldId: world.id,
    },
    where: {
      entityType_entityId: {
        entityId: world.id,
        entityType: SearchEntityType.WORLD,
      },
    },
  });
}

export async function upsertLoreSearchIndex(database: SearchIndexWriter, loreEntryId: string) {
  const entry = await database.loreEntry.findUnique({
    select: {
      content: true,
      id: true,
      loreType: true,
      slug: true,
      status: true,
      title: true,
      worldId: true,
    },
    where: {
      id: loreEntryId,
    },
  });

  if (!entry || entry.status !== LoreStatus.PUBLISHED_CANON) {
    await database.searchIndex.deleteMany({
      where: {
        entityId: loreEntryId,
        entityType: SearchEntityType.LORE_ENTRY,
      },
    });
    return;
  }

  await database.searchIndex.upsert({
    create: {
      entityId: entry.id,
      entityType: SearchEntityType.LORE_ENTRY,
      metadata: {
        loreType: entry.loreType,
        slug: entry.slug,
      },
      searchableContent: flattenSearchText(entry.content),
      title: entry.title,
      worldId: entry.worldId,
    },
    update: {
      metadata: {
        loreType: entry.loreType,
        slug: entry.slug,
      },
      searchableContent: flattenSearchText(entry.content),
      title: entry.title,
      worldId: entry.worldId,
    },
    where: {
      entityType_entityId: {
        entityId: entry.id,
        entityType: SearchEntityType.LORE_ENTRY,
      },
    },
  });
}

export async function rebuildSearchIndex(database: SearchDatabase) {
  return database.$transaction(async (transaction) => {
    await transaction.searchIndex.deleteMany({});

    const worlds = await transaction.world.findMany({
      select: {
        id: true,
      },
    });
    const loreEntries = await transaction.loreEntry.findMany({
      select: {
        id: true,
      },
      where: {
        status: LoreStatus.PUBLISHED_CANON,
      },
    });

    for (const world of worlds) {
      await upsertWorldSearchIndex(transaction, world.id);
    }

    for (const entry of loreEntries) {
      await upsertLoreSearchIndex(transaction, entry.id);
    }

    return {
      loreEntries: loreEntries.length,
      worlds: worlds.length,
    };
  });
}

export async function searchWorldLore(database: SearchDatabase, input: SearchQueryInput) {
  const q = cleanQuery(input.q);

  if (!q || q.length > MAX_QUERY_LENGTH) {
    throw new Error('Search query must be between 1 and 120 characters.');
  }

  const page = cleanPage(input.page);
  const pageSize = cleanPageSize(input.pageSize);
  const offset = (page - 1) * pageSize;
  const rows = await database.$queryRaw<
    Array<{
      entityId: string;
      entityType: SearchEntityType;
      metadata: Prisma.JsonValue | null;
      rank: number;
      title: string;
      worldId: string | null;
    }>
  >`
    SELECT
      "entityId",
      "entityType",
      "metadata",
      ts_rank("searchVector", websearch_to_tsquery('english', ${q}))::float AS rank,
      "title",
      "worldId"
    FROM "SearchIndex"
    WHERE "searchVector" @@ websearch_to_tsquery('english', ${q})
      AND (${input.worldId ?? null}::text IS NULL OR "worldId" = ${input.worldId ?? null})
      AND (${input.type ?? null}::"SearchEntityType" IS NULL OR "entityType" = ${input.type ?? null}::"SearchEntityType")
    ORDER BY rank DESC, "updatedAt" DESC, "id" DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  return {
    pageInfo: {
      hasMore: rows.length === pageSize,
      page,
      pageSize,
    },
    results: rows.map((row) => ({
      entityId: row.entityId,
      entityType: row.entityType,
      metadata: row.metadata,
      rank: row.rank,
      title: row.title,
      worldId: row.worldId,
    })),
  };
}
