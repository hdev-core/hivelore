import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Fastify from 'fastify';

import { env } from '../config/env.js';
import { LoreStatus, LoreType, PlatformRole, WorldRole } from '../generated/prisma/enums.js';
import { signAccessToken } from '../lib/auth-crypto.js';
import { registerLoreRoutes } from './lore.js';

const author = {
  hiveUsername: 'mira-vale.dev',
  id: 'user-author',
  normalizedHiveUsername: 'mira-vale.dev',
};

const otherUser = {
  hiveUsername: 'emberquill.dev',
  id: 'user-other',
  normalizedHiveUsername: 'emberquill.dev',
};

const curator = {
  hiveUsername: 'curator.dev',
  id: 'user-curator',
  normalizedHiveUsername: 'curator.dev',
};

function authHeader(user = author) {
  const token = signAccessToken(
    {
      hiveUsername: user.hiveUsername,
      normalizedHiveUsername: user.normalizedHiveUsername,
      platformRole: PlatformRole.USER,
      sid: `session-${user.id}`,
      sub: user.id,
    },
    {
      audience: env.AUTH_JWT_AUDIENCE,
      issuer: env.AUTH_JWT_ISSUER,
      secret: env.AUTH_JWT_SECRET,
      ttlSeconds: 900,
    },
  );

  return {
    authorization: `Bearer ${token}`,
  };
}

function now() {
  return new Date('2026-08-08T12:00:00.000Z');
}

