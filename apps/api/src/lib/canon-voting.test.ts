import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ProposalDecisionOutcome } from '../generated/prisma/enums.js';
import { HIVELORE_CUSTOM_JSON_ID } from './hive/constants.js';
import { buildHiveLoreCustomJsonOperation } from './hive/operations.js';
import { CanonVotingError, confirmCanonTransaction } from './canon-voting.js';
import { hashCanonicalJson } from './canon-voting-policy.js';

const decisionPayload = {
  eventType: 'canon_decision',
  proposalId: 'proposal-1',
  worldId: 'world-1',
  outcome: ProposalDecisionOutcome.APPROVED_FOR_PUBLICATION,
  counts: {
    alternateTimeline: 0,
    approve: 7,
    needsRevision: 0,
    reject: 3,
    total: 10,
  },
};

function createDecision(overrides: Record<string, unknown> = {}) {
  return {
    aiWarningAcknowledged: false,
    aiWarningSummary: null,
    alternateTimelineCount: 0,
    approvalDenominator: 10,
    approvalNumerator: 7,
    approvalPercentageBps: 7000,
    approvalThresholdBps: 7000,
    approveCount: 7,
    baseCanonVersionId: null,
    blockchainTimestamp: null,
    blockNumber: null,
    branchBaseLoreEntryId: null,
    branchLabel: null,
    branchParentProposalId: null,
    conflictMetadata: null,
    contentHash: 'content-hash',
    createdAt: new Date('2026-08-10T12:00:00.000Z'),
    customJsonId: HIVELORE_CUSTOM_JSON_ID,
    decidedAt: new Date('2026-08-12T12:00:00.000Z'),
    decisionPayload,
    decisionPayloadHash: hashCanonicalJson(decisionPayload),
    expectedSigner: 'mira-vale.dev',
    hiveEventId: null,
    id: 'decision-1',
    minimumVotes: 5,
    needsRevisionCount: 0,
    operationIndex: null,
    outcome: ProposalDecisionOutcome.APPROVED_FOR_PUBLICATION,
    payloadSchemaVersion: 1,
    proposalId: 'proposal-1',
    rejectCount: 3,
    rulesVersion: 'canon-voting-mvp-2026-08-10',
    staleBaseAtDecision: false,
    totalVotes: 10,
    transactionId: null,
    updatedAt: new Date('2026-08-12T12:00:00.000Z'),
    votingWindowHours: 48,
    ...overrides,
  };
}

function createOperation(input: {
  authority?: 'active' | 'posting';
  proposalId?: string;
  signer?: string;
  transactionId?: string;
}) {
  return {
    block_num: 100,
    operation_id: 0,
    operation: buildHiveLoreCustomJsonOperation({
      action: 'canon_approval',
      authority: input.authority ?? 'posting',
      entityId: 'decision-1',
      entityType: 'CANON_DECISION',
      payload: decisionPayload,
      proposalId: input.proposalId ?? 'proposal-1',
      signer: input.signer ?? 'mira-vale.dev',
      worldId: 'world-1',
    }),
    timestamp: '2026-08-12T12:05:00.000Z',
    transaction_id: input.transactionId ?? 'tx-valid',
  };
}

function createDatabase(decision = createDecision()) {
  const events: unknown[] = [];
  const proposal = {
    author: {
      hiveUsername: 'mira-vale.dev',
    },
    decision,
    id: 'proposal-1',
    worldId: 'world-1',
  };

  const database = {
    hiveEvent: {
      async upsert(args: {
        create: { id?: string; operationIndex: number; transactionId: string };
      }) {
        const event = {
          id: `event-${events.length + 1}`,
          ...args.create,
        };
        events.push(event);
        return event;
      },
    },
    proposal: {
      async findFirst(args: { where: { id: string; worldId: string } }) {
        if (args.where.id !== proposal.id || args.where.worldId !== proposal.worldId) {
          return null;
        }

        return proposal;
      },
    },
    proposalDecision: {
      async update(args: { data: Record<string, unknown> }) {
        Object.assign(decision, args.data);
        return decision;
      },
    },
    $transaction<T>(callback: (transaction: unknown) => Promise<T>) {
      return callback(database);
    },
  };

  return {
    database,
    decision,
    events,
  };
}

function createHafClient(row: unknown) {
  return {
    async searchBlocks() {
      return {
        operations: [row],
      };
    },
  };
}

describe('canon voting Hive confirmation', () => {
  test('confirms a matching posting-authority custom_json and is idempotent for the same operation', async () => {
    const state = createDatabase();
    const hafClient = createHafClient(createOperation({ transactionId: 'tx-valid' }));

    const confirmed = await confirmCanonTransaction(state.database as never, {
      blockNumber: 100,
      hafClient: hafClient as never,
      operationIndex: 0,
      proposalId: 'proposal-1',
      transactionId: 'tx-valid',
      worldId: 'world-1',
    });
    const repeated = await confirmCanonTransaction(state.database as never, {
      blockNumber: 100,
      hafClient: hafClient as never,
      operationIndex: 0,
      proposalId: 'proposal-1',
      transactionId: 'tx-valid',
      worldId: 'world-1',
    });

    assert.equal(confirmed.idempotent, false);
    assert.ok(confirmed.decision);
    assert.equal(confirmed.decision.transactionId, 'tx-valid');
    assert.equal(repeated.idempotent, true);
    assert.equal(state.events.length, 1);
  });

  test('rejects a different operation once the decision already has a Hive confirmation', async () => {
    const state = createDatabase(
      createDecision({
        operationIndex: 0,
        transactionId: 'tx-original',
      }),
    );

    await assert.rejects(
      confirmCanonTransaction(state.database as never, {
        blockNumber: 101,
        hafClient: createHafClient(createOperation({ transactionId: 'tx-other' })) as never,
        operationIndex: 0,
        proposalId: 'proposal-1',
        transactionId: 'tx-other',
        worldId: 'world-1',
      }),
      (error: unknown) =>
        error instanceof CanonVotingError && error.code === 'DECISION_ALREADY_CONFIRMED',
    );

    assert.equal(state.decision.transactionId, 'tx-original');
    assert.equal(state.events.length, 0);
  });

  test('rejects active-authority custom_json for canon decision confirmation', async () => {
    const state = createDatabase();

    await assert.rejects(
      confirmCanonTransaction(state.database as never, {
        blockNumber: 100,
        hafClient: createHafClient(
          createOperation({ authority: 'active', transactionId: 'tx-active' }),
        ) as never,
        operationIndex: 0,
        proposalId: 'proposal-1',
        transactionId: 'tx-active',
        worldId: 'world-1',
      }),
      (error: unknown) =>
        error instanceof CanonVotingError && error.code === 'HIVE_OPERATION_INVALID_AUTHORITY',
    );

    assert.equal(state.events.length, 0);
  });
});
