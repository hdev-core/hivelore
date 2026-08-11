import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Fastify from 'fastify';

import { env } from '../config/env.js';
import {
  ContributionKind,
  ContributionStatus,
  PlatformRole,
  ProposalStatus,
  ProposalType,
  WorldAuditAction,
  WorldRole,
} from '../generated/prisma/enums.js';
import { signAccessToken } from '../lib/auth-crypto.js';
import {
  createContribution,
  deleteContribution,
  submitContribution,
  updateContribution,
} from '../lib/contributions.js';
import { registerContributionRoutes } from './contributions.js';

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

const structuredDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'The northern gate fell during the third winter.' }],
    },
  ],
};

const emptyDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: '   ' }],
    },
  ],
};

type StoredContribution = {
  id: string;
  worldId: string;
  authorId: string;
  targetLoreEntryId: string | null;
  kind: ContributionKind;
  title: string;
  summary: string | null;
  content: unknown;
  status: ContributionStatus;
  proposalId: string | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
};

type StoredProposal = {
  id: string;
  worldId: string;
  authorId: string;
  proposalType: ProposalType;
  contributionKind: ContributionKind;
  status: ProposalStatus;
  title: string;
  summary: string;
  proposedContent: unknown;
  targetLoreEntryId: string | null;
  resultingLoreEntryId: string | null;
  resultingBibleVersionId: string | null;
  submittedAt: Date | null;
  votingStartedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function now() {
  return new Date('2026-08-05T12:00:00.000Z');
}

function createContributionRecord(input: Partial<StoredContribution> = {}): StoredContribution {
  return {
    authorId: author.id,
    content: structuredDoc,
    createdAt: now(),
    id: `contribution-${Math.random().toString(36).slice(2)}`,
    kind: ContributionKind.LORE,
    proposalId: null,
    status: ContributionStatus.DRAFT,
    submittedAt: null,
    summary: 'A short summary.',
    targetLoreEntryId: 'lore-1',
    title: 'The Fall of the Northern Gate',
    updatedAt: now(),
    worldId: 'world-1',
    ...input,
  };
}

function createDatabase() {
  const worlds = [{ id: 'world-1' }, { id: 'world-2' }];
  const loreEntries = [
    {
      id: 'lore-1',
      loreType: 'LOCATION',
      slug: 'north-gate',
      title: 'North Gate',
      worldId: 'world-1',
    },
    {
      id: 'lore-2',
      loreType: 'EVENT',
      slug: 'other-world-event',
      title: 'Other Event',
      worldId: 'world-2',
    },
  ];
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
  ];
  const contributions: StoredContribution[] = [];
  const proposals: StoredProposal[] = [];
  const auditLogs: unknown[] = [];
  let failNextProposalCreate = false;
  let failNextAuditCreate = false;
  let submitBeforeNextDeleteMany = false;
  let submitBeforeNextUpdateMany = false;
  let transactionQueue = Promise.resolve();
  const externallySubmittedContributionIds = new Set<string>();

  function includeContribution(contribution: StoredContribution) {
    return {
      ...contribution,
      proposal: contribution.proposalId
        ? (proposals.find((proposal) => proposal.id === contribution.proposalId) ?? null)
        : null,
      targetLoreEntry: contribution.targetLoreEntryId
        ? (loreEntries.find((entry) => entry.id === contribution.targetLoreEntryId) ?? null)
        : null,
    };
  }

  const database: Record<string, unknown> = {};

  Object.assign(database, {
    async $transaction<T>(callback: (transaction: unknown) => Promise<T>) {
      const previousTransaction = transactionQueue;
      let releaseTransaction!: () => void;
      transactionQueue = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });

      await previousTransaction;

      const contributionSnapshot = contributions.map((contribution) => ({ ...contribution }));
      const proposalSnapshot = proposals.map((proposal) => ({ ...proposal }));
      const auditSnapshot = [...auditLogs];

      try {
        return await callback(database);
      } catch (error) {
        contributions.splice(0, contributions.length, ...contributionSnapshot);
        proposals.splice(0, proposals.length, ...proposalSnapshot);
        auditLogs.splice(0, auditLogs.length, ...auditSnapshot);

        for (const contributionId of externallySubmittedContributionIds) {
          const contribution = contributions.find((candidate) => candidate.id === contributionId);

          if (contribution) {
            contribution.status = ContributionStatus.SUBMITTED;
            contribution.submittedAt = now();
          }
        }

        externallySubmittedContributionIds.clear();
        throw error;
      } finally {
        releaseTransaction();
      }
    },
    contributionDraft: {
      async create(args: { data: Partial<StoredContribution>; include: unknown }) {
        const contribution = createContributionRecord({
          id: `contribution-${contributions.length + 1}`,
          proposalId: null,
          status: ContributionStatus.DRAFT,
          submittedAt: null,
          ...args.data,
        });
        contributions.push(contribution);
        return includeContribution(contribution);
      },
      async delete(args: { where: { id: string } }) {
        const index = contributions.findIndex((contribution) => contribution.id === args.where.id);
        const [deleted] = contributions.splice(index, 1);
        return deleted;
      },
      async deleteMany(args: { where: Partial<StoredContribution> }) {
        if (submitBeforeNextDeleteMany) {
          const contribution = contributions.find(
            (candidate) =>
              candidate.id === args.where.id && candidate.authorId === args.where.authorId,
          );

          if (contribution) {
            contribution.status = ContributionStatus.SUBMITTED;
            contribution.submittedAt = now();
            externallySubmittedContributionIds.add(contribution.id);
          }

          submitBeforeNextDeleteMany = false;
        }

        const before = contributions.length;

        for (let index = contributions.length - 1; index >= 0; index -= 1) {
          const contribution = contributions[index]!;

          if (
            Object.entries(args.where).every(
              ([key, value]) => contribution[key as keyof StoredContribution] === value,
            )
          ) {
            contributions.splice(index, 1);
          }
        }

        return { count: before - contributions.length };
      },
      async findFirst(args: { where: Partial<StoredContribution>; include?: unknown }) {
        const contribution =
          contributions.find((candidate) =>
            Object.entries(args.where).every(([key, value]) => {
              if (value && typeof value === 'object' && 'lt' in value) {
                return String(candidate[key as keyof StoredContribution]) < String(value.lt);
              }

              return candidate[key as keyof StoredContribution] === value;
            }),
          ) ?? null;

        return contribution ? includeContribution(contribution) : null;
      },
      async findMany(args: {
        where: Partial<StoredContribution> & { id?: { lt: string } };
        skip?: number;
        take: number;
      }) {
        return contributions
          .filter((candidate) =>
            Object.entries(args.where).every(([key, value]) => {
              if (key === 'id' && value && typeof value === 'object' && 'lt' in value) {
                return candidate.id < String(value.lt);
              }

              return candidate[key as keyof StoredContribution] === value;
            }),
          )
          .sort((left, right) => {
            const updatedAtOrder = right.updatedAt.getTime() - left.updatedAt.getTime();

            if (updatedAtOrder !== 0) {
              return updatedAtOrder;
            }

            return right.id.localeCompare(left.id);
          })
          .slice(args.skip ?? 0, (args.skip ?? 0) + args.take)
          .map(includeContribution);
      },
      async count(args: { where: Partial<StoredContribution> }) {
        return contributions.filter((candidate) =>
          Object.entries(args.where).every(
            ([key, value]) => candidate[key as keyof StoredContribution] === value,
          ),
        ).length;
      },
      async update(args: {
        data: Partial<StoredContribution>;
        where: { id: string };
        include?: unknown;
      }) {
        const contribution = contributions.find((candidate) => candidate.id === args.where.id);

        if (!contribution) {
          throw new Error('Contribution missing.');
        }

        if ('targetLoreEntry' in args.data) {
          const relation = args.data.targetLoreEntry as
            { connect: { id: string } } | { disconnect: true };
          contribution.targetLoreEntryId = 'disconnect' in relation ? null : relation.connect.id;
          delete args.data.targetLoreEntry;
        }

        Object.assign(contribution, args.data, {
          updatedAt: now(),
        });

        return includeContribution(contribution);
      },
      async updateMany(args: {
        data: Partial<StoredContribution>;
        where: Partial<StoredContribution>;
      }) {
        if (submitBeforeNextUpdateMany) {
          const contribution = contributions.find(
            (candidate) =>
              candidate.id === args.where.id && candidate.authorId === args.where.authorId,
          );

          if (contribution) {
            contribution.status = ContributionStatus.SUBMITTED;
            contribution.submittedAt = now();
            externallySubmittedContributionIds.add(contribution.id);
          }

          submitBeforeNextUpdateMany = false;
        }

        let count = 0;

        for (const contribution of contributions) {
          if (
            Object.entries(args.where).every(
              ([key, value]) => contribution[key as keyof StoredContribution] === value,
            )
          ) {
            Object.assign(contribution, args.data, {
              updatedAt: now(),
            });
            count += 1;
          }
        }

        return { count };
      },
    },
    loreEntry: {
      async findUnique(args: { where: { id: string } }) {
        return loreEntries.find((entry) => entry.id === args.where.id) ?? null;
      },
    },
    proposal: {
      async create(args: { data: Omit<StoredProposal, 'id' | 'createdAt' | 'updatedAt'> }) {
        if (failNextProposalCreate) {
          failNextProposalCreate = false;
          throw new Error('Injected proposal create failure.');
        }

        const proposal: StoredProposal = {
          ...args.data,
          approvedAt: args.data.approvedAt ?? null,
          createdAt: now(),
          id: `proposal-${proposals.length + 1}`,
          publishedAt: args.data.publishedAt ?? null,
          rejectedAt: args.data.rejectedAt ?? null,
          resultingBibleVersionId: args.data.resultingBibleVersionId ?? null,
          resultingLoreEntryId: args.data.resultingLoreEntryId ?? null,
          updatedAt: now(),
          votingStartedAt: args.data.votingStartedAt ?? null,
        };
        proposals.push(proposal);
        return proposal;
      },
    },
    refreshSession: {
      async findUnique(args: { where: { id: string } }) {
        const userId = args.where.id.replace(/^session-/, '');

        return {
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
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
        if (failNextAuditCreate) {
          failNextAuditCreate = false;
          throw new Error('Injected audit failure.');
        }

        auditLogs.push(args.data);
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
  });

  return {
    auditLogs,
    contributions,
    database,
    failNextProposalCreate() {
      failNextProposalCreate = true;
    },
    failNextAuditCreate() {
      failNextAuditCreate = true;
    },
    loreEntries,
    memberships,
    proposals,
    submitBeforeNextDeleteMany() {
      submitBeforeNextDeleteMany = true;
    },
    submitBeforeNextUpdateMany() {
      submitBeforeNextUpdateMany = true;
    },
  };
}

async function createApp(database: ReturnType<typeof createDatabase>['database']) {
  const app = Fastify();
  await registerContributionRoutes(app, {
    database: database as never,
  });
  return app;
}

describe('contribution routes', () => {
  test('authenticated contributor can create lore and story drafts with session-derived author', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);

    const loreResponse = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        content: structuredDoc,
        kind: ContributionKind.LORE,
        targetLoreEntryId: 'lore-1',
        title: '  The Fall of the Northern Gate  ',
      },
      url: '/worlds/world-1/contributions',
    });
    const storyResponse = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        content: structuredDoc,
        kind: ContributionKind.STORY,
        title: 'A Winter Road',
      },
      url: '/worlds/world-1/contributions',
    });
    const protectedFieldResponse = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        authorId: otherUser.id,
        content: structuredDoc,
        kind: ContributionKind.STORY,
        proposalId: 'proposal-injected',
        title: 'A Winter Road',
      },
      url: '/worlds/world-1/contributions',
    });

    assert.equal(loreResponse.statusCode, 201);
    assert.equal(loreResponse.json().contribution.authorId, author.id);
    assert.equal(loreResponse.json().contribution.title, 'The Fall of the Northern Gate');
    assert.equal(storyResponse.statusCode, 201);
    assert.equal(storyResponse.json().contribution.kind, ContributionKind.STORY);
    assert.equal(protectedFieldResponse.statusCode, 400);
    assert.equal(state.contributions.length, 2);
    await app.close();
  });

  test('rejects unauthenticated users, users without world permission, invalid docs, oversized docs, missing content, missing worlds, and mismatched targets', async () => {
    const state = createDatabase();
    const app = await createApp(state.database);
    const oversizedDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x'.repeat(101 * 1024) }],
        },
      ],
    };

    const unauthenticated = await app.inject({
      method: 'POST',
      payload: { content: structuredDoc, kind: ContributionKind.LORE, title: 'Gate' },
      url: '/worlds/world-1/contributions',
    });
    const forbidden = await app.inject({
      headers: authHeader(otherUser),
      method: 'POST',
      payload: { content: structuredDoc, kind: ContributionKind.LORE, title: 'Gate' },
      url: '/worlds/world-1/contributions',
    });
    const invalidDoc = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        content: { type: 'html', content: '<p>Nope</p>' },
        kind: ContributionKind.LORE,
        title: 'Gate',
      },
      url: '/worlds/world-1/contributions',
    });
    const oversized = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        content: oversizedDoc,
        kind: ContributionKind.LORE,
        title: 'Gate',
      },
      url: '/worlds/world-1/contributions',
    });
    const missingContent = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        kind: ContributionKind.LORE,
        title: 'Gate',
      },
      url: '/worlds/world-1/contributions',
    });
    const missingWorld = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        content: structuredDoc,
        kind: ContributionKind.LORE,
        title: 'Gate',
      },
      url: '/worlds/world-missing/contributions',
    });
    const mismatchedTarget = await app.inject({
      headers: authHeader(),
      method: 'POST',
      payload: {
        content: structuredDoc,
        kind: ContributionKind.LORE,
        targetLoreEntryId: 'lore-2',
        title: 'Gate',
      },
      url: '/worlds/world-1/contributions',
    });

    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(forbidden.statusCode, 403);
    assert.equal(invalidDoc.statusCode, 400);
    assert.equal(oversized.statusCode, 400);
    assert.equal(missingContent.statusCode, 400);
    assert.equal(missingWorld.statusCode, 404);
    assert.equal(mismatchedTarget.statusCode, 400);
    await app.close();
  });

  test('author can list and read their draft while unauthorized routes do not reveal private data', async () => {
    const state = createDatabase();
    state.memberships.find((membership) => membership.userId === otherUser.id)!.role =
      WorldRole.CONTRIBUTOR;
    state.memberships.push({
      id: 'membership-author-world-2',
      revokedAt: null,
      role: WorldRole.CONTRIBUTOR,
      userId: author.id,
      worldId: 'world-2',
    });
    state.contributions.push(createContributionRecord({ id: 'draft-1' }));
    state.contributions.push(createContributionRecord({ authorId: otherUser.id, id: 'draft-2' }));
    const app = await createApp(state.database);

    const listResponse = await app.inject({
      headers: authHeader(),
      method: 'GET',
      url: '/worlds/world-1/contributions?status=DRAFT&kind=LORE&page=1&pageSize=1',
    });
    const readResponse = await app.inject({
      headers: authHeader(),
      method: 'GET',
      url: '/worlds/world-1/contributions/draft-1',
    });
    const otherReadResponse = await app.inject({
      headers: authHeader(otherUser),
      method: 'GET',
      url: '/worlds/world-1/contributions/draft-1',
    });
    const wrongWorldResponse = await app.inject({
      headers: authHeader(),
      method: 'GET',
      url: '/worlds/world-2/contributions/draft-1',
    });

    assert.equal(listResponse.statusCode, 200);
    assert.deepEqual(listResponse.json().pagination, {
      page: 1,
      pageSize: 1,
      total: 1,
    });
    assert.deepEqual(
      listResponse.json().contributions.map((contribution: { id: string }) => contribution.id),
      ['draft-1'],
    );
    assert.equal(readResponse.statusCode, 200);
    assert.equal(otherReadResponse.statusCode, 404);
    assert.equal(wrongWorldResponse.statusCode, 404);
    await app.close();
  });

  test('author can update and delete draft, but protected fields and submitted rows are rejected', async () => {
    const state = createDatabase();
    state.contributions.push(createContributionRecord({ id: 'draft-1' }));
    state.contributions.push(
      createContributionRecord({
        id: 'submitted-1',
        proposalId: 'proposal-1',
        status: ContributionStatus.SUBMITTED,
        submittedAt: now(),
      }),
    );
    const app = await createApp(state.database);

    const updateResponse = await app.inject({
      headers: authHeader(),
      method: 'PATCH',
      payload: {
        content: structuredDoc,
        summary: 'Updated.',
        targetLoreEntryId: null,
        title: 'Updated Gate',
      },
      url: '/worlds/world-1/contributions/draft-1',
    });
    const protectedFieldResponse = await app.inject({
      headers: authHeader(),
      method: 'PATCH',
      payload: {
        authorId: otherUser.id,
        title: 'No',
      },
      url: '/worlds/world-1/contributions/draft-1',
    });
    const submittedUpdateResponse = await app.inject({
      headers: authHeader(),
      method: 'PATCH',
      payload: { title: 'No' },
      url: '/worlds/world-1/contributions/submitted-1',
    });
    const invalidContentResponse = await app.inject({
      headers: authHeader(),
      method: 'PATCH',
      payload: { content: { type: 'doc', content: {} } },
      url: '/worlds/world-1/contributions/draft-1',
    });
    const deleteResponse = await app.inject({
      headers: authHeader(),
      method: 'DELETE',
      url: '/worlds/world-1/contributions/draft-1',
    });
    const submittedDeleteResponse = await app.inject({
      headers: authHeader(),
      method: 'DELETE',
      url: '/worlds/world-1/contributions/submitted-1',
    });

    assert.equal(updateResponse.statusCode, 200);
    assert.equal(updateResponse.json().contribution.title, 'Updated Gate');
    assert.equal(updateResponse.json().contribution.targetLoreEntryId, null);
    assert.equal(protectedFieldResponse.statusCode, 400);
    assert.equal(submittedUpdateResponse.statusCode, 409);
    assert.equal(invalidContentResponse.statusCode, 400);
    assert.equal(deleteResponse.statusCode, 204);
    assert.equal(submittedDeleteResponse.statusCode, 409);
    await app.close();
  });

  test('update and delete reject drafts that are submitted by a concurrent operation', async () => {
    const updateState = createDatabase();
    updateState.contributions.push(createContributionRecord({ id: 'draft-update-race' }));
    updateState.submitBeforeNextUpdateMany();

    await assert.rejects(
      updateContribution(updateState.database as never, {
        authorId: author.id,
        contributionId: 'draft-update-race',
        title: 'Should Not Land',
        worldId: 'world-1',
      }),
      (error: unknown) =>
        error instanceof Error && error.message === 'Submitted contributions cannot be edited.',
    );

    assert.equal(updateState.contributions[0]?.title, 'The Fall of the Northern Gate');
    assert.equal(updateState.contributions[0]?.status, ContributionStatus.SUBMITTED);

    const deleteState = createDatabase();
    deleteState.contributions.push(createContributionRecord({ id: 'draft-delete-race' }));
    deleteState.submitBeforeNextDeleteMany();

    await assert.rejects(
      deleteContribution(deleteState.database as never, {
        authorId: author.id,
        contributionId: 'draft-delete-race',
        worldId: 'world-1',
      }),
      (error: unknown) =>
        error instanceof Error && error.message === 'Submitted contributions cannot be deleted.',
    );

    assert.equal(deleteState.contributions.length, 1);
    assert.equal(deleteState.contributions[0]?.status, ContributionStatus.SUBMITTED);
  });

  test('another user cannot update or delete an author private draft', async () => {
    const state = createDatabase();
    state.memberships.find((membership) => membership.userId === otherUser.id)!.role =
      WorldRole.CONTRIBUTOR;
    state.contributions.push(createContributionRecord({ id: 'draft-1' }));
    const app = await createApp(state.database);

    const updateResponse = await app.inject({
      headers: authHeader(otherUser),
      method: 'PATCH',
      payload: { title: 'No' },
      url: '/worlds/world-1/contributions/draft-1',
    });
    const deleteResponse = await app.inject({
      headers: authHeader(otherUser),
      method: 'DELETE',
      url: '/worlds/world-1/contributions/draft-1',
    });

    assert.equal(updateResponse.statusCode, 404);
    assert.equal(deleteResponse.statusCode, 404);
    await app.close();
  });

  test('valid draft submission creates exactly one proposal and locks immutable proposed content', async () => {
    const state = createDatabase();
    state.contributions.push(createContributionRecord({ id: 'draft-1' }));
    const app = await createApp(state.database);

    const submitResponse = await app.inject({
      headers: authHeader(),
      method: 'POST',
      url: '/worlds/world-1/contributions/draft-1/submit',
    });
    const duplicateResponse = await app.inject({
      headers: authHeader(),
      method: 'POST',
      url: '/worlds/world-1/contributions/draft-1/submit',
    });

    assert.equal(submitResponse.statusCode, 201);
    assert.equal(duplicateResponse.statusCode, 200);
    assert.equal(state.proposals.length, 1);
    assert.equal(state.contributions[0]?.status, ContributionStatus.SUBMITTED);
    assert.equal(state.contributions[0]?.proposalId, 'proposal-1');
    assert.equal(submitResponse.json().proposal.authorId, author.id);
    assert.equal(submitResponse.json().proposal.status, ProposalStatus.SUBMITTED);
    assert.equal(submitResponse.json().proposal.proposalType, ProposalType.UPDATE_LORE);
    assert.deepEqual(submitResponse.json().proposal.proposedContent, structuredDoc);
    assert.equal(
      state.auditLogs.some(
        (entry) =>
          (entry as { action?: WorldAuditAction }).action ===
          WorldAuditAction.CONTRIBUTION_SUBMITTED,
      ),
      true,
    );
    await app.close();
  });

  test('create rollback leaves no contribution when audit logging fails', async () => {
    const state = createDatabase();
    state.failNextAuditCreate();

    await assert.rejects(
      createContribution(state.database as never, {
        authorId: author.id,
        content: structuredDoc,
        kind: ContributionKind.LORE,
        title: 'Rollback Draft',
        worldId: 'world-1',
      }),
    );

    assert.equal(state.contributions.length, 0);
    assert.equal(state.auditLogs.length, 0);
  });

  test('story draft submission creates an ADD_STORY proposal', async () => {
    const state = createDatabase();
    state.contributions.push(
      createContributionRecord({
        id: 'story-1',
        kind: ContributionKind.STORY,
        targetLoreEntryId: null,
      }),
    );
    const app = await createApp(state.database);

    const response = await app.inject({
      headers: authHeader(),
      method: 'POST',
      url: '/worlds/world-1/contributions/story-1/submit',
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().proposal.proposalType, ProposalType.ADD_STORY);
    assert.equal(response.json().proposal.contributionKind, ContributionKind.STORY);
    await app.close();
  });

  test('submission rejects empty content, missing submit permission, and mismatched target lore', async () => {
    const state = createDatabase();
    state.contributions.push(createContributionRecord({ content: emptyDoc, id: 'empty-1' }));
    state.contributions.push(
      createContributionRecord({ id: 'mismatch-1', targetLoreEntryId: 'lore-2' }),
    );
    const app = await createApp(state.database);

    const emptyResponse = await app.inject({
      headers: authHeader(),
      method: 'POST',
      url: '/worlds/world-1/contributions/empty-1/submit',
    });
    const forbiddenResponse = await app.inject({
      headers: authHeader(otherUser),
      method: 'POST',
      url: '/worlds/world-1/contributions/empty-1/submit',
    });
    const mismatchResponse = await app.inject({
      headers: authHeader(),
      method: 'POST',
      url: '/worlds/world-1/contributions/mismatch-1/submit',
    });

    assert.equal(emptyResponse.statusCode, 400);
    assert.equal(forbiddenResponse.statusCode, 403);
    assert.equal(mismatchResponse.statusCode, 400);
    assert.equal(state.proposals.length, 0);
    await app.close();
  });

  test('concurrent submissions and rollback do not create duplicate or partial proposal state', async () => {
    const concurrentState = createDatabase();
    concurrentState.contributions.push(createContributionRecord({ id: 'draft-1' }));
    const [first, second] = await Promise.allSettled([
      submitContribution(concurrentState.database as never, {
        authorId: author.id,
        contributionId: 'draft-1',
        worldId: 'world-1',
      }),
      submitContribution(concurrentState.database as never, {
        authorId: author.id,
        contributionId: 'draft-1',
        worldId: 'world-1',
      }),
    ]);

    assert.equal(concurrentState.proposals.length, 1);
    assert.equal(
      [first, second].filter((result) => result.status === 'fulfilled').length >= 1,
      true,
    );

    const rollbackState = createDatabase();
    rollbackState.contributions.push(createContributionRecord({ id: 'draft-rollback' }));
    rollbackState.failNextProposalCreate();

    await assert.rejects(
      submitContribution(rollbackState.database as never, {
        authorId: author.id,
        contributionId: 'draft-rollback',
        worldId: 'world-1',
      }),
    );

    assert.equal(rollbackState.proposals.length, 0);
    assert.equal(rollbackState.contributions[0]?.status, ContributionStatus.DRAFT);
    assert.equal(rollbackState.contributions[0]?.proposalId, null);
  });
});