type StoredLoreEntry = {
  id: string;
  worldId: string;
  authorId: string;
  title: string;
  slug: string;
  loreType: LoreType;
  content: unknown;
  status: LoreStatus;
  publishedAt: Date | null;
  hiveReferenceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type StoredLoreRelationship = {
  id: string;
  worldId: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function createLoreRecord(input: Partial<StoredLoreEntry> = {}): StoredLoreEntry {
  return {
    authorId: author.id,
    content: {
      body: 'A safe body.',
      summary: 'A short summary.',
    },
    createdAt: now(),
    hiveReferenceId: null,
    id: `lore-${Math.random().toString(36).slice(2)}`,
    loreType: LoreType.CHARACTER,
    publishedAt: null,
    slug: 'safe-body',
    status: LoreStatus.DRAFT,
    title: 'Safe Body',
    updatedAt: now(),
    worldId: 'world-1',
    ...input,
  };
}

function createDatabase() {
  const worlds = [{ id: 'world-1' }, { id: 'world-2' }];
  const users = [author, otherUser, curator];
  const loreEntries: StoredLoreEntry[] = [];
  const loreRelationships: StoredLoreRelationship[] = [];
  const worldAuditLogs: unknown[] = [];
  const memberships = [
    {
      id: 'membership-author',
      revokedAt: null,
      role: WorldRole.CONTRIBUTOR,
      userId: author.id,
      worldId: 'world-1',
    },
    {
      id: 'membership-other',
      revokedAt: null,
      role: WorldRole.READER,
      userId: otherUser.id,
      worldId: 'world-1',
    },
    {
      id: 'membership-curator',
      revokedAt: null,
      role: WorldRole.CURATOR,
      userId: curator.id,
      worldId: 'world-1',
    },
  ];

  function includeLore(entry: StoredLoreEntry) {
    const user = users.find((candidate) => candidate.id === entry.authorId) ?? author;
    const selectRelatedEntry = (entryId: string) =>
      loreEntries.find((candidate) => candidate.id === entryId)!;

    return {
      ...entry,
      author: {
        avatarUrl: null,
        displayName: null,
        hiveUsername: user.hiveUsername,
        id: user.id,
      },
      incomingRelations: loreRelationships
        .filter((relationship) => relationship.targetId === entry.id)
        .map((relationship) => ({
          id: relationship.id,
          relationType: relationship.relationType,
          source: includeRelatedEntry(selectRelatedEntry(relationship.sourceId)),
        })),
      outgoingRelations: loreRelationships
        .filter((relationship) => relationship.sourceId === entry.id)
        .map((relationship) => ({
          id: relationship.id,
          relationType: relationship.relationType,
          target: includeRelatedEntry(selectRelatedEntry(relationship.targetId)),
        })),
    };
  }

  function includeRelatedEntry(entry: StoredLoreEntry) {
    return {
      id: entry.id,
      loreType: entry.loreType,
      slug: entry.slug,
      status: entry.status,
      title: entry.title,
    };
  }

  function matchesWhere(entry: StoredLoreEntry, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR' && Array.isArray(value)) {
        return value.some((condition): boolean =>
          matchesWhere(entry, condition as Record<string, unknown>),
        );
      }

      if (key === 'title' && value && typeof value === 'object' && 'contains' in value) {
        return entry.title
          .toLowerCase()
          .includes(String((value as { contains: string }).contains).toLowerCase());
      }

      return entry[key as keyof StoredLoreEntry] === value;
    });
  }

  const database = {
    async $transaction<T>(callback: (transaction: unknown) => Promise<T>) {
      return callback(database);
    },
    loreEntry: {
      async count(args: { where: Record<string, unknown> }) {
        return loreEntries.filter((entry) => matchesWhere(entry, args.where)).length;
      },
      async create(args: { data: Partial<StoredLoreEntry> }) {
        const entry = createLoreRecord({
          id: `lore-${loreEntries.length + 1}`,
          ...args.data,
        });
        loreEntries.push(entry);
        return includeLore(entry);
      },
      async delete(args: { where: { id: string } }) {
        const index = loreEntries.findIndex((entry) => entry.id === args.where.id);
        const [deleted] = loreEntries.splice(index, 1);
        return deleted;
      },
      async findFirst(args: { where: Record<string, unknown> }) {
        const entry = loreEntries.find((candidate) => matchesWhere(candidate, args.where)) ?? null;
        return entry ? includeLore(entry) : null;
      },
      async findMany(args: { skip: number; take: number; where: Record<string, unknown> }) {
        return loreEntries
          .filter((entry) => matchesWhere(entry, args.where))
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
          .slice(args.skip, args.skip + args.take)
          .map(includeLore);
      },
      async update(args: { data: Partial<StoredLoreEntry>; where: { id: string } }) {
        const entry = loreEntries.find((candidate) => candidate.id === args.where.id);

        if (!entry) {
          throw new Error('Lore entry missing.');
        }

        Object.assign(entry, args.data, {
          updatedAt: now(),
        });

        return includeLore(entry);
      },
    },
    loreRelationship: {
      async create(args: { data: Partial<StoredLoreRelationship>; select?: unknown }) {
        if (
          loreRelationships.some(
            (relationship) =>
              relationship.worldId === args.data.worldId &&
              relationship.sourceId === args.data.sourceId &&
              relationship.targetId === args.data.targetId &&
              relationship.relationType === args.data.relationType,
          )
        ) {
          throw Object.assign(new Error('Duplicate relationship.'), { code: 'P2002' });
        }

        const relationship: StoredLoreRelationship = {
          createdAt: now(),
          id: `relationship-${loreRelationships.length + 1}`,
          metadata: null,
          relationType: '',
          sourceId: '',
          targetId: '',
          updatedAt: now(),
          worldId: '',
          ...args.data,
        };
        loreRelationships.push(relationship);

        return {
          id: relationship.id,
          relationType: relationship.relationType,
          target: includeRelatedEntry(
            loreEntries.find((entry) => entry.id === relationship.targetId)!,
          ),
        };
      },
      async delete(args: { where: { id: string } }) {
        const index = loreRelationships.findIndex(
          (relationship) => relationship.id === args.where.id,
        );
        const [deleted] = loreRelationships.splice(index, 1);
        return deleted;
      },
      async deleteMany(args: { where: { OR?: Array<Record<string, string>>; worldId: string } }) {
        const before = loreRelationships.length;
        for (let index = loreRelationships.length - 1; index >= 0; index -= 1) {
          const relationship = loreRelationships[index]!;
          const matchesWorld = relationship.worldId === args.where.worldId;
          const matchesRelation = args.where.OR?.some((condition) =>
            Object.entries(condition).every(
              ([key, value]) => relationship[key as keyof StoredLoreRelationship] === value,
            ),
          );

          if (matchesWorld && matchesRelation) {
            loreRelationships.splice(index, 1);
          }
        }

        return { count: before - loreRelationships.length };
      },
      async findFirst(args: { where: Record<string, unknown> }) {
        const relationship =
          loreRelationships.find((candidate) =>
            Object.entries(args.where).every(
              ([key, value]) => candidate[key as keyof StoredLoreRelationship] === value,
            ),
          ) ?? null;

        if (!relationship) {
          return null;
        }

        return {
          ...relationship,
          source: {
            authorId: loreEntries.find((entry) => entry.id === relationship.sourceId)!.authorId,
          },
        };
      },
    },
    refreshSession: {
      async findUnique(args: { where: { id: string } }) {
        const userId = args.where.id.replace(/^session-/, '');

        return {
          expiresAt: new Date('2026-08-10T12:15:00.000Z'),
          revokedAt: null,
          userId,
        };
      },
    },
    world: {
      async findUnique(args: { where: { id: string } }) {
        return worlds.find((world) => world.id === args.where.id) ?? null;
      },
    },
    worldAuditLog: {
      async create(args: { data: unknown }) {
        worldAuditLogs.push(args.data);
        return args.data;
      },
    },
    worldMembership: {
      async findUnique(args: {
        where: { worldId_userId: { worldId: string; userId: string }; revokedAt: null };
      }) {
        return (
          memberships.find(
            (membership) =>
              membership.worldId === args.where.worldId_userId.worldId &&
              membership.userId === args.where.worldId_userId.userId &&
              !membership.revokedAt,
          ) ?? null
        );
      },
    },
  };

  return {
    database,
    loreEntries,
    loreRelationships,
    memberships,
    worldAuditLogs,
  };
}

