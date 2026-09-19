import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  backfillFounderMemberships,
  createWorldWithFounderMembership,
  ensureActiveFounderMembership,
  FounderMembershipBackfillError,
  type ActiveFounderMembershipDatabase,
  type FounderMembershipBackfillDatabase,
} from './founder-memberships.js';
import { WORLD_ROLES } from './world-permissions.js';

type WorldFixture = {
  id: string;
  founderId: string | null;
  founder: { id: string } | null;
};

type MembershipFixture = {
  id: string;
  worldId: string;
  userId: string;
  role: string;
  revokedAt: Date | null;
};

function createDatabase(args: {
  worlds: WorldFixture[];
  memberships?: MembershipFixture[];
}): FounderMembershipBackfillDatabase & {
  memberships: MembershipFixture[];
  createdMemberships: MembershipFixture[];
  createdWorlds: Array<{ slug: string; title: string; description: string; founderId: string }>;
} {
  const memberships = [...(args.memberships ?? [])];
  const createdMemberships: MembershipFixture[] = [];
  const createdWorlds: Array<{
    slug: string;
    title: string;
    description: string;
    founderId: string;
  }> = [];

  return {
    memberships,
    createdMemberships,
    createdWorlds,
    world: {
      async findMany() {
        return args.worlds;
      },
      async create(createArgs) {
        createdWorlds.push(createArgs.data);
        return {
          id: `world-${createdWorlds.length}`,
          founderId: createArgs.data.founderId,
        };
      },
    },
    worldMembership: {
      async findUnique(findArgs) {
        const { worldId, userId } = findArgs.where.worldId_userId;
        return (
          memberships.find(
            (membership) => membership.worldId === worldId && membership.userId === userId,
          ) ?? null
        );
      },
      async create(createArgs) {
        const membership: MembershipFixture = {
          id: `membership-${memberships.length + 1}`,
          worldId: createArgs.data.worldId,
          userId: createArgs.data.userId,
          role: createArgs.data.role,
          revokedAt: null,
        };
        memberships.push(membership);
        createdMemberships.push(membership);
        return membership;
      },
    },
    async $transaction(callback) {
      return callback(this);
    },
  };
}

