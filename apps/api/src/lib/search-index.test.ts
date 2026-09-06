import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { LoreStatus, LoreType, SearchEntityType } from '../generated/prisma/enums.js';
import {
  flattenSearchText,
  rebuildSearchIndex,
  searchWorldLore,
  upsertLoreSearchIndex,
  upsertWorldSearchIndex,
} from './search-index.js';

function createDatabase() {
  const searchRows: Array<Record<string, unknown>> = [];
  const worlds = [
    {
      bibleVersions: [
        {
          content: {
            law: 'The obsidian tower remembers every oath.',
          },
          versionNumber: 1,
        },
      ],
      description: 'A moonlit city of archives.',
      id: 'world-1',
      slug: 'moon-archive',
      title: 'Moon Archive',
    },
  ];
  const loreEntries = [
    {
      content: {
        body: 'Archivist Sera guards the obsidian tower.',
      },
      id: 'lore-1',
      loreType: LoreType.CHARACTER,
      slug: 'sera',
      status: LoreStatus.PUBLISHED_CANON,
      title: 'Sera',
      worldId: 'world-1',
    },
    {
      content: {
        body: 'Private draft',
      },
      id: 'draft-1',
      loreType: LoreType.CHARACTER,
      slug: 'draft',
      status: LoreStatus.DRAFT,
      title: 'Draft',
      worldId: 'world-1',
    },
  ];
  const database = {
    async $queryRaw() {
      return [
        {
          entityId: 'lore-1',
          entityType: SearchEntityType.LORE_ENTRY,
          metadata: { loreType: LoreType.CHARACTER },
          rank: 0.4,
          title: 'Sera',
          worldId: 'world-1',
        },
      ];
    },
    async $transaction<T>(callback: (transaction: unknown) => Promise<T>) {
      return callback(database);
    },
    loreEntry: {
      async findMany(args?: { where?: { status?: LoreStatus } }) {
        return args?.where?.status
          ? loreEntries.filter((entry) => entry.status === args.where?.status)
          : loreEntries;
      },
      async findUnique(args: { where: { id: string } }) {
        return loreEntries.find((entry) => entry.id === args.where.id) ?? null;
      },
    },
    searchIndex: {
      async deleteMany(args: { where?: { entityId?: string; entityType?: string } } = {}) {
        const before = searchRows.length;

        for (let index = searchRows.length - 1; index >= 0; index -= 1) {
          const row = searchRows[index]!;
          if (
            (!args.where?.entityId || row.entityId === args.where.entityId) &&
            (!args.where?.entityType || row.entityType === args.where.entityType)
          ) {
            searchRows.splice(index, 1);
          }
        }

        return { count: before - searchRows.length };
      },
      async upsert(args: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
        where: { entityType_entityId: { entityId: string; entityType: string } };
      }) {
        const existing = searchRows.find(
          (row) =>
            row.entityId === args.where.entityType_entityId.entityId &&
            row.entityType === args.where.entityType_entityId.entityType,
        );

        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        }

        searchRows.push(args.create);
        return args.create;
      },
    },
    world: {
      async findMany() {
        return worlds.map((world) => ({ id: world.id }));
      },
      async findUnique(args: { where: { id: string } }) {
        return worlds.find((world) => world.id === args.where.id) ?? null;
      },
    },
    worldBibleVersion: {},
  };

  return {
    database,
    searchRows,
  };
}

describe('search index projection', () => {
  test('flattens structured content into searchable text', () => {
    assert.equal(
      flattenSearchText({ body: ['Moon', { place: 'Archive' }], ok: true }),
      'Moon Archive true',
    );
  });

  test('upserts worlds and only published canon lore entries', async () => {
    const state = createDatabase();

    await upsertWorldSearchIndex(state.database as never, 'world-1');
    await upsertLoreSearchIndex(state.database as never, 'lore-1');
    await upsertLoreSearchIndex(state.database as never, 'draft-1');

    assert.deepEqual(
      state.searchRows.map((row) => [row.entityType, row.entityId]),
      [
        [SearchEntityType.WORLD, 'world-1'],
        [SearchEntityType.LORE_ENTRY, 'lore-1'],
      ],
    );
    assert.match(String(state.searchRows[0]?.searchableContent), /obsidian tower/);
  });

  test('rebuilds all searchable projections and returns counts', async () => {
    const state = createDatabase();

    const result = await rebuildSearchIndex(state.database as never);

    assert.deepEqual(result, { loreEntries: 1, worlds: 1 });
    assert.equal(state.searchRows.length, 2);
  });

  test('runs ranked search with pagination metadata', async () => {
    const state = createDatabase();

    const result = await searchWorldLore(state.database as never, {
      page: 1,
      pageSize: 10,
      q: 'obsidian tower',
      type: SearchEntityType.LORE_ENTRY,
      worldId: 'world-1',
    });

    assert.equal(result.results[0]?.entityId, 'lore-1');
    assert.deepEqual(result.pageInfo, {
      hasMore: false,
      page: 1,
      pageSize: 10,
    });
  });
});
