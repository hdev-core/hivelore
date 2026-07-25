import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { LoreStatus, PlatformRole } from '../generated/prisma/enums.js';
import type { AuthorizedWorldMembership, AuthenticatedUser } from './world-authorization.js';
import {
  canCreateVote,
  canEditAnyDraft,
  canEditOwnDraft,
  canReviewModerationReport,
  ensureResourceBelongsToWorld,
  type ExistingVoteLookup,
} from './world-resource-policies.js';
import { WORLD_ROLES } from './world-permissions.js';

const user: AuthenticatedUser = {
  id: 'user-1',
  hiveUsername: 'emberquill.dev',
  normalizedHiveUsername: 'emberquill.dev',
  platformRole: PlatformRole.USER,
};

const contributorMembership: AuthorizedWorldMembership = {
  id: 'membership-1',
  worldId: 'world-1',
  userId: user.id,
  role: WORLD_ROLES.CONTRIBUTOR,
  revokedAt: null,
};

const readerMembership: AuthorizedWorldMembership = {
  ...contributorMembership,
  role: WORLD_ROLES.READER,
};

const curatorMembership: AuthorizedWorldMembership = {
  ...contributorMembership,
  role: WORLD_ROLES.CURATOR,
};

const otherWorldCuratorMembership: AuthorizedWorldMembership = {
  ...curatorMembership,
  id: 'membership-2',
  worldId: 'world-2',
};

function createVoteDatabase(existingVote: { id: string } | null) {
  const calls: Array<{ proposalId: string; voterId: string }> = [];
  const database: ExistingVoteLookup = {
    appVote: {
      async findUnique(args) {
        calls.push(args.where.proposalId_voterId);
        return existingVote;
      },
    },
  };

  return {
    calls,
    database,
  };
}

