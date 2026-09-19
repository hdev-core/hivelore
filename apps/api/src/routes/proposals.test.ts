import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { env } from '../config/env.js';
import {
  PlatformRole,
  ProposalDecisionOutcome,
  ProposalStatus,
  WorldAuditAction,
  WorldRole,
} from '../generated/prisma/enums.js';
import { signAccessToken } from '../lib/auth-crypto.js';
import { hashCanonicalJson } from '../lib/canon-voting-policy.js';
import { HIVELORE_CUSTOM_JSON_ID } from '../lib/hive/constants.js';
import { buildHiveLoreCustomJsonOperation } from '../lib/hive/operations.js';
import { PROPOSAL_COMMENT_MAX_LENGTH } from '../lib/proposal-comments.js';
import { registerProposalRoutes } from './proposals.js';

const author = {
  hiveUsername: 'mira-vale.dev',
  id: 'user-author',
  normalizedHiveUsername: 'mira-vale.dev',
};

const reader = {
  hiveUsername: 'emberquill.dev',
  id: 'user-reader',
  normalizedHiveUsername: 'emberquill.dev',
};

const outsider = {
  hiveUsername: 'stranger.dev',
  id: 'user-outsider',
  normalizedHiveUsername: 'stranger.dev',
};

function authHeader(user = reader) {
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

function now(offsetMs = 0) {
  return new Date(new Date('2026-08-10T12:00:00.000Z').getTime() + offsetMs);
}

const openVotingEndsAt = new Date('2099-08-12T12:00:00.000Z');

type StoredComment = {
  authorId: string;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
  deletedById: string | null;
  id: string;
  proposalId: string;
};

function encodeCursor(input: { createdAt: string; id: string }) {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
}

const decisionPayload = {
  counts: {
    alternateTimeline: 0,
    approve: 7,
    needsRevision: 0,
    reject: 3,
    total: 10,
  },
  eventType: 'canon_decision',
  outcome: ProposalDecisionOutcome.APPROVED_FOR_PUBLICATION,
  proposalId: 'proposal-1',
  worldId: 'world-1',
};

function createDecision() {
  return {
    aiWarningAcknowledged: false,
    aiWarningSummary: null,
    alternateTimelineCount: 0,
    approvalDenominator: 10,
    approvalNumerator: 7,
    approvalPercentageBps: 7000,
    approvalThresholdBps: 7000,
    approveCount: 7,
    blockchainTimestamp: null,
    blockNumber: null,
    contentHash: 'content-hash',
    createdAt: now(),
    customJsonId: HIVELORE_CUSTOM_JSON_ID,
    decidedAt: now(),
    decisionPayload,
    decisionPayloadHash: hashCanonicalJson(decisionPayload),
    expectedSigner: 'mira-vale.dev',
    hiveEventId: null,
    id: 'decision-1',
    minimumVotes: 5,
    needsRevisionCount: 0,
    operationIndex: null,
    outcome: ProposalDecisionOutcome.APPROVED_FOR_PUBLICATION,
    rejectCount: 3,
    rulesVersion: 'canon-voting-mvp-2026-08-12',
    totalVotes: 10,
    transactionId: null,
    updatedAt: now(),
    votingWindowHours: 48,
  };
}

function createConfirmedOperation(transactionId = 'tx-valid') {
  return {
    blockNumber: BigInt(100),
    blockchainTimestamp: new Date('2026-08-12T12:05:00.000Z'),
    operation: buildHiveLoreCustomJsonOperation({
      action: 'canon_approval',
      entityId: 'decision-1',
      entityType: 'CANON_DECISION',
      payload: decisionPayload,
      proposalId: 'proposal-1',
      signer: 'mira-vale.dev',
      worldId: 'world-1',
    }),
    operationIndex: 0,
    transactionId,
  };
}

function createDatabase() {
  const decision = createDecision();
  const users = [
    { ...author, avatarUrl: null, displayName: 'Mira Vale' },
    { ...reader, avatarUrl: null, displayName: null },
    { ...outsider, avatarUrl: null, displayName: null },
  ];
  const proposals = [
    {
      author: {
        hiveUsername: author.hiveUsername,
        id: author.id,
      },
      authorId: author.id,
      decision: null,
      id: 'proposal-1',
      status: ProposalStatus.VOTING,
      votingEndsAt: openVotingEndsAt,
      worldId: 'world-1',
    },
    {
      author: {
        hiveUsername: author.hiveUsername,
        id: author.id,
      },
      authorId: author.id,
      decision: null,
      id: 'proposal-closed',
      status: ProposalStatus.REJECTED,
      votingEndsAt: now(-1),
      worldId: 'world-1',
    },
    {
      author: {
        hiveUsername: author.hiveUsername,
        id: author.id,
      },
      authorId: author.id,
      decision: null,
      id: 'proposal-same-world',
      status: ProposalStatus.VOTING,
      votingEndsAt: openVotingEndsAt,
      worldId: 'world-1',
    },
    {
      author: {
        hiveUsername: author.hiveUsername,
        id: author.id,
      },
      authorId: author.id,
      decision: null,
      id: 'proposal-2',
      status: ProposalStatus.VOTING,
      votingEndsAt: openVotingEndsAt,
      worldId: 'world-2',
    },
  ];
  const memberships = [
    {
      id: 'membership-reader',
      revokedAt: null,
      role: WorldRole.READER,
      userId: reader.id,
      worldId: 'world-1',
    },
    {
      id: 'membership-author',
      revokedAt: null,
      role: WorldRole.CONTRIBUTOR,
      userId: author.id,
      worldId: 'world-1',
    },
  ];
  const comments: StoredComment[] = [];
  const appVotes: unknown[] = [];
  const auditLogs: unknown[] = [];
  const events: unknown[] = [];
  const touchedVotes: string[] = [];

  function includeAuthor(comment: StoredComment) {
    const user = users.find((candidate) => candidate.id === comment.authorId)!;

    return {
      ...comment,
      author: {
        avatarUrl: user.avatarUrl,
        displayName: user.displayName,
        hiveUsername: user.hiveUsername,
        id: user.id,
      },
    };
  }

  const database = {
    appVote: {
      async create() {
        touchedVotes.push('create');
      },
      async update() {
        touchedVotes.push('update');
      },
      async upsert(args: { create: { choice: string; proposalId: string; voterId: string } }) {
        touchedVotes.push('upsert');
        const vote = {
          ...args.create,
          createdAt: now(),
          id: `vote-${touchedVotes.length}`,
          updatedAt: now(),
        };
        appVotes.push(vote);
        return vote;
      },
    },
    proposal: {
      async findFirst(args: { where: { id: string; worldId: string } }) {
        return (
          proposals.find(
            (proposal) => proposal.id === args.where.id && proposal.worldId === args.where.worldId,
          ) ?? null
        );
      },
    },
    proposalComment: {
      async count(args: { where: { deletedAt?: null; proposalId: string } }) {
        return comments.filter(
          (comment) =>
            comment.proposalId === args.where.proposalId &&
            (!('deletedAt' in args.where) || comment.deletedAt === args.where.deletedAt),
        ).length;
      },
      async create(args: { data: { authorId: string; body: string; proposalId: string } }) {
        const comment = {
          ...args.data,
          createdAt: now(comments.length),
          deletedAt: null,
          deletedById: null,
          id: `comment-${comments.length + 1}`,
        };
        comments.push(comment);
        return includeAuthor(comment);
      },
      async findMany(args: {
        orderBy: unknown;
        take: number;
        where: {
          OR?: Array<{
            createdAt: Date | { gt: Date };
            id?: { gt: string };
          }>;
          proposalId: string;
        };
      }) {
        return comments
          .filter((comment) => comment.proposalId === args.where.proposalId)
          .filter((comment) => {
            if (!args.where.OR) {
              return true;
            }

            return args.where.OR.some((condition) => {
              if (
                condition.createdAt instanceof Date &&
                condition.id &&
                comment.createdAt.getTime() === condition.createdAt.getTime()
              ) {
                return comment.id > condition.id.gt;
              }

              if (
                typeof condition.createdAt === 'object' &&
                'gt' in condition.createdAt &&
                condition.createdAt.gt instanceof Date
              ) {
                return comment.createdAt.getTime() > condition.createdAt.gt.getTime();
              }

              return false;
            });
          })
          .sort((left, right) => {
            const createdAtOrder = left.createdAt.getTime() - right.createdAt.getTime();

            if (createdAtOrder !== 0) {
              return createdAtOrder;
            }

            return left.id.localeCompare(right.id);
          })
          .slice(0, args.take)
          .map(includeAuthor);
      },
    },
    proposalDecision: {
      async findUnique(args: { where: { id: string } }) {
        return args.where.id === decision.id ? decision : null;
      },
      async update(args: { data: Record<string, unknown> }) {
        Object.assign(decision, args.data);
        return decision;
      },
      async updateMany(args: {
        data: Record<string, unknown>;
        where: {
          hiveEventId: null;
          id: string;
          operationIndex: null;
          transactionId: null;
        };
      }) {
        if (
          args.where.id === decision.id &&
          decision.hiveEventId === null &&
          decision.operationIndex === null &&
          decision.transactionId === null
        ) {
          Object.assign(decision, args.data);
          return { count: 1 };
        }

        return { count: 0 };
      },
    },
    hiveEvent: {
      async upsert(args: {
        create: { operationIndex: number; transactionId: string };
        update: Record<string, unknown>;
        where: { transactionId_operationIndex: { operationIndex: number; transactionId: string } };
      }) {
        const existing = events.find(
          (event) =>
            (event as { operationIndex: number; transactionId: string }).operationIndex ===
              args.where.transactionId_operationIndex.operationIndex &&
            (event as { operationIndex: number; transactionId: string }).transactionId ===
              args.where.transactionId_operationIndex.transactionId,
        );

        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        }

        const event = {
          id: `event-${events.length + 1}`,
          ...args.create,
        };
        events.push(event);
        return event;
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
    worldMembership: {
      async findUnique(args: {
        where: { worldId_userId: { userId: string; worldId: string }; revokedAt: null };
      }) {
        return (
          memberships.find(
            (membership) =>
              membership.userId === args.where.worldId_userId.userId &&
              membership.worldId === args.where.worldId_userId.worldId &&
              !membership.revokedAt,
          ) ?? null
        );
      },
    },
    worldAuditLog: {
      async create(args: { data: unknown }) {
        auditLogs.push(args.data);
        return args.data;
      },
    },
    $transaction<T>(callback: (transaction: unknown) => Promise<T>) {
      return callback(database);
    },
  };

  return {
    appVotes,
    auditLogs,
    comments,
    database,
    decision,
    events,
    memberships,
    proposals,
    touchedVotes,
  };
}

async function createApp(
  database: ReturnType<typeof createDatabase>['database'],
  options: Parameters<typeof registerProposalRoutes>[1] = {},
) {
  const app = Fastify();
  await app.register(rateLimit, {
    global: false,
  });
  await registerProposalRoutes(app, {
    database: database as never,
    ...options,
  });
  return app;
}

function attachConfirmedDecision(state: ReturnType<typeof createDatabase>) {
  (state.proposals[0] as { decision: ReturnType<typeof createDecision> | null }).decision =
    state.decision;
}

describe('proposal comment routes', () => {
  test('authenticated eligible user can create a trimmed comment without creating votes or trusting protected fields', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);

    const protectedFieldResponse = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        authorId: author.id,
        body: 'Nope',
        createdAt: '2026-08-10T00:00:00.000Z',
        role: WorldRole.CURATOR,
      },
      url: '/worlds/world-1/proposals/proposal-1/comments',
    });
    const response = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        body: '  <script>alert("x")</script>\nUseful note.  ',
      },
      url: '/worlds/world-1/proposals/proposal-1/comments',
    });

    assert.equal(protectedFieldResponse.statusCode, 400);
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().comment.authorId, reader.id);
    assert.equal(response.json().comment.body, '<script>alert("x")</script>\nUseful note.');
    assert.equal(state.comments.length, 1);
    assert.equal(state.comments[0]?.proposalId, 'proposal-1');
    assert.equal(state.comments[0]?.authorId, reader.id);
    assert.equal(state.touchedVotes.length, 0);
    assert.equal(state.appVotes.length, 0);
    await app.close();
  });

  test('rejects unauthenticated, unauthorized, empty, whitespace, oversized, unknown, and world-mismatched comment writes', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);

    const unauthenticated = await app.inject({
      method: 'POST',
      payload: { body: 'Hello' },
      url: '/worlds/world-1/proposals/proposal-1/comments',
    });
    const forbidden = await app.inject({
      headers: authHeader(outsider),
      method: 'POST',
      payload: { body: 'Hello' },
      url: '/worlds/world-1/proposals/proposal-1/comments',
    });
    const empty = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: { body: '' },
      url: '/worlds/world-1/proposals/proposal-1/comments',
    });
    const whitespace = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: { body: '   \n\t' },
      url: '/worlds/world-1/proposals/proposal-1/comments',
    });
    const maxLength = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: { body: 'x'.repeat(PROPOSAL_COMMENT_MAX_LENGTH) },
      url: '/worlds/world-1/proposals/proposal-1/comments',
    });
    const oversized = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: { body: 'x'.repeat(PROPOSAL_COMMENT_MAX_LENGTH + 1) },
      url: '/worlds/world-1/proposals/proposal-1/comments',
    });
    const missingProposal = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: { body: 'Hello' },
      url: '/worlds/world-1/proposals/missing/comments',
    });
    const wrongWorld = await app.inject({
      headers: authHeader(author),
      method: 'POST',
      payload: { body: 'Hello' },
      url: '/worlds/world-2/proposals/proposal-1/comments',
    });

    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(forbidden.statusCode, 403);
    assert.equal(empty.statusCode, 400);
    assert.equal(whitespace.statusCode, 400);
    assert.equal(maxLength.statusCode, 201);
    assert.equal(oversized.statusCode, 400);
    assert.equal(missingProposal.statusCode, 404);
    assert.equal(wrongWorld.statusCode, 403, wrongWorld.body);
    assert.equal(state.comments.length, 1);
    await app.close();
  });

  test('comments are readable in deterministic pages, scoped to the proposal, and deleted bodies are tombstoned', async () => {
    const state = createDatabase();
    const sharedCreatedAt = now();
    state.comments.push(
      {
        authorId: reader.id,
        body: 'First',
        createdAt: sharedCreatedAt,
        deletedAt: null,
        deletedById: null,
        id: 'comment-a',
        proposalId: 'proposal-1',
      },
      {
        authorId: author.id,
        body: 'Hidden body',
        createdAt: sharedCreatedAt,
        deletedAt: now(10),
        deletedById: author.id,
        id: 'comment-b',
        proposalId: 'proposal-1',
      },
      {
        authorId: reader.id,
        body: 'Other proposal',
        createdAt: now(20),
        deletedAt: null,
        deletedById: null,
        id: 'comment-c',
        proposalId: 'proposal-2',
      },
    );
    const app = await createApp(state.database);

    const firstPage = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/proposals/proposal-1/comments?pageSize=1',
    });
    const secondPage = await app.inject({
      method: 'GET',
      url: `/worlds/world-1/proposals/proposal-1/comments?pageSize=50&cursor=${firstPage.json().pageInfo.nextCursor}`,
    });
    const cappedPage = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/proposals/proposal-1/comments?pageSize=500',
    });

    assert.equal(firstPage.statusCode, 200);
    assert.deepEqual(
      firstPage.json().comments.map((comment: { id: string }) => comment.id),
      ['comment-a'],
    );
    assert.equal(firstPage.json().pageInfo.hasMore, true);
    assert.equal(firstPage.json().totalCount, 2);
    assert.equal(secondPage.statusCode, 200);
    assert.deepEqual(
      secondPage
        .json()
        .comments.map((comment: { body: string | null; id: string }) => [comment.id, comment.body]),
      [['comment-b', null]],
    );
    assert.equal(secondPage.json().comments[0].isDeleted, true);
    assert.equal(secondPage.json().comments[0].body, null);
    assert.equal(secondPage.json().pageInfo.hasMore, false);
    assert.equal(secondPage.json().pageInfo.nextCursor, null);
    assert.equal(secondPage.json().totalCount, 2);
    assert.equal(cappedPage.json().comments.length, 2);
    assert.equal(cappedPage.json().totalCount, 2);
    assert.equal(cappedPage.json().pageInfo.hasMore, false);
    await app.close();
  });

  test('comment write rate limit is per authenticated user across proposals and does not affect reads or votes', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);

    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        headers: authHeader(reader),
        method: 'POST',
        payload: { body: `Allowed comment ${index}` },
        url:
          index === 4
            ? '/worlds/world-1/proposals/proposal-same-world/comments'
            : '/worlds/world-1/proposals/proposal-1/comments',
      });

      assert.equal(response.statusCode, 201);
    }

    const limited = await app.inject({
      headers: authHeader(reader),
      method: 'POST',
      payload: { body: 'This body must not be stored or echoed.' },
      url: '/worlds/world-1/proposals/proposal-same-world/comments',
    });
    const otherUser = await app.inject({
      headers: authHeader(author),
      method: 'POST',
      payload: { body: 'Independent author allowance.' },
      url: '/worlds/world-1/proposals/proposal-1/comments',
    });
    const readAfterLimit = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/proposals/proposal-1/comments',
    });
    const voteAfterLimit = await app.inject({
      headers: authHeader(reader),
      method: 'POST',
      payload: { choice: 'REJECT' },
      url: '/worlds/world-1/proposals/proposal-1/votes',
    });

    assert.equal(limited.statusCode, 429, limited.body);
    assert.equal(limited.json().code, 'COMMENT_RATE_LIMITED');
    assert.equal(limited.json().error.includes('This body'), false);
    assert.ok(limited.headers['retry-after']);
    assert.equal(state.comments.length, 6);
    assert.equal(otherUser.statusCode, 201);
    assert.equal(readAfterLimit.statusCode, 200);
    assert.equal(voteAfterLimit.statusCode, 200, voteAfterLimit.body);
    assert.equal(state.appVotes.length, 1);
    await app.close();
  });

  test('malformed cursors and world mismatches are rejected safely while closed proposal comments remain readable and writable', async () => {
    const state = createDatabase();
    state.comments.push({
      authorId: reader.id,
      body: 'Still readable',
      createdAt: now(),
      deletedAt: null,
      deletedById: null,
      id: 'comment-closed',
      proposalId: 'proposal-closed',
    });
    const app = await createApp(state.database);

    const malformedCursor = await app.inject({
      method: 'GET',
      url: '/worlds/world-1/proposals/proposal-1/comments?cursor=not-a-cursor',
    });
    const mismatchedRead = await app.inject({
      method: 'GET',
      url: '/worlds/world-2/proposals/proposal-1/comments',
    });
    const closedRead = await app.inject({
      method: 'GET',
      url: `/worlds/world-1/proposals/proposal-closed/comments?cursor=${encodeCursor({
        createdAt: new Date('2020-01-01T00:00:00.000Z').toISOString(),
        id: 'comment-0',
      })}`,
    });
    const closedWrite = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: { body: 'Comment after the vote window.' },
      url: '/worlds/world-1/proposals/proposal-closed/comments',
    });

    assert.equal(malformedCursor.statusCode, 400);
    assert.deepEqual(malformedCursor.json(), {
      code: 'INVALID_COMMENT_CURSOR',
      error: 'Invalid comment cursor.',
    });
    assert.notEqual(malformedCursor.json().error, 'Bad Request');
    assert.equal('statusCode' in malformedCursor.json(), false);
    assert.equal('message' in malformedCursor.json(), false);
    assert.equal(mismatchedRead.statusCode, 404);
    assert.equal(closedRead.statusCode, 200);
    assert.equal(closedRead.json().comments[0].body, 'Still readable');
    assert.equal(closedWrite.statusCode, 201);
    assert.equal(state.touchedVotes.length, 0);
    await app.close();
  });
});