async function createApp(database: ReturnType<typeof createDatabase>['database']) {
  const app = Fastify();
  await registerLoreRoutes(app, {
    database: database as never,
  });
  return app;
}

describe('lore routes', () => {
  test('public list and read expose only published canon by default', async () => {
    const state = createDatabase();
    state.loreEntries.push(
      createLoreRecord({
        id: 'published-1',
        publishedAt: now(),
        status: LoreStatus.PUBLISHED_CANON,
        title: 'Published Canon',
      }),
    );
    state.loreEntries.push(createLoreRecord({ id: 'draft-1', title: 'Private Draft' }));
    const app = await createApp(state.database);

    const listResponse = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/lore',
    });
    const draftReadResponse = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/lore/draft-1',
    });

    assert.equal(listResponse.statusCode, 200);
    assert.deepEqual(
      listResponse.json().entries.map((entry: { id: string }) => entry.id),
      ['published-1'],
    );
    assert.equal(draftReadResponse.statusCode, 404);
    await app.close();
  });

  test('draft lists require auth and scope contributors to their own drafts', async () => {
    const state = createDatabase();
    state.memberships.find((membership) => membership.userId === otherUser.id)!.role =
      WorldRole.CONTRIBUTOR;
    state.loreEntries.push(createLoreRecord({ id: 'own-draft' }));
    state.loreEntries.push(createLoreRecord({ authorId: otherUser.id, id: 'other-draft' }));
    const app = await createApp(state.database);

    const anonymousResponse = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/lore?status=DRAFT',
    });
    const authorResponse = await app.inject({
      headers: authHeader(),
      method: 'GET',
      url: '/worlds/world-1/lore?status=DRAFT',
    });
    const curatorResponse = await app.inject({
      headers: authHeader(curator),
      method: 'GET',
      url: '/worlds/world-1/lore?status=DRAFT',
    });

    assert.equal(anonymousResponse.statusCode, 401);
    assert.deepEqual(
      authorResponse.json().entries.map((entry: { id: string }) => entry.id),
      ['own-draft'],
    );
    assert.deepEqual(
      curatorResponse
        .json()
        .entries.map((entry: { id: string }) => entry.id)
        .sort(),
      ['other-draft', 'own-draft'],
    );
    await app.close();
  });

  test('create is draft-only, permission gated, validates caps, and stores JSON verbatim', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);

    const unauthenticated = await app.inject({
      method: 'POST',
      payload: {
        content: { body: 'A body.', summary: 'A summary.' },
        loreType: LoreType.QUEST,
        title: 'Quest',
      },
      url: '/worlds/world-1/lore',
    });
    const forbidden = await app.inject({
      headers: authHeader(otherUser),
      method: 'POST',
      payload: {
        content: { body: 'A body.', summary: 'A summary.' },
        loreType: LoreType.QUEST,
        title: 'Quest',
      },
      url: '/worlds/world-1/lore',
    });
    const selfPublish = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        content: { body: 'A body.', summary: 'A summary.' },
        loreType: LoreType.QUEST,
        status: LoreStatus.PUBLISHED_CANON,
        title: 'Quest',
      },
      url: '/worlds/world-1/lore',
    });
    const oversizedSummary = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        content: { body: 'A body.', summary: 'x'.repeat(1_001) },
        loreType: LoreType.QUEST,
        title: 'Quest',
      },
      url: '/worlds/world-1/lore',
    });
    const created = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        content: {
          body: '<script>alert("owned")</script>',
          fields: {
            hook: '<img src=x onerror=alert(1)>',
          },
          summary: 'A summary.',
        },
        loreType: LoreType.QUEST,
        title: '  The First Quest  ',
      },
      url: '/worlds/world-1/lore',
    });

    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(forbidden.statusCode, 403);
    assert.equal(selfPublish.statusCode, 400);
    assert.equal(oversizedSummary.statusCode, 400);
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().entry.status, LoreStatus.DRAFT);
    assert.equal(created.json().entry.loreType, LoreType.QUEST);
    assert.equal(created.json().entry.title, 'The First Quest');
    assert.equal(created.json().entry.content.body, '<script>alert("owned")</script>');
    await app.close();
  });

  test('update and delete are limited to editable drafts and never mutate canon', async () => {
    const state = createDatabase();
    state.memberships.find((membership) => membership.userId === otherUser.id)!.role =
      WorldRole.CONTRIBUTOR;
    state.loreEntries.push(createLoreRecord({ id: 'draft-1' }));
    state.loreEntries.push(
      createLoreRecord({
        id: 'canon-1',
        publishedAt: now(),
        status: LoreStatus.PUBLISHED_CANON,
      }),
    );
    const app = await createApp(state.database);

    const otherUpdate = await app.inject({
      headers: authHeader(otherUser),
      method: 'PATCH',
      payload: { title: 'Nope' },
      url: '/worlds/world-1/lore/draft-1',
    });
    const selfPublishUpdate = await app.inject({
      headers: authHeader(),
      method: 'PATCH',
      payload: { status: LoreStatus.PUBLISHED_CANON },
      url: '/worlds/world-1/lore/draft-1',
    });
    const update = await app.inject({
      headers: authHeader(),
      method: 'PATCH',
      payload: {
        content: { body: 'Updated.', summary: 'Updated summary.' },
        loreType: LoreType.STORY,
        title: 'Updated Draft',
      },
      url: '/worlds/world-1/lore/draft-1',
    });
    const canonDelete = await app.inject({
      headers: authHeader(curator),
      method: 'DELETE',
      url: '/worlds/world-1/lore/canon-1',
    });
    const deleteResponse = await app.inject({
      headers: authHeader(),
      method: 'DELETE',
      url: '/worlds/world-1/lore/draft-1',
    });

    assert.equal(otherUpdate.statusCode, 403);
    assert.equal(selfPublishUpdate.statusCode, 400);
    assert.equal(update.statusCode, 200);
    assert.equal(update.json().entry.loreType, LoreType.STORY);
    assert.equal(canonDelete.statusCode, 409);
    assert.equal(deleteResponse.statusCode, 200);
    assert.equal(deleteResponse.json().ok, true);
    assert.equal(
      state.loreEntries.some((entry) => entry.id === 'draft-1'),
      false,
    );
    assert.equal(
      state.loreEntries.some((entry) => entry.id === 'canon-1'),
      true,
    );
    await app.close();
  });

  test('quest and story are distinct filterable lore types', async () => {
    const state = createDatabase();
    state.loreEntries.push(
      createLoreRecord({
        id: 'quest-1',
        loreType: LoreType.QUEST,
        publishedAt: now(),
        status: LoreStatus.PUBLISHED_CANON,
      }),
    );
    state.loreEntries.push(
      createLoreRecord({
        id: 'story-1',
        loreType: LoreType.STORY,
        publishedAt: now(),
        status: LoreStatus.PUBLISHED_CANON,
      }),
    );
    const app = await createApp(state.database);

    const questResponse = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/lore?loreType=QUEST',
    });
    const storyResponse = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/lore?loreType=STORY',
    });

    assert.deepEqual(
      questResponse.json().entries.map((entry: { id: string }) => entry.id),
      ['quest-1'],
    );
    assert.deepEqual(
      storyResponse.json().entries.map((entry: { id: string }) => entry.id),
      ['story-1'],
    );
    await app.close();
  });

  test('relationships can be created, read from entry pages, deduplicated, and deleted', async () => {
    const state = createDatabase();
    state.loreEntries.push(createLoreRecord({ id: 'source-1', title: 'Source' }));
    state.loreEntries.push(createLoreRecord({ id: 'target-1', title: 'Target' }));
    const app = await createApp(state.database);

    const selfLink = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        relationType: 'member_of',
        targetId: 'source-1',
      },
      url: '/worlds/world-1/lore/source-1/relationships',
    });
    const created = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        metadata: { certainty: 'high' },
        relationType: 'member_of',
        targetId: 'target-1',
      },
      url: '/worlds/world-1/lore/source-1/relationships',
    });
    const duplicate = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        relationType: 'member_of',
        targetId: 'target-1',
      },
      url: '/worlds/world-1/lore/source-1/relationships',
    });
    const read = await app.inject({
      headers: authHeader(),
      method: 'GET',
      url: '/worlds/world-1/lore/source-1',
    });
    const deleted = await app.inject({
      headers: authHeader(),
      method: 'DELETE',
      url: `/worlds/world-1/lore/source-1/relationships/${created.json().relationship.id}`,
    });

    assert.equal(selfLink.statusCode, 400);
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().relationship.relationType, 'member_of');
    assert.equal(duplicate.statusCode, 409);
    assert.equal(read.statusCode, 200);
    assert.equal(read.json().entry.outgoingRelations.length, 1);
    assert.equal(read.json().entry.outgoingRelations[0].target.id, 'target-1');
    assert.equal(deleted.statusCode, 204);
    assert.equal(state.loreRelationships.length, 0);
    assert.equal(state.worldAuditLogs.length >= 2, true);
    await app.close();
  });

  test('public relation projection hides draft related entries', async () => {
    const state = createDatabase();
    state.loreEntries.push(
      createLoreRecord({
        id: 'published-source',
        publishedAt: now(),
        status: LoreStatus.PUBLISHED_CANON,
      }),
    );
    state.loreEntries.push(createLoreRecord({ id: 'private-target', title: 'Private Target' }));
    state.loreRelationships.push({
      createdAt: now(),
      id: 'relationship-1',
      metadata: null,
      relationType: 'knows',
      sourceId: 'published-source',
      targetId: 'private-target',
      updatedAt: now(),
      worldId: 'world-1',
    });
    const app = await createApp(state.database);

    const publicRead = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/lore/published-source',
    });
    const authorRead = await app.inject({
      headers: authHeader(),
      method: 'GET',
      url: '/worlds/world-1/lore/published-source',
    });

    assert.equal(publicRead.statusCode, 200);
    assert.equal(publicRead.json().entry.outgoingRelations.length, 0);
    assert.equal(authorRead.statusCode, 200);
    assert.equal(authorRead.json().entry.outgoingRelations.length, 1);
    await app.close();
  });
});
