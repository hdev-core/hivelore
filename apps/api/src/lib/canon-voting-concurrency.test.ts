import assert from 'node:assert/strict';
import { test } from 'node:test';

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
import {
  createPrismaClient,
  testDatabaseAdminUrl,
  withDisposablePrismaDatabase,
} from '../test/integration-db.js';

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
  { skip: !testDatabaseAdminUrl ? 'TEST_DATABASE_ADMIN_URL is not configured.' : false },
  async () => {
    await withDisposablePrismaDatabase('hivelore_confirm_race', async (seedClient, directUrl) => {
      await seedConfirmedProposal(seedClient);
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
    });
  },
);
