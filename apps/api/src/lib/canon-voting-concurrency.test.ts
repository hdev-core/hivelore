import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { PrismaClient } from '../generated/prisma/client.js';
import {
  PlatformRole,
  ProposalDecisionOutcome,
  ProposalStatus,
  ProposalType,
  WorldAuditAction,
  WorldRole,
} from '../generated/prisma/enums.js';
import { confirmCanonTransaction, CanonVotingError } from './canon-voting.js';
import { hashCanonicalJson } from './canon-voting-policy.js';
import { HIVELORE_CUSTOM_JSON_ID } from './hive/constants.js';
import { buildHiveLoreCustomJsonOperation } from './hive/operations.js';

const { Client } = pg;

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;

function disposableDatabaseName() {
  return `hivelore_confirm_race_${Date.now()}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

function databaseUrlFor(adminConnectionUrl: string, databaseName: string) {
  const databaseUrl = new URL(adminConnectionUrl);
  databaseUrl.pathname = `/${databaseName}`;

  return databaseUrl.toString();
}

async function withPgClient<T>(
  connectionString: string,
  callback: (client: pg.Client) => Promise<T>,
) {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function runPrismaMigrateDeploy(databaseUrl: string) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(executable, ['prisma', 'migrate', 'deploy'], {
    cwd: new URL('../..', import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      NODE_ENV: 'test',
    },
    shell: false,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed with exit code ${result.status}`);
  }
}

function createPrismaClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

function createBarrier(parties: number) {
  let arrived = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async () => {
    arrived += 1;

    if (arrived === parties) {
      release();
    }

    await ready;
  };
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
  proposalId: 'proposal-race',
  worldId: 'world-race',
};

function confirmedOperation(transactionId: string) {
  return {
    blockNumber: BigInt(120),
    blockchainTimestamp: new Date('2026-08-12T12:05:00.000Z'),
    operation: buildHiveLoreCustomJsonOperation({
      action: 'canon_approval',
      entityId: 'decision-race',
      entityType: 'CANON_DECISION',
      payload: decisionPayload,
      proposalId: 'proposal-race',
      signer: 'mira-vale.dev',
      worldId: 'world-race',
    }),
    operationIndex: 0,
    transactionId,
  };
}

async function seedConfirmedProposal(database: PrismaClient) {
  await database.user.create({
    data: {
      hiveUsername: 'mira-vale.dev',
      id: 'author-race',
      normalizedHiveUsername: 'mira-vale.dev',
      platformRole: PlatformRole.USER,
    },
  });
  await database.world.create({
    data: {
      description: 'Race test world',
      founderId: 'author-race',
      id: 'world-race',
      slug: 'race-test-world',
      title: 'Race Test World',
    },
  });
  await database.worldMembership.create({
    data: {
      id: 'membership-race',
      role: WorldRole.CONTRIBUTOR,
      userId: 'author-race',
      worldId: 'world-race',
    },
  });
  await database.proposal.create({
    data: {
      authorId: 'author-race',
      contentHash: 'content-hash',
      decidedAt: new Date('2026-08-12T12:00:00.000Z'),
      id: 'proposal-race',
      proposalType: ProposalType.ADD_LORE,
      proposedContent: { text: 'canon proposal' },
      status: ProposalStatus.APPROVED_FOR_PUBLICATION,
      summary: 'Race proposal',
      title: 'Race proposal',
      votingEndsAt: new Date('2026-08-12T12:00:00.000Z'),
      votingStartedAt: new Date('2026-08-10T12:00:00.000Z'),
      worldId: 'world-race',
    },
  });
  await database.proposalDecision.create({
    data: {
      aiWarningAcknowledged: false,
      alternateTimelineCount: 0,
      approvalDenominator: 10,
      approvalNumerator: 7,
      approvalPercentageBps: 7000,
      approvalThresholdBps: 7000,
      approveCount: 7,
      contentHash: 'content-hash',
      customJsonId: HIVELORE_CUSTOM_JSON_ID,
      decidedAt: new Date('2026-08-12T12:00:00.000Z'),
      decisionPayload,
      decisionPayloadHash: hashCanonicalJson(decisionPayload),
      expectedSigner: 'mira-vale.dev',
      id: 'decision-race',
      minimumVotes: 5,
      needsRevisionCount: 0,
      outcome: ProposalDecisionOutcome.APPROVED_FOR_PUBLICATION,
      payloadSchemaVersion: 2,
      proposalId: 'proposal-race',
      rejectCount: 3,
      rulesVersion: 'canon-voting-mvp-2026-08-12',
      totalVotes: 10,
      votingWindowHours: 48,
    },
  });
}

