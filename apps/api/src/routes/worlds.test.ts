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

  function includeWorld(
    world: StoredWorld,
    args: { include?: { bibleVersions?: { where?: { publishedAt?: { not?: null } } } } } = {},
  ) {
    const publishedOnly = args.include?.bibleVersions?.where?.publishedAt?.not === null;

    return {
      ...world,
      bibleVersions: bibleVersions
        .filter(
          (version) =>
            version.worldId === world.id && (!publishedOnly || version.publishedAt !== null),
        )
        .sort((left, right) => right.versionNumber - left.versionNumber)
        .slice(0, 1),
      founder: world.founder,
      seed: seeds.find((seed) => seed.worldId === world.id) ?? null,
    };
  }

  const database = {
    async $transaction<T>(this: unknown, callback: (transaction: never) => Promise<T>) {
      return callback(this as never);
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
    refreshSession: {
      async findUnique(args: {
        select: {
          expiresAt: true;
          revokedAt: true;
          userId: true;
        };
        where: {
          id: string;
        };
      }) {
        const userId = args.where.id.replace(/^session-/, '');

        if (userId !== founder.id && userId !== contributor.id) {
          return null;
        }

        return {
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          revokedAt: null,
          userId,
        };
      },
    },
    world: {
      async count() {
        return worlds.length;
      },
      async create(args: {
        data: {
          description: string;
          founderId: string;
          slug: string;
          title: string;
        };
      }) {
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
        include?: { bibleVersions?: { where?: { publishedAt?: { not?: null } } } };
        take: number;
        skip: number;
      }) {
        return worlds
          .slice(args.skip, args.skip + args.take)
          .map((world) => includeWorld(world, args));
      },
      async findUnique(args: {
        include?: { bibleVersions?: { where?: { publishedAt?: { not?: null } } } };
        where: { id?: string; slug?: string };
      }) {
        const world = worlds.find((candidate) => {
          if (args.where.id) {
            return candidate.id === args.where.id;
          }

          return candidate.slug === args.where.slug;
        });

        return world ? includeWorld(world, args) : null;
      },
      async findUniqueOrThrow(args: {
        include?: { bibleVersions?: { where?: { publishedAt?: { not?: null } } } };
        where: { id: string };
      }) {
        const world = worlds.find((candidate) => candidate.id === args.where.id);

        if (!world) {
          throw new Error('Missing world.');
        }

        return includeWorld(world, args);
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
  };

  return {
    auditLogs,
    bibleVersions,
    database,
    loreEntries,
    memberships,
    proposals,
    seeds,
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

  test('rejects non-json world bible content', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    const response = await app.inject({
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

    assert.equal(response.statusCode, 400);
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
    assert.equal(listResponse.json().worlds[0].currentBibleVersion, null);
    assert.equal(getResponse.statusCode, 200);
    assert.equal(getResponse.json().world.seed.mainConflict, worldPayload.seed.mainConflict);
    assert.equal(getResponse.json().world.currentBibleVersion, null);
    assert.equal(hubResponse.statusCode, 200);
    assert.equal(hubResponse.json().world.currentBibleVersion, null);
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

  test('public world responses expose only published bible versions', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: worldPayload,
      url: '/worlds',
    });
    state.bibleVersions.push({
      changeSummary: 'Published bible.',
      content: {
        rules: ['Published canon only.'],
      },
      createdAt: new Date('2026-08-05T00:04:00.000Z'),
      creatorId: founder.id,
      hiveReferenceId: 'hive-ref-1',
      id: 'bible-2',
      publishedAt: new Date('2026-08-05T00:05:00.000Z'),
      updatedAt: new Date('2026-08-05T00:05:00.000Z'),
      versionNumber: 2,
      worldId: 'world-1',
    });
    state.bibleVersions.push({
      changeSummary: 'Private draft.',
      content: {
        rules: ['Do not expose this draft.'],
      },
      createdAt: new Date('2026-08-05T00:06:00.000Z'),
      creatorId: founder.id,
      hiveReferenceId: null,
      id: 'bible-3',
      publishedAt: null,
      updatedAt: new Date('2026-08-05T00:06:00.000Z'),
      versionNumber: 3,
      worldId: 'world-1',
    });

    const hubResponse = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/hub',
    });

    assert.equal(hubResponse.statusCode, 200);
    assert.equal(hubResponse.json().world.currentBibleVersion.versionNumber, 2);
    assert.deepEqual(hubResponse.json().world.currentBibleVersion.content, {
      rules: ['Published canon only.'],
    });

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
    await app.close();
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
});
