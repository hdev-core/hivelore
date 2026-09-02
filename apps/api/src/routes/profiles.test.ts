import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Fastify from 'fastify';

import type { UserProfileDatabase } from '../lib/user-profiles.js';
import { registerProfileRoutes } from './profiles.js';

const user = {
  avatarUrl: null,
  bio: 'Builder of small myths.',
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  displayName: 'Mira Vale',
  hiveUsername: 'mira-vale.dev',
  id: 'user-1',
  normalizedHiveUsername: 'mira-vale.dev',
};

function createDatabase(): UserProfileDatabase {
  return {
    user: {
      async findUnique(args) {
        const query = args as {
          where?: { normalizedHiveUsername?: string };
          select?: {
            contributionDrafts?: { where?: { status?: string } };
            loreEntries?: { where?: { status?: string } };
          };
        };

        // Honour the nested relation filters the way Prisma would, so that a
        // missing `where` in the query surfaces as leaked rows in the response.
        const applyStatusFilter = <T extends { status: string }>(
          rows: T[],
          filter: { status?: string } | undefined,
        ) => (filter?.status ? rows.filter((row) => row.status === filter.status) : rows);

        if (query.where?.normalizedHiveUsername !== user.normalizedHiveUsername) {
          return null;
        }

        return {
          ...user,
          contributionDrafts: applyStatusFilter(
            [
              {
                id: 'draft-1',
                kind: 'LORE',
                proposal: {
                  id: 'proposal-1',
                  status: 'VOTING',
                  submittedAt: new Date('2026-08-03T12:00:00.000Z'),
                },
                status: 'SUBMITTED',
                submittedAt: new Date('2026-08-03T12:00:00.000Z'),
                title: 'The amber gate opens',
                updatedAt: new Date('2026-08-03T12:00:00.000Z'),
                world: { id: 'world-1', slug: 'ember-city', title: 'Ember City' },
              },
              {
                id: 'draft-secret',
                kind: 'LORE',
                proposal: null,
                status: 'DRAFT',
                submittedAt: null,
                title: 'UNSUBMITTED private draft',
                updatedAt: new Date('2026-08-07T12:00:00.000Z'),
                world: { id: 'world-1', slug: 'ember-city', title: 'Ember City' },
              },
            ],
            query.select?.contributionDrafts?.where,
          ),
          loreEntries: applyStatusFilter(
            [
              {
                id: 'entry-1',
                loreType: 'LOCATION',
                slug: 'amber-gate',
                status: 'PUBLISHED_CANON',
                title: 'Amber Gate',
                updatedAt: new Date('2026-08-04T12:00:00.000Z'),
                world: { id: 'world-1', slug: 'ember-city', title: 'Ember City' },
              },
              {
                id: 'entry-secret',
                loreType: 'LOCATION',
                slug: 'unpublished-vault',
                status: 'DRAFT',
                title: 'UNPUBLISHED private lore',
                updatedAt: new Date('2026-08-08T12:00:00.000Z'),
                world: { id: 'world-1', slug: 'ember-city', title: 'Ember City' },
              },
            ],
            query.select?.loreEntries?.where,
          ),
          reputationSnapshots: [
            {
              breakdown: { signals: { canonizedContributions: 1 } },
              calculatedAt: new Date('2026-08-05T12:00:00.000Z'),
              calculationVersion: 'hivelore-reputation-v1',
              score: 125,
            },
          ],
          votes: [
            {
              choice: 'APPROVE',
              createdAt: new Date('2026-08-06T12:00:00.000Z'),
              proposal: {
                id: 'proposal-2',
                status: 'APPROVED_FOR_PUBLICATION',
                title: 'A foundry oath',
                world: { id: 'world-1', slug: 'ember-city', title: 'Ember City' },
              },
            },
          ],
        };
      },
    },
  };
}

async function buildTestApp(database = createDatabase()) {
  const app = Fastify();
  await registerProfileRoutes(app, { database });

  return app;
}

describe('profile routes', () => {
  test('returns reputation, badge, and contribution history for a Hive user', async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/profiles/Mira-Vale.dev',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      history: {
        contributions: [
          {
            id: 'draft-1',
            kind: 'LORE',
            proposal: {
              id: 'proposal-1',
              status: 'VOTING',
              submittedAt: '2026-08-03T12:00:00.000Z',
            },
            status: 'SUBMITTED',
            submittedAt: '2026-08-03T12:00:00.000Z',
            title: 'The amber gate opens',
            updatedAt: '2026-08-03T12:00:00.000Z',
            world: { id: 'world-1', slug: 'ember-city', title: 'Ember City' },
          },
        ],
        loreEntries: [
          {
            id: 'entry-1',
            loreType: 'LOCATION',
            slug: 'amber-gate',
            status: 'PUBLISHED_CANON',
            title: 'Amber Gate',
            updatedAt: '2026-08-04T12:00:00.000Z',
            world: { id: 'world-1', slug: 'ember-city', title: 'Ember City' },
          },
        ],
        votes: [
          {
            choice: 'APPROVE',
            createdAt: '2026-08-06T12:00:00.000Z',
            proposal: {
              id: 'proposal-2',
              status: 'APPROVED_FOR_PUBLICATION',
              title: 'A foundry oath',
              world: { id: 'world-1', slug: 'ember-city', title: 'Ember City' },
            },
          },
        ],
      },
      reputation: {
        breakdown: { signals: { canonizedContributions: 1 } },
        calculatedAt: '2026-08-05T12:00:00.000Z',
        calculationVersion: 'hivelore-reputation-v1',
        level: {
          badge: 'Canon Keeper',
          label: 'Canon Keeper',
          nextScore: 250,
        },
        score: 125,
      },
      user: {
        avatarUrl: null,
        bio: 'Builder of small myths.',
        createdAt: '2026-08-01T10:00:00.000Z',
        displayName: 'Mira Vale',
        hiveUsername: 'mira-vale.dev',
        id: 'user-1',
        normalizedHiveUsername: 'mira-vale.dev',
      },
    });
  });

  test('never exposes unsubmitted drafts or non-canon lore on the public profile', async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/profiles/mira-vale.dev',
    });

    assert.equal(response.statusCode, 200);

    const body = response.json();
    const serialised = JSON.stringify(body);

    // The endpoint is unauthenticated, so private work must never appear.
    assert.ok(
      !serialised.includes('UNSUBMITTED private draft'),
      'unsubmitted contribution draft leaked on a public profile',
    );
    assert.ok(
      !serialised.includes('UNPUBLISHED private lore'),
      'non-canon lore entry leaked on a public profile',
    );
    assert.ok(!serialised.includes('draft-secret'), 'unsubmitted draft id leaked');
    assert.ok(!serialised.includes('entry-secret'), 'non-canon lore id leaked');

    // and the legitimately public rows are still present
    assert.ok(serialised.includes('The amber gate opens'));
    assert.ok(serialised.includes('Amber Gate'));
  });

  test('returns 404 for an unknown profile', async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/profiles/unknown.dev',
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: 'Profile not found.' });
  });

  test('rejects invalid Hive usernames', async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/profiles/not_valid',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: 'Invalid Hive username.' });
  });
});
