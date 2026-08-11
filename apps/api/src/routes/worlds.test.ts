import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Fastify from 'fastify';

import { env } from '../config/env.js';
import {
  LoreStatus,
  PlatformRole,
  ProposalStatus,
  WorldAuditAction,
  WorldRole,
} from '../generated/prisma/enums.js';
import { signAccessToken } from '../lib/auth-crypto.js';
import { createWorld, updateWorld } from '../lib/worlds.js';
import { registerWorldRoutes } from './worlds.js';

const founder = {
  avatarUrl: null,
  displayName: 'Ember Quill',
  hiveUsername: 'emberquill.dev',
  id: 'user-1',
  normalizedHiveUsername: 'emberquill.dev',
};

const contributor = {
  avatarUrl: null,
  displayName: 'Mira Vale',
  hiveUsername: 'mira-vale.dev',
  id: 'user-2',
  normalizedHiveUsername: 'mira-vale.dev',
};

function authHeader(userId = founder.id) {
  const token = signAccessToken(
    {
      hiveUsername: founder.hiveUsername,
      normalizedHiveUsername: founder.normalizedHiveUsername,
      platformRole: PlatformRole.USER,
      sid: `session-${userId}`,
      sub: userId,
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

type StoredWorld = {
  id: string;
  slug: string;
  title: string;
  description: string;
  founderId: string;
  founder: typeof founder;
  createdAt: Date;
  updatedAt: Date;
};

type StoredWorldSeed = {
  id: string;
  worldId: string;
  premise: string;
  genre: string;
  tone: string;
  mainConflict: string;
  startingLocation: string | null;
  firstCharacters: unknown;
  firstFactions: unknown;
  firstHistoricalEvent: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type StoredBibleVersion = {
  id: string;
  worldId: string;
  versionNumber: number;
  creatorId: string;
  content: unknown;
  changeSummary: string | null;
  publishedAt: Date | null;
  hiveReferenceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function createWorldRecord(input: {
  id: string;
  slug: string;
  title: string;
  description: string;
  founderId?: string;
}): StoredWorld {
  return {
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    description: input.description,
    founder: input.founderId === contributor.id ? contributor : founder,
    founderId: input.founderId ?? founder.id,
    id: input.id,
    slug: input.slug,
    title: input.title,
    updatedAt: new Date('2026-08-05T00:00:00.000Z'),
  };
}

function createDatabase() {
  const worlds: StoredWorld[] = [];
  const seeds: StoredWorldSeed[] = [];
  const bibleVersions: StoredBibleVersion[] = [];
  const memberships: Array<{
    id: string;
    worldId: string;
    userId: string;
    role: WorldRole;
    revokedAt: Date | null;
  }> = [];
  const auditLogs: unknown[] = [];
  const loreEntries: Array<{
    id: string;
    worldId: string;
    title: string;
    slug: string;
    loreType: string;
    status: LoreStatus;
    updatedAt: Date;
  }> = [];
  const proposals: Array<{
    id: string;
    worldId: string;
    status: ProposalStatus;
  }> = [];
  let failNextAuditCreate = false;
  let failNextSeedCreate = false;
  let failNextWorldCreateWithSlugConflict = false;

  function cloneState() {
    return {
      auditLogs: [...auditLogs],
      bibleVersions: bibleVersions.map((version) => ({ ...version })),
      memberships: memberships.map((membership) => ({ ...membership })),
      seeds: seeds.map((seed) => ({ ...seed })),
      worlds: worlds.map((world) => ({ ...world })),
    };
  }

  function restoreState(snapshot: ReturnType<typeof cloneState>) {
    auditLogs.splice(0, auditLogs.length, ...snapshot.auditLogs);
    bibleVersions.splice(0, bibleVersions.length, ...snapshot.bibleVersions);
    memberships.splice(0, memberships.length, ...snapshot.memberships);
    seeds.splice(0, seeds.length, ...snapshot.seeds);
    worlds.splice(0, worlds.length, ...snapshot.worlds);
  }

  function matchesTextFilter(value: string, filter?: { contains?: string; equals?: string }) {
    if (!filter) {
      return true;
    }

    if (filter.contains) {
      return value.toLowerCase().includes(filter.contains.toLowerCase());
    }

    if (filter.equals) {
      return value.toLowerCase() === filter.equals.toLowerCase();
    }

    return true;
  }

  function matchesWorldWhere(
    world: StoredWorld,
    where?: {
      OR?: Array<{ title?: { contains: string }; description?: { contains: string } }>;
      seed?: { genre?: { equals: string }; tone?: { equals: string } };
    },
  ) {
    if (!where) {
      return true;
    }

    if (
      where.OR &&
      !where.OR.some(
        (filter) =>
          (filter.title ? matchesTextFilter(world.title, filter.title) : false) ||
          (filter.description ? matchesTextFilter(world.description, filter.description) : false),
      )
    ) {
      return false;
    }

    const seed = seeds.find((candidate) => candidate.worldId === world.id);

    if (where.seed?.genre && !seed) {
      return false;
    }

    if (seed && !matchesTextFilter(seed.genre, where.seed?.genre)) {
      return false;
    }

    if (seed && !matchesTextFilter(seed.tone, where.seed?.tone)) {
      return false;
    }

    return true;
  }

  function includeWorld(world: StoredWorld, includeContent = true) {
    const versions = bibleVersions
      .filter((version) => version.worldId === world.id)
      .sort((left, right) => right.versionNumber - left.versionNumber)
      .slice(0, 1)
      .map((version) => {
        if (includeContent) {
          return version;
        }

        const summary: Partial<StoredBibleVersion> = { ...version };
        delete summary.content;
        return summary;
      });

    return {
      ...world,
      bibleVersions: versions,
      founder: world.founder,
      seed: seeds.find((seed) => seed.worldId === world.id) ?? null,
    };
  }

  const database = {
    async $transaction<T>(this: unknown, callback: (transaction: never) => Promise<T>) {
      const snapshot = cloneState();

      try {
        return await callback(this as never);
      } catch (error) {
        restoreState(snapshot);
        throw error;
      }
    },
    loreEntry: {
      async count(args: { where: { worldId: string; status?: LoreStatus } }) {
        return loreEntries.filter(
          (entry) =>
            entry.worldId === args.where.worldId &&
            (!args.where.status || entry.status === args.where.status),
        ).length;
      },
      async findMany(args: { where: { worldId: string; status?: LoreStatus }; take: number }) {
        return loreEntries
          .filter(
            (entry) =>
              entry.worldId === args.where.worldId &&
              (!('status' in args.where) || entry.status === args.where.status),
          )
          .slice(0, args.take);
      },
    },
    proposal: {
      async count(args: { where: { worldId: string; status: { in: ProposalStatus[] } } }) {
        return proposals.filter(
          (proposal) =>
            proposal.worldId === args.where.worldId &&
            args.where.status.in.includes(proposal.status),
        ).length;
      },
    },
    world: {
      async count(args?: { where?: Parameters<typeof matchesWorldWhere>[1] }) {
        return worlds.filter((world) => matchesWorldWhere(world, args?.where)).length;
      },
      async create(args: {
        data: {
          description: string;
          founderId: string;
          slug: string;
          title: string;
        };
      }) {
        if (failNextWorldCreateWithSlugConflict) {
          failNextWorldCreateWithSlugConflict = false;
          throw {
            code: 'P2002',
            meta: {
              target: ['slug'],
            },
          };
        }

        if (worlds.some((world) => world.slug === args.data.slug)) {
          throw {
            code: 'P2002',
            meta: {
              target: ['slug'],
            },
          };
        }

        const world = createWorldRecord({
          description: args.data.description,
          founderId: args.data.founderId,
          id: `world-${worlds.length + 1}`,
          slug: args.data.slug,
          title: args.data.title,
        });
        worlds.push(world);
        return world;
      },
      async findMany(args: {
        include?: { bibleVersions?: { select?: Record<string, boolean> } };
        take: number;
        skip: number;
        where?: Parameters<typeof matchesWorldWhere>[1];
      }) {
        const includeContent = Boolean(args.include?.bibleVersions?.select?.content);

        return worlds
          .filter((world) => matchesWorldWhere(world, args.where))
          .sort((left, right) => {
            const createdAtOrder = right.createdAt.getTime() - left.createdAt.getTime();

            if (createdAtOrder !== 0) {
              return createdAtOrder;
            }

            return right.id.localeCompare(left.id);
          })
          .slice(args.skip, args.skip + args.take)
          .map((world) => includeWorld(world, includeContent));
      },
      async findUnique(args: { where: { id?: string; slug?: string } }) {
        const world = worlds.find((candidate) => {
          if (args.where.id) {
            return candidate.id === args.where.id;
          }

          return candidate.slug === args.where.slug;
        });

        return world ? includeWorld(world) : null;
      },
      async findUniqueOrThrow(args: { where: { id: string } }) {
        const world = worlds.find((candidate) => candidate.id === args.where.id);

        if (!world) {
          throw new Error('Missing world.');
        }

        return includeWorld(world);
      },
      async update(args: {
        data: Partial<Pick<StoredWorld, 'description' | 'title'>>;
        where: { id: string };
      }) {
        const world = worlds.find((candidate) => candidate.id === args.where.id);

        if (!world) {
          throw new Error('Missing world.');
        }

        Object.assign(world, args.data, {
          updatedAt: new Date('2026-08-05T00:01:00.000Z'),
        });

        return world;
      },
    },
    worldAuditLog: {
      async create(args: { data: unknown }) {
        if (failNextAuditCreate) {
          failNextAuditCreate = false;
          throw new Error('Injected audit failure.');
        }

        auditLogs.push(args.data);
        return args.data;
      },
    },
    worldBibleVersion: {
      async create(args: {
        data: {
          changeSummary: string;
          content: unknown;
          creatorId: string;
          versionNumber: number;
          worldId: string;
        };
      }) {
        const version = {
          ...args.data,
          createdAt: new Date('2026-08-05T00:00:00.000Z'),
          hiveReferenceId: null,
          id: `bible-${bibleVersions.length + 1}`,
          publishedAt: null,
          updatedAt: new Date('2026-08-05T00:00:00.000Z'),
        };
        bibleVersions.push(version);
        return version;
      },
      async update(args: {
        data: Partial<Pick<StoredBibleVersion, 'changeSummary' | 'content'>>;
        where: { id: string };
      }) {
        const version = bibleVersions.find((candidate) => candidate.id === args.where.id);

        if (!version) {
          throw new Error('Missing bible version.');
        }

        Object.assign(version, args.data, {
          updatedAt: new Date('2026-08-05T00:01:00.000Z'),
        });

        return version;
      },
    },
    worldMembership: {
      async create(args: {
        data: {
          grantedById: string;
          role: WorldRole;
          userId: string;
          worldId: string;
        };
      }) {
        const membership = {
          id: `membership-${memberships.length + 1}`,
          revokedAt: null,
          ...args.data,
        };
        memberships.push(membership);
        return membership;
      },
      async findUnique(args: {
        where: { worldId_userId: { worldId: string; userId: string }; revokedAt?: null };
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
    worldSeed: {
      async create(args: {
        data: {
          firstCharacters: string[];
          firstFactions: string[];
          firstHistoricalEvent: string | null;
          genre: string;
          mainConflict: string;
          premise: string;
          startingLocation: string | null;
          tone: string;
          worldId: string;
        };
      }) {
        if (failNextSeedCreate) {
          failNextSeedCreate = false;
          throw new Error('Injected seed failure.');
        }

        const seed = {
          ...args.data,
          createdAt: new Date('2026-08-05T00:00:00.000Z'),
          id: `seed-${seeds.length + 1}`,
          updatedAt: new Date('2026-08-05T00:00:00.000Z'),
        };
        seeds.push(seed);
        return seed;
      },
      async update(args: { data: Partial<StoredWorldSeed>; where: { worldId: string } }) {
        const seed = seeds.find((candidate) => candidate.worldId === args.where.worldId);

        if (!seed) {
          throw new Error('Missing seed.');
        }

        Object.assign(seed, args.data, {
          updatedAt: new Date('2026-08-05T00:01:00.000Z'),
        });

        return seed;
      },
    },
    refreshSession: {
      async findUnique(args: { where: { id: string } }) {
        if (!args.where.id.startsWith('session-')) {
          return null;
        }

        return {
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          revokedAt: null,
          userId: args.where.id.replace('session-', ''),
        };
      },
    },
  };

  return {
    auditLogs,
    bibleVersions,
    database,
    loreEntries,
    memberships,
    proposals,
    seeds,
    failNextAuditCreate() {
      failNextAuditCreate = true;
    },
    failNextSeedCreate() {
      failNextSeedCreate = true;
    },
    failNextWorldCreateWithSlugConflict() {
      failNextWorldCreateWithSlugConflict = true;
    },
    worlds,
  };
}

async function createApp(database: ReturnType<typeof createDatabase>['database']) {
  const app = Fastify();
  await registerWorldRoutes(app, {
    database: database as never,
  });
  return app;
}

const worldPayload = {
  bible: {
    changeSummary: 'Initial bible.',
    content: {
      rules: ['No false canon.'],
      style: 'Mythic',
    },
  },
  description: 'A realm of moonlit archives.',
  seed: {
    firstCharacters: ['Archivist Lume'],
    firstFactions: ['Moon Scribes'],
    firstHistoricalEvent: 'The first archive opens.',
    genre: 'Fantasy',
    mainConflict: 'Memory fades whenever the moons align.',
    premise: 'A world where moonlight writes history before people can.',
    startingLocation: 'The Glass Archive',
    tone: 'Mystic wonder',
  },
  title: 'Moon Archive',
};

describe('world routes', () => {
  test('creates a world atomically with seed, initial bible, founder membership, and audit log', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    const response = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: worldPayload,
      url: '/worlds',
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().world.title, 'Moon Archive');
    assert.equal(response.json().world.seed.genre, 'Fantasy');
    assert.equal(response.json().world.currentBibleVersion.versionNumber, 1);
    assert.equal(response.json().world.currentBibleVersion.publishedAt, null);
    assert.equal(state.worlds.length, 1);
    assert.equal(state.seeds.length, 1);
    assert.equal(state.bibleVersions.length, 1);
    assert.equal(state.memberships[0]?.role, WorldRole.FOUNDER);
    assert.deepEqual(state.auditLogs[0], {
      action: WorldAuditAction.ROLE_ASSIGNED,
      actorId: founder.id,
      metadata: {
        role: WorldRole.FOUNDER,
      },
      targetId: 'membership-1',
      targetType: 'WORLD_MEMBERSHIP',
      worldId: 'world-1',
    });
    await app.close();
  });

  test('requires authentication to create a world and ignores client founder role data', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    const response = await app.inject({
      method: 'POST',
      payload: {
        ...worldPayload,
        founderId: contributor.id,
        role: WorldRole.CURATOR,
      },
      url: '/worlds',
    });

    assert.equal(response.statusCode, 401);
    assert.equal(state.worlds.length, 0);
    await app.close();
  });

  test('authenticated creation succeeds and ignores client identity and role fields', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    const response = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        ...worldPayload,
        founderId: contributor.id,
        role: WorldRole.CURATOR,
      },
      url: '/worlds',
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().world.founderId, founder.id);
    assert.equal(state.memberships[0]?.userId, founder.id);
    assert.equal(state.memberships[0]?.role, WorldRole.FOUNDER);
    await app.close();
  });

  test('rejects invalid, null, oversized, and deeply nested world bible content', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    const missingContent = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        ...worldPayload,
        bible: {
          changeSummary: 'Missing content should not pass as undefined.',
        },
      },
      url: '/worlds',
    });
    const nullContent = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        ...worldPayload,
        bible: {
          content: null,
        },
      },
      url: '/worlds',
    });
    const oversized = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        ...worldPayload,
        bible: {
          content: {
            text: 'x'.repeat(101 * 1024),
          },
        },
      },
      url: '/worlds',
    });
    let deeplyNested: unknown = 'bottom';

    for (let depth = 0; depth < 42; depth += 1) {
      deeplyNested = { child: deeplyNested };
    }

    const nested = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        ...worldPayload,
        bible: {
          content: deeplyNested,
        },
      },
      url: '/worlds',
    });

    assert.equal(missingContent.statusCode, 400);
    assert.equal(nullContent.statusCode, 400);
    assert.equal(oversized.statusCode, 400);
    assert.equal(nested.statusCode, 400);
    assert.equal(state.worlds.length, 0);
    await app.close();
  });

  test('browses, retrieves, and opens a world hub response', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: worldPayload,
      url: '/worlds',
    });
    state.loreEntries.push({
      id: 'lore-1',
      loreType: 'CHARACTER',
      slug: 'archivist-lume',
      status: LoreStatus.PUBLISHED_CANON,
      title: 'Archivist Lume',
      updatedAt: new Date('2026-08-05T00:02:00.000Z'),
      worldId: 'world-1',
    });
    state.loreEntries.push({
      id: 'draft-lore',
      loreType: 'FACTION',
      slug: 'hidden-draft',
      status: LoreStatus.DRAFT,
      title: 'Hidden Draft',
      updatedAt: new Date('2026-08-05T00:03:00.000Z'),
      worldId: 'world-1',
    });
    state.proposals.push({
      id: 'proposal-1',
      status: ProposalStatus.SUBMITTED,
      worldId: 'world-1',
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/worlds?q=moon&page=1&pageSize=10',
    });
    const getResponse = await app.inject({
      method: 'GET',
      url: '/worlds/world-1',
    });
    const hubResponse = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/hub',
    });

    assert.equal(listResponse.statusCode, 200);
    assert.equal(listResponse.json().pagination.total, 1);
    assert.equal('content' in listResponse.json().worlds[0].currentBibleVersion, false);
    assert.equal(getResponse.statusCode, 200);
    assert.deepEqual(
      getResponse.json().world.currentBibleVersion.content,
      worldPayload.bible.content,
    );
    assert.equal(getResponse.json().world.seed.mainConflict, worldPayload.seed.mainConflict);
    assert.equal(hubResponse.statusCode, 200);
    assert.equal(hubResponse.json().stats.canonLoreCount, 1);
    assert.equal(hubResponse.json().stats.activeProposalCount, 1);
    assert.equal('draftLoreCount' in hubResponse.json().stats, false);
    assert.equal(hubResponse.json().latestLoreEntries[0].id, 'lore-1');
    assert.equal(
      hubResponse
        .json()
        .latestLoreEntries.some((entry: { id: string }) => entry.id === 'draft-lore'),
      false,
    );
    await app.close();
  });

  test('filters worlds by q, visibility fields, pagination, and consistent counts', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: worldPayload,
      url: '/worlds',
    });
    await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        ...worldPayload,
        description: 'Sunlit city state.',
        seed: {
          ...worldPayload.seed,
          genre: 'Science Fantasy',
          tone: 'Bright',
        },
        title: 'Solar Foundry',
      },
      url: '/worlds',
    });

    const search = await app.inject({ method: 'GET', url: '/worlds?q=moon&page=1&pageSize=10' });
    const filtered = await app.inject({
      method: 'GET',
      url: '/worlds?genre=fantasy&tone=mystic%20wonder&page=1&pageSize=1',
    });

    assert.deepEqual(
      search.json().worlds.map((world: { title: string }) => world.title),
      ['Moon Archive'],
    );
    assert.deepEqual(filtered.json().pagination, { page: 1, pageSize: 1, total: 1 });
    assert.equal(filtered.json().worlds.length, 1);
    await app.close();
  });

  test('allows a founder to update mutable off-chain world seed and bible data', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: worldPayload,
      url: '/worlds',
    });

    const response = await app.inject({
      headers: authHeader(),
      method: 'PATCH',
      payload: {
        bible: {
          changeSummary: 'Refined initial bible.',
          content: {
            rules: ['Keep the moon archive coherent.'],
          },
        },
        seed: {
          tone: 'Quiet awe',
        },
        title: 'Moon Archive Revised',
      },
      url: '/worlds/world-1',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().world.title, 'Moon Archive Revised');
    assert.equal(response.json().world.seed.tone, 'Quiet awe');
    assert.deepEqual(response.json().world.currentBibleVersion.content, {
      rules: ['Keep the moon archive coherent.'],
    });
    assert.equal(response.json().world.currentBibleVersion.publishedAt, null);
    assert.equal(
      state.auditLogs.some(
        (entry) =>
          (entry as { action?: WorldAuditAction }).action === WorldAuditAction.WORLD_BIBLE_UPDATED,
      ),
      true,
    );
    await app.close();
  });

  test('rejects published and Hive-anchored bible updates without audit records', async () => {
    const publishedState = createDatabase();
    const publishedApp = await createApp(publishedState.database);
    await publishedApp.inject({
      headers: authHeader(),
      method: 'POST',
      payload: worldPayload,
      url: '/worlds',
    });
    publishedState.bibleVersions[0]!.publishedAt = new Date('2026-08-05T00:05:00.000Z');

    const publishedResponse = await publishedApp.inject({
      headers: authHeader(),
      method: 'PATCH',
      payload: { bible: { content: { rules: ['No'] } } },
      url: '/worlds/world-1',
    });

    const anchoredState = createDatabase();
    const anchoredApp = await createApp(anchoredState.database);
    await anchoredApp.inject({
      headers: authHeader(),
      method: 'POST',
      payload: worldPayload,
      url: '/worlds',
    });
    anchoredState.bibleVersions[0]!.hiveReferenceId = 'hive-1';

    const anchoredResponse = await anchoredApp.inject({
      headers: authHeader(),
      method: 'PATCH',
      payload: { bible: { content: { rules: ['No'] } } },
      url: '/worlds/world-1',
    });

    assert.equal(publishedResponse.statusCode, 409);
    assert.equal(anchoredResponse.statusCode, 409);
    assert.deepEqual(publishedState.bibleVersions[0]!.content, worldPayload.bible.content);
    assert.deepEqual(anchoredState.bibleVersions[0]!.content, worldPayload.bible.content);
    assert.equal(
      publishedState.auditLogs.some(
        (entry) =>
          (entry as { action?: WorldAuditAction }).action === WorldAuditAction.WORLD_BIBLE_UPDATED,
      ),
      false,
    );
    await publishedApp.close();
    await anchoredApp.close();
  });

  test('rejects world updates without founder permissions', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: worldPayload,
      url: '/worlds',
    });

    const response = await app.inject({
      headers: authHeader(contributor.id),
      method: 'PATCH',
      payload: {
        title: 'Unauthorized',
      },
      url: '/worlds/world-1',
    });

    assert.equal(response.statusCode, 403);
    await app.close();
  });

  test('maps slug conflicts to 409 and rolls back failed creation steps', async () => {
    const conflictState = createDatabase();
    const app = await createApp(conflictState.database);
    const [first, second] = await Promise.all([
      app.inject({ headers: authHeader(), method: 'POST', payload: worldPayload, url: '/worlds' }),
      app.inject({ headers: authHeader(), method: 'POST', payload: worldPayload, url: '/worlds' }),
    ]);

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 201);
    assert.deepEqual(
      conflictState.worlds.map((world) => world.slug),
      ['moon-archive', 'moon-archive-2'],
    );

    const rollbackState = createDatabase();
    rollbackState.failNextSeedCreate();

    await assert.rejects(
      createWorld(rollbackState.database as never, {
        ...worldPayload,
        creatorId: founder.id,
      }),
    );

    assert.equal(rollbackState.worlds.length, 0);
    assert.equal(rollbackState.seeds.length, 0);
    assert.equal(rollbackState.bibleVersions.length, 0);
    await app.close();
  });

  test('translates database world slug uniqueness conflicts to 409', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    state.failNextWorldCreateWithSlugConflict();

    const response = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: worldPayload,
      url: '/worlds',
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error, 'World slug is already in use.');
    assert.equal(state.worlds.length, 0);
    await app.close();
  });

  test('rolls back bible updates when audit creation fails', async () => {
    const state = createDatabase();
    await createWorld(state.database as never, { ...worldPayload, creatorId: founder.id });
    state.failNextAuditCreate();

    await assert.rejects(
      updateWorld(state.database as never, {
        actorId: founder.id,
        bible: {
          content: {
            rules: ['Rollback me.'],
          },
        },
        worldId: 'world-1',
      }),
    );

    assert.deepEqual(state.bibleVersions[0]!.content, worldPayload.bible.content);
    assert.equal(
      state.auditLogs.some(
        (entry) =>
          (entry as { action?: WorldAuditAction }).action === WorldAuditAction.WORLD_BIBLE_UPDATED,
      ),
      false,
    );
  });

  test('returns typed errors for worlds missing seed or bible rows', async () => {
    const seedState = createDatabase();
    await createWorld(seedState.database as never, { ...worldPayload, creatorId: founder.id });
    seedState.seeds.length = 0;

    await assert.rejects(
      updateWorld(seedState.database as never, {
        actorId: founder.id,
        seed: {
          tone: 'No seed',
        },
        worldId: 'world-1',
      }),
      (error: unknown) => error instanceof Error && error.message === 'World seed is missing.',
    );

    const bibleState = createDatabase();
    await createWorld(bibleState.database as never, { ...worldPayload, creatorId: founder.id });
    bibleState.bibleVersions.length = 0;

    await assert.rejects(
      updateWorld(bibleState.database as never, {
        actorId: founder.id,
        bible: {
          content: {
            rules: [],
          },
        },
        worldId: 'world-1',
      }),
      (error: unknown) =>
        error instanceof Error && error.message === 'World bible version is missing.',
    );
  });
});