describe('world resource policies', () => {
  test('allows editing one own draft', () => {
    const decision = canEditOwnDraft({
      user,
      membership: contributorMembership,
      routeWorldId: 'world-1',
      resource: {
        worldId: 'world-1',
        authorId: user.id,
        status: LoreStatus.DRAFT,
      },
    });

    assert.deepEqual(decision, { allowed: true });
  });

  test('denies editing someone else own draft through own-draft policy', () => {
    const decision = canEditOwnDraft({
      user,
      membership: contributorMembership,
      routeWorldId: 'world-1',
      resource: {
        worldId: 'world-1',
        authorId: 'other-user',
        status: LoreStatus.DRAFT,
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 403,
      error: 'Only the draft author can edit this resource.',
    });
  });

  test('denies own-draft editing for non-draft resources', () => {
    const decision = canEditOwnDraft({
      user,
      membership: contributorMembership,
      routeWorldId: 'world-1',
      resource: {
        worldId: 'world-1',
        authorId: user.id,
        status: LoreStatus.SUBMITTED,
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 403,
      error: 'Only drafts can be edited by this policy.',
    });
  });

  test('denies own-draft editing without edit-own-draft permissions', () => {
    const decision = canEditOwnDraft({
      user,
      membership: readerMembership,
      routeWorldId: 'world-1',
      resource: {
        worldId: 'world-1',
        authorId: user.id,
        status: LoreStatus.DRAFT,
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    });
  });

  test('denies own-draft editing for a resource from another world', () => {
    const decision = canEditOwnDraft({
      user,
      membership: contributorMembership,
      routeWorldId: 'world-1',
      resource: {
        worldId: 'world-2',
        authorId: user.id,
        status: LoreStatus.DRAFT,
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 404,
      error: 'Resource not found in this world.',
    });
  });

  test('allows curators to edit any draft', () => {
    const decision = canEditAnyDraft({
      membership: curatorMembership,
      routeWorldId: 'world-1',
      resource: {
        worldId: 'world-1',
        authorId: 'other-user',
        status: LoreStatus.DRAFT,
      },
    });

    assert.deepEqual(decision, { allowed: true });
  });

  test('denies contributors editing any draft', () => {
    const decision = canEditAnyDraft({
      membership: contributorMembership,
      routeWorldId: 'world-1',
      resource: {
        worldId: 'world-1',
        authorId: 'other-user',
        status: LoreStatus.DRAFT,
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    });
  });

  test('denies own-draft editing with a membership from another world', () => {
    const decision = canEditOwnDraft({
      user,
      membership: {
        ...contributorMembership,
        worldId: 'world-2',
      },
      routeWorldId: 'world-1',
      resource: {
        worldId: 'world-1',
        authorId: user.id,
        status: LoreStatus.DRAFT,
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    });
  });

  test('denies any-draft editing with a valid curator membership from another world', () => {
    const decision = canEditAnyDraft({
      membership: otherWorldCuratorMembership,
      routeWorldId: 'world-1',
      resource: {
        worldId: 'world-1',
        authorId: 'other-user',
        status: LoreStatus.DRAFT,
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    });
  });

  test('denies any-draft editing for a resource from another world', () => {
    const decision = canEditAnyDraft({
      membership: curatorMembership,
      routeWorldId: 'world-1',
      resource: {
        worldId: 'world-2',
        authorId: 'other-user',
        status: LoreStatus.DRAFT,
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 404,
      error: 'Resource not found in this world.',
    });
  });

  test('prevents duplicate votes', async () => {
    const { calls, database } = createVoteDatabase({ id: 'vote-1' });

    const decision = await canCreateVote({
      user,
      membership: contributorMembership,
      proposalId: 'proposal-1',
      proposal: {
        worldId: 'world-1',
      },
      routeWorldId: 'world-1',
      database,
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 409,
      error: 'User has already voted on this proposal.',
    });
    assert.deepEqual(calls, [{ proposalId: 'proposal-1', voterId: user.id }]);
  });

  test('allows first vote', async () => {
    const { calls, database } = createVoteDatabase(null);

    const decision = await canCreateVote({
      user,
      membership: contributorMembership,
      proposalId: 'proposal-1',
      proposal: {
        worldId: 'world-1',
      },
      routeWorldId: 'world-1',
      database,
    });

    assert.deepEqual(decision, { allowed: true });
    assert.deepEqual(calls, [{ proposalId: 'proposal-1', voterId: user.id }]);
  });

  test('prevents self-moderation of a report', () => {
    const decision = canReviewModerationReport({
      user,
      membership: curatorMembership,
      routeWorldId: 'world-1',
      report: {
        worldId: 'world-1',
        reporterId: user.id,
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 403,
      error: 'Users cannot moderate their own reports.',
    });
  });

  test('allows reviewing reports submitted by another user', () => {
    const decision = canReviewModerationReport({
      user,
      membership: curatorMembership,
      routeWorldId: 'world-1',
      report: {
        worldId: 'world-1',
        reporterId: 'other-user',
      },
    });

    assert.deepEqual(decision, { allowed: true });
  });

  test('rejects resources outside the route world and skips duplicate vote lookup', async () => {
    const { calls, database } = createVoteDatabase(null);

    const decision = await canCreateVote({
      user,
      membership: contributorMembership,
      proposalId: 'proposal-1',
      proposal: {
        worldId: 'world-2',
      },
      routeWorldId: 'world-1',
      database,
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 404,
      error: 'Resource not found in this world.',
    });
    assert.deepEqual(calls, []);
  });

  test('rejects missing resources as not found in route world', () => {
    const decision = ensureResourceBelongsToWorld(null, 'world-1');

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 404,
      error: 'Resource not found in this world.',
    });
  });

  test('denies voting with a membership from another world', async () => {
    const { calls, database } = createVoteDatabase(null);

    const decision = await canCreateVote({
      user,
      membership: {
        ...contributorMembership,
        worldId: 'world-2',
      },
      proposalId: 'proposal-1',
      proposal: {
        worldId: 'world-1',
      },
      routeWorldId: 'world-1',
      database,
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    });
    assert.deepEqual(calls, []);
  });

  test('denies voting for a proposal from another world', async () => {
    const { calls, database } = createVoteDatabase(null);

    const decision = await canCreateVote({
      user,
      membership: contributorMembership,
      proposalId: 'proposal-1',
      proposal: {
        worldId: 'world-2',
      },
      routeWorldId: 'world-1',
      database,
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 404,
      error: 'Resource not found in this world.',
    });
    assert.deepEqual(calls, []);
  });

  test('denies moderation review with a membership from another world', () => {
    const decision = canReviewModerationReport({
      user,
      membership: otherWorldCuratorMembership,
      routeWorldId: 'world-1',
      report: {
        worldId: 'world-1',
        reporterId: 'other-user',
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    });
  });

  test('denies moderation review for a report from another world', () => {
    const decision = canReviewModerationReport({
      user,
      membership: curatorMembership,
      routeWorldId: 'world-1',
      report: {
        worldId: 'world-2',
        reporterId: 'other-user',
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 404,
      error: 'Resource not found in this world.',
    });
  });

  test('denies moderation review without curator permissions', () => {
    const decision = canReviewModerationReport({
      user,
      membership: contributorMembership,
      routeWorldId: 'world-1',
      report: {
        worldId: 'world-1',
        reporterId: 'other-user',
      },
    });

    assert.deepEqual(decision, {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    });
  });
});