test(
  'canon decision confirmation is atomic across concurrent PostgreSQL clients',
  { skip: !adminUrl ? 'TEST_DATABASE_ADMIN_URL is not configured.' : false },
  async () => {
    assert.ok(adminUrl);
    const databaseName = disposableDatabaseName();

    if (!databaseName.startsWith('hivelore_confirm_race_')) {
      throw new Error(`Refusing to use non-disposable database name: ${databaseName}`);
    }

    const directUrl = databaseUrlFor(adminUrl, databaseName);

    await withPgClient(adminUrl, (client) => client.query(`CREATE DATABASE "${databaseName}"`));

    try {
      runPrismaMigrateDeploy(directUrl);

      const seedClient = createPrismaClient(directUrl);
      await seedConfirmedProposal(seedClient);
      await seedClient.$disconnect();

      const firstClient = createPrismaClient(directUrl);
      const secondClient = createPrismaClient(directUrl);
      const synchronizeLookup = createBarrier(2);

      const first = confirmCanonTransaction(firstClient, {
        actorId: 'author-race',
        hafClient: {} as never,
        hiveBroadcaster: {
          async confirmTransactionOperation() {
            await synchronizeLookup();
            return confirmedOperation('tx-race-a');
          },
        } as never,
        operationIndex: 0,
        proposalId: 'proposal-race',
        transactionId: 'tx-race-a',
        worldId: 'world-race',
      });
      const second = confirmCanonTransaction(secondClient, {
        actorId: 'author-race',
        hafClient: {} as never,
        hiveBroadcaster: {
          async confirmTransactionOperation() {
            await synchronizeLookup();
            return confirmedOperation('tx-race-b');
          },
        } as never,
        operationIndex: 0,
        proposalId: 'proposal-race',
        transactionId: 'tx-race-b',
        worldId: 'world-race',
      });

      const results = await Promise.allSettled([first, second]);
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');

      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assert.ok(
        rejected[0]?.status === 'rejected' &&
          rejected[0].reason instanceof CanonVotingError &&
          rejected[0].reason.code === 'DECISION_ALREADY_CONFIRMED',
      );

      const verificationClient = createPrismaClient(directUrl);
      const [decision, eventCount, auditCount] = await Promise.all([
        verificationClient.proposalDecision.findUnique({
          where: {
            id: 'decision-race',
          },
        }),
        verificationClient.hiveEvent.count(),
        verificationClient.worldAuditLog.count({
          where: {
            action: WorldAuditAction.CANON_DECISION_CONFIRMED,
          },
        }),
      ]);

      assert.ok(decision?.transactionId === 'tx-race-a' || decision?.transactionId === 'tx-race-b');
      assert.equal(decision?.operationIndex, 0);
      assert.ok(decision?.hiveEventId);
      assert.equal(eventCount, 1);
      assert.equal(auditCount, 1);

      await Promise.all([
        firstClient.$disconnect(),
        secondClient.$disconnect(),
        verificationClient.$disconnect(),
      ]);
    } finally {
      await withPgClient(adminUrl, async (client) => {
        await client.query(
          `
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1
              AND pid <> pg_backend_pid()
          `,
          [databaseName],
        );
        await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      });
    }
  },
);