describe('founder membership backfill', () => {
  test('creates FOUNDER membership for an existing world creator', async () => {
    const database = createDatabase({
      worlds: [{ id: 'world-1', founderId: 'user-1', founder: { id: 'user-1' } }],
    });

    const result = await backfillFounderMemberships(database);

    assert.deepEqual(result, {
      created: [{ worldId: 'world-1', userId: 'user-1' }],
      unchanged: [],
    });
    assert.deepEqual(database.createdMemberships, [
      {
        id: 'membership-1',
        worldId: 'world-1',
        userId: 'user-1',
        role: WORLD_ROLES.FOUNDER,
        revokedAt: null,
      },
    ]);
  });

  test('rerunning the backfill creates no duplicate memberships', async () => {
    const database = createDatabase({
      worlds: [{ id: 'world-1', founderId: 'user-1', founder: { id: 'user-1' } }],
    });

    await backfillFounderMemberships(database);
    const secondResult = await backfillFounderMemberships(database);

    assert.deepEqual(secondResult, {
      created: [],
      unchanged: [{ worldId: 'world-1', userId: 'user-1', membershipId: 'membership-1' }],
    });
    assert.equal(database.memberships.length, 1);
  });

  test('leaves an existing active FOUNDER membership unchanged', async () => {
    const database = createDatabase({
      worlds: [{ id: 'world-1', founderId: 'user-1', founder: { id: 'user-1' } }],
      memberships: [
        {
          id: 'membership-existing',
          worldId: 'world-1',
          userId: 'user-1',
          role: WORLD_ROLES.FOUNDER,
          revokedAt: null,
        },
      ],
    });

    const result = await backfillFounderMemberships(database);

    assert.deepEqual(result, {
      created: [],
      unchanged: [{ worldId: 'world-1', userId: 'user-1', membershipId: 'membership-existing' }],
    });
    assert.deepEqual(database.createdMemberships, []);
  });

  test('reports conflicting active roles without creating memberships', async () => {
    const database = createDatabase({
      worlds: [{ id: 'world-1', founderId: 'user-1', founder: { id: 'user-1' } }],
      memberships: [
        {
          id: 'membership-reader',
          worldId: 'world-1',
          userId: 'user-1',
          role: WORLD_ROLES.READER,
          revokedAt: null,
        },
      ],
    });

    await assert.rejects(backfillFounderMemberships(database), (error: unknown) => {
      assert.equal(error instanceof FounderMembershipBackfillError, true);
      assert.deepEqual((error as FounderMembershipBackfillError).conflicts, [
        {
          type: 'ACTIVE_ROLE_CONFLICT',
          worldId: 'world-1',
          founderId: 'user-1',
          membershipId: 'membership-reader',
          role: WORLD_ROLES.READER,
        },
      ]);
      return true;
    });
    assert.deepEqual(database.createdMemberships, []);
  });

  test('does not silently reactivate revoked founder memberships', async () => {
    const revokedAt = new Date('2026-01-01T00:00:00.000Z');
    const database = createDatabase({
      worlds: [{ id: 'world-1', founderId: 'user-1', founder: { id: 'user-1' } }],
      memberships: [
        {
          id: 'membership-revoked',
          worldId: 'world-1',
          userId: 'user-1',
          role: WORLD_ROLES.FOUNDER,
          revokedAt,
        },
      ],
    });

    await assert.rejects(backfillFounderMemberships(database), (error: unknown) => {
      assert.equal(error instanceof FounderMembershipBackfillError, true);
      assert.deepEqual((error as FounderMembershipBackfillError).conflicts, [
        {
          type: 'REVOKED_MEMBERSHIP',
          worldId: 'world-1',
          founderId: 'user-1',
          membershipId: 'membership-revoked',
          role: WORLD_ROLES.FOUNDER,
          revokedAt,
        },
      ]);
      return true;
    });
    assert.deepEqual(database.createdMemberships, []);
  });

  test('reports missing creator references without creating memberships', async () => {
    const database = createDatabase({
      worlds: [{ id: 'world-1', founderId: 'missing-user', founder: null }],
    });

    await assert.rejects(backfillFounderMemberships(database), (error: unknown) => {
      assert.equal(error instanceof FounderMembershipBackfillError, true);
      assert.deepEqual((error as FounderMembershipBackfillError).conflicts, [
        {
          type: 'MISSING_FOUNDER',
          worldId: 'world-1',
          founderId: 'missing-user',
        },
      ]);
      return true;
    });
    assert.deepEqual(database.createdMemberships, []);
  });

  test('seed helper force-normalizes disposable fixture data to one active founder membership', async () => {
    const memberships: MembershipFixture[] = [
      {
        id: 'membership-existing',
        worldId: 'world-1',
        userId: 'user-1',
        role: WORLD_ROLES.READER,
        revokedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    const database: ActiveFounderMembershipDatabase = {
      worldMembership: {
        async upsert(args) {
          const existing = memberships.find(
            (membership) =>
              membership.worldId === args.where.worldId_userId.worldId &&
              membership.userId === args.where.worldId_userId.userId,
          );

          if (existing) {
            existing.role = args.update.role;
            existing.revokedAt = args.update.revokedAt;
            return existing;
          }

          const membership = {
            id: `membership-${memberships.length + 1}`,
            worldId: args.create.worldId,
            userId: args.create.userId,
            role: args.create.role,
            revokedAt: null,
          };
          memberships.push(membership);
          return membership;
        },
      },
    };

    await ensureActiveFounderMembership(database, { worldId: 'world-1', userId: 'user-1' });
    await ensureActiveFounderMembership(database, { worldId: 'world-1', userId: 'user-1' });

    const activeFounderMemberships = memberships.filter(
      (membership) =>
        membership.worldId === 'world-1' &&
        membership.userId === 'user-1' &&
        membership.role === WORLD_ROLES.FOUNDER &&
        membership.revokedAt === null,
    );

    assert.equal(activeFounderMemberships.length, 1);
    assert.deepEqual(memberships, [
      {
        id: 'membership-existing',
        worldId: 'world-1',
        userId: 'user-1',
        role: WORLD_ROLES.FOUNDER,
        revokedAt: null,
      },
    ]);
  });

  test('new-world helper creates world and founder membership in one transaction', async () => {
    const database = createDatabase({
      worlds: [],
    });

    const world = await createWorldWithFounderMembership(database, {
      slug: 'new-world',
      title: 'New World',
      description: 'A test world.',
      founderId: 'user-1',
    });

    assert.deepEqual(world, {
      id: 'world-1',
      founderId: 'user-1',
    });
    assert.deepEqual(database.createdMemberships, [
      {
        id: 'membership-1',
        worldId: 'world-1',
        userId: 'user-1',
        role: WORLD_ROLES.FOUNDER,
        revokedAt: null,
      },
    ]);
  });
});