describe('proposal route async error mapping', () => {
  test('async canon voting errors use the application error response body', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);

    const closedVote = await app.inject({
      headers: authHeader(reader),
      method: 'POST',
      payload: { choice: 'REJECT' },
      url: '/worlds/world-1/proposals/proposal-closed/votes',
    });

    assert.equal(closedVote.statusCode, 409);
    assert.deepEqual(closedVote.json(), {
      code: 'PROPOSAL_NOT_VOTING',
      error: 'Proposal is not open for voting.',
    });
    assert.notEqual(closedVote.json().error, 'Conflict');
    assert.equal('statusCode' in closedVote.json(), false);
    assert.equal('message' in closedVote.json(), false);
    await app.close();
  });
});

describe('canon transaction confirmation route', () => {
  test('rejects unauthenticated confirmation before lookup or mutation', async () => {
    const state = createDatabase();
    attachConfirmedDecision(state);
    let lookups = 0;
    const app = await createApp(state.database, {
      hiveBroadcaster: {
        async confirmTransactionOperation() {
          lookups += 1;
          return createConfirmedOperation();
        },
      } as never,
    });

    const response = await app.inject({
      method: 'POST',
      payload: {
        operationIndex: 0,
        transactionId: 'tx-valid',
      },
      url: '/worlds/world-1/proposals/proposal-1/canon-transaction/confirm',
    });

    assert.equal(response.statusCode, 401);
    assert.equal(lookups, 0);
    assert.equal(state.decision.transactionId, null);
    assert.equal(state.events.length, 0);
    assert.equal(state.auditLogs.length, 0);
    await app.close();
  });

  test('rejects unrelated and insufficient-role users with typed authorization bodies', async () => {
    const state = createDatabase();
    attachConfirmedDecision(state);
    let lookups = 0;
    const app = await createApp(state.database, {
      hiveBroadcaster: {
        async confirmTransactionOperation() {
          lookups += 1;
          return createConfirmedOperation();
        },
      } as never,
    });

    const unrelated = await app.inject({
      headers: authHeader(reader),
      method: 'POST',
      payload: {
        operationIndex: 0,
        transactionId: 'tx-valid',
      },
      url: '/worlds/world-1/proposals/proposal-1/canon-transaction/confirm',
    });
    state.memberships.find((membership) => membership.userId === author.id)!.role =
      WorldRole.READER;
    const insufficientRole = await app.inject({
      headers: authHeader(author),
      method: 'POST',
      payload: {
        operationIndex: 0,
        transactionId: 'tx-valid',
      },
      url: '/worlds/world-1/proposals/proposal-1/canon-transaction/confirm',
    });

    assert.equal(unrelated.statusCode, 403);
    assert.deepEqual(unrelated.json(), {
      code: 'INSUFFICIENT_WORLD_PERMISSIONS',
      error: 'Insufficient world permissions.',
    });
    assert.equal(insufficientRole.statusCode, 403);
    assert.deepEqual(insufficientRole.json(), {
      code: 'INSUFFICIENT_WORLD_PERMISSIONS',
      error: 'Insufficient world permissions.',
    });
    assert.equal(lookups, 0);
    assert.equal(state.decision.transactionId, null);
    assert.equal(state.events.length, 0);
    assert.equal(state.auditLogs.length, 0);
    await app.close();
  });

  test('rejects spoofed actor identity from request data', async () => {
    const state = createDatabase();
    attachConfirmedDecision(state);
    let lookups = 0;
    const app = await createApp(state.database, {
      hiveBroadcaster: {
        async confirmTransactionOperation() {
          lookups += 1;
          return createConfirmedOperation();
        },
      } as never,
    });

    const response = await app.inject({
      headers: authHeader(reader),
      method: 'POST',
      payload: {
        actorId: author.id,
        operationIndex: 0,
        transactionId: 'tx-valid',
      },
      url: '/worlds/world-1/proposals/proposal-1/canon-transaction/confirm',
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'INVALID_CONFIRMATION_PAYLOAD');
    assert.equal(lookups, 0);
    assert.equal(state.decision.transactionId, null);
    assert.equal(state.events.length, 0);
    assert.equal(state.auditLogs.length, 0);
    await app.close();
  });

  test('authorized proposal author can confirm a matching canon transaction', async () => {
    const state = createDatabase();
    attachConfirmedDecision(state);
    const app = await createApp(state.database, {
      hiveBroadcaster: {
        async confirmTransactionOperation() {
          return createConfirmedOperation('tx-valid');
        },
      } as never,
    });

    const response = await app.inject({
      headers: authHeader(author),
      method: 'POST',
      payload: {
        operationIndex: 0,
        transactionId: 'tx-valid',
      },
      url: '/worlds/world-1/proposals/proposal-1/canon-transaction/confirm',
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().decision.transactionId, 'tx-valid');
    assert.equal(response.json().idempotent, false);
    assert.equal(state.decision.transactionId, 'tx-valid');
    assert.equal(state.events.length, 1);
    assert.equal(state.auditLogs.length, 1);
    assert.equal(
      (state.auditLogs[0] as { action: WorldAuditAction }).action,
      WorldAuditAction.CANON_DECISION_CONFIRMED,
    );
    await app.close();
  });
});
