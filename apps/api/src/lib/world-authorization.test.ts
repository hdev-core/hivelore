import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PlatformRole } from '../generated/prisma/enums.js';
import {
  authorizeWorldPermission,
  requireTrustedAuthenticatedUser,
  requireWorldPermission,
  resolveWorldMembership,
  type AuthorizedWorldMembership,
  type AuthenticatedUser,
  type WorldAuthorizationRequest,
  type WorldMembershipLookup,
} from './world-authorization.js';
import { WORLD_PERMISSIONS, WORLD_ROLES } from './world-permissions.js';

type TestRequest = WorldAuthorizationRequest & {
  body?: unknown;
  headers?: Record<string, string>;
  params?: {
    worldId?: string;
  };
  query?: unknown;
};

type ReplyPayload = {
  error: string;
};

function createReply() {
  return {
    statusCode: 200,
    payload: undefined as ReplyPayload | undefined,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send(payload: ReplyPayload) {
      this.payload = payload;
      return Promise.resolve(this);
    },
  };
}

function createDatabase(membership: AuthorizedWorldMembership | null) {
  const calls: Array<{ worldId: string; userId: string; revokedAt: null }> = [];
  const database: WorldMembershipLookup = {
    worldMembership: {
      async findUnique(args) {
        calls.push({
          ...args.where.worldId_userId,
          revokedAt: args.where.revokedAt,
        });
        return membership;
      },
    },
  };

  return {
    calls,
    database,
  };
}

const user: AuthenticatedUser = {
  id: 'user-1',
  hiveUsername: 'emberquill.dev',
  normalizedHiveUsername: 'emberquill.dev',
  platformRole: PlatformRole.USER,
};

const platformAdminUser: AuthenticatedUser = {
  ...user,
  id: 'platform-admin-1',
  platformRole: PlatformRole.ADMIN,
};

const contributorMembership: AuthorizedWorldMembership = {
  id: 'membership-1',
  worldId: 'world-1',
  userId: user.id,
  role: WORLD_ROLES.CONTRIBUTOR,
  revokedAt: null,
};

describe('world authorization', () => {
  test('allows an active member whose role includes the requested permission', async () => {
    const request: TestRequest = { user };
    const reply = createReply();
    const { calls, database } = createDatabase(contributorMembership);

    const allowed = await authorizeWorldPermission(
      request,
      reply,
      'world-1',
      WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
      database,
    );

    assert.equal(allowed, true);
    assert.equal(reply.statusCode, 200);
    assert.equal(reply.payload, undefined);
    assert.deepEqual(calls, [{ worldId: 'world-1', userId: user.id, revokedAt: null }]);
    assert.equal(request.worldMembership, contributorMembership);
  });

  test('denies a member whose role lacks the requested permission with 403', async () => {
    const request: TestRequest = { user };
    const reply = createReply();
    const { database } = createDatabase(contributorMembership);

    const allowed = await authorizeWorldPermission(
      request,
      reply,
      'world-1',
      WORLD_PERMISSIONS.MARK_SPAM_ABUSE,
      database,
    );

    assert.equal(allowed, false);
    assert.equal(reply.statusCode, 403);
    assert.deepEqual(reply.payload, { error: 'Insufficient world permissions.' });
    assert.equal(request.worldMembership, undefined);
  });

  test('rejects unauthenticated requests with 401 and no membership lookup', async () => {
    const request: TestRequest = {};
    const reply = createReply();
    const { calls, database } = createDatabase(contributorMembership);

    const allowed = await authorizeWorldPermission(
      request,
      reply,
      'world-1',
      WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
      database,
    );

    assert.equal(allowed, false);
    assert.equal(reply.statusCode, 401);
    assert.deepEqual(reply.payload, { error: 'Authentication required.' });
    assert.deepEqual(calls, []);
  });

  test('rejects client-supplied identity data unless trusted auth populated request.user', async () => {
    const request: TestRequest = {
      headers: {
        'x-user-id': user.id,
      },
      body: {
        user,
      },
      query: {
        userId: user.id,
      },
    };
    const reply = createReply();
    const { calls, database } = createDatabase(contributorMembership);

    const authenticatedUser = await requireTrustedAuthenticatedUser(request, reply);
    const allowed = await authorizeWorldPermission(
      request,
      reply,
      'world-1',
      WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
      database,
    );

    assert.equal(authenticatedUser, null);
    assert.equal(allowed, false);
    assert.equal(reply.statusCode, 401);
    assert.deepEqual(reply.payload, { error: 'Authentication required.' });
    assert.deepEqual(calls, []);
  });

  test('rejects authenticated non-members with 403', async () => {
    const request: TestRequest = { user };
    const reply = createReply();
    const { calls, database } = createDatabase(null);

    const allowed = await authorizeWorldPermission(
      request,
      reply,
      'world-1',
      WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
      database,
    );

    assert.equal(allowed, false);
    assert.equal(reply.statusCode, 403);
    assert.deepEqual(reply.payload, { error: 'Insufficient world permissions.' });
    assert.deepEqual(calls, [{ worldId: 'world-1', userId: user.id, revokedAt: null }]);
  });

  test('does not grant platform admins implicit world permissions', async () => {
    const request: TestRequest = { user: platformAdminUser };
    const reply = createReply();
    const { calls, database } = createDatabase(null);

    const allowed = await authorizeWorldPermission(
      request,
      reply,
      'world-1',
      WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
      database,
    );

    assert.equal(allowed, false);
    assert.equal(reply.statusCode, 403);
    assert.deepEqual(reply.payload, { error: 'Insufficient world permissions.' });
    assert.deepEqual(calls, [
      { worldId: 'world-1', userId: platformAdminUser.id, revokedAt: null },
    ]);
  });

  test('rejects revoked memberships with 403', async () => {
    const request: TestRequest = { user };
    const reply = createReply();
    const { calls, database } = createDatabase(null);

    const allowed = await authorizeWorldPermission(
      request,
      reply,
      'world-1',
      WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
      database,
    );

    assert.equal(allowed, false);
    assert.equal(reply.statusCode, 403);
    assert.deepEqual(reply.payload, { error: 'Insufficient world permissions.' });
    assert.deepEqual(calls, [{ worldId: 'world-1', userId: user.id, revokedAt: null }]);
  });

  test('caches membership lookups per request and world', async () => {
    const request: TestRequest = { user };
    const { calls, database } = createDatabase(contributorMembership);

    const first = await resolveWorldMembership(request, 'world-1', database);
    const second = await resolveWorldMembership(request, 'world-1', database);

    assert.equal(first, contributorMembership);
    assert.equal(second, contributorMembership);
    assert.deepEqual(calls, [{ worldId: 'world-1', userId: user.id, revokedAt: null }]);
  });

  test('returns reusable pre-handler middleware without attaching it globally', async () => {
    const request: TestRequest = {
      user,
      params: {
        worldId: 'world-1',
      },
    };
    const reply = createReply();
    const { database } = createDatabase(contributorMembership);
    const preHandler = requireWorldPermission(
      WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
      (fastifyRequest) => (fastifyRequest.params as TestRequest['params'] | undefined)?.worldId,
      database,
    );

    await preHandler.call(undefined as never, request as never, reply as never, undefined as never);

    assert.equal(reply.statusCode, 200);
    assert.equal(request.worldMembership, contributorMembership);
  });
});
