import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ProposalDecisionOutcome, ProposalStatus, VoteChoice } from '../generated/prisma/enums.js';
import { HIVELORE_CUSTOM_JSON_ID } from './hive/constants.js';
import { buildHiveLoreCustomJsonOperation } from './hive/operations.js';
import {
  acknowledgeProposalAiWarning,
  CanonVotingError,
  castCanonVote,
  confirmCanonTransaction,
  finalizeCanonDecision,
  getProposalDetail,
} from './canon-voting.js';
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

const votingStartedAt = new Date('2026-08-10T12:00:00.000Z');
const votingEndsAt = new Date('2026-08-12T12:00:00.000Z');
const afterVotingEnds = new Date('2026-08-12T12:01:00.000Z');

type ServiceVote = {
  choice: VoteChoice;
  createdAt: Date;
  id: string;
  proposalId: string;
  updatedAt: Date;
  voterId: string;
};

type ServiceProposal = Record<string, unknown> & {
  aiReports: Array<{ findings: unknown; summary: string | null }>;
  aiWarningAcknowledgedAt: Date | null;
  authorId: string;
  decision: unknown | null;
  id: string;
  votes: ServiceVote[];
  worldId: string;
};

function createServiceProposal(overrides: Partial<ServiceProposal> = {}): ServiceProposal {
  return {
    aiReports: [],
    aiWarningAcknowledgedAt: null,
    approvedAt: null,
    author: {
      hiveUsername: 'mira-vale.dev',
      id: 'author-1',
    },
    authorId: 'author-1',
    baseCanonVersionId: null,
    branchBaseLoreEntryId: null,
    branchLabel: null,
    branchParentProposalId: null,
    conflictMetadata: null,
    contentHash: 'content-hash',
    decidedAt: null,
    decision: null,
    id: 'proposal-1',
    proposedContent: { text: 'canon proposal' },
    proposalType: 'LORE_ENTRY',
    rejectedAt: null,
    staleBaseAtDecision: false,
    status: ProposalStatus.VOTING,
    submittedAt: votingStartedAt,
    summary: 'A proposal',
    title: 'Proposal',
    votes: [],
    votingEndsAt,
    votingStartedAt,
    world: {
      id: 'world-1',
      title: 'World',
    },
    worldId: 'world-1',
    ...overrides,
  };
}

function createVote(voterId: string, choice: VoteChoice = VoteChoice.APPROVE): ServiceVote {
  return {
    choice,
    createdAt: votingStartedAt,
    id: `vote-${voterId}`,
    proposalId: 'proposal-1',
    updatedAt: votingStartedAt,
    voterId,
  };
}

function createServiceDatabase(proposal = createServiceProposal()) {
  const auditLogs: unknown[] = [];
  const decisions: unknown[] = [];

  const database = {
    appVote: {
      async upsert(args: {
        create: { choice: VoteChoice; proposalId: string; voterId: string };
        update: { choice: VoteChoice };
        where: { proposalId_voterId: { voterId: string } };
      }) {
        const existing = proposal.votes.find(
          (vote) => vote.voterId === args.where.proposalId_voterId.voterId,
        );

        if (existing) {
          existing.choice = args.update.choice;
          existing.updatedAt = afterVotingEnds;
          return existing;
        }

        const vote = {
          ...createVote(args.create.voterId, args.create.choice),
          createdAt: afterVotingEnds,
          updatedAt: afterVotingEnds,
        };
        proposal.votes.push(vote);
        return vote;
      },
    },
    proposal: {
      async findFirst(args: { where: { id: string; worldId: string } }) {
        if (args.where.id !== proposal.id || args.where.worldId !== proposal.worldId) {
          return null;
        }

        return proposal;
      },
      async update(args: { data: Record<string, unknown> }) {
        Object.assign(proposal, args.data);
        return proposal;
      },
    },
    proposalDecision: {
      async create(args: { data: Record<string, unknown> }) {
        const decision = {
          blockchainTimestamp: null,
          blockNumber: null,
          createdAt: afterVotingEnds,
          customJsonId: null,
          expectedSigner: null,
          hiveEventId: null,
          id: `decision-${decisions.length + 1}`,
          operationIndex: null,
          transactionId: null,
          updatedAt: afterVotingEnds,
          ...args.data,
        };
        decisions.push(decision);
        proposal.decision = decision;
        return decision;
      },
      async findUnique() {
        return decisions[0] ?? null;
      },
    },
    worldAuditLog: {
      async create(args: { data: unknown }) {
        auditLogs.push(args.data);
        return args.data;
      },
    },
    worldBibleVersion: {
      async findFirst() {
        return null;
      },
    },
    $transaction<T>(callback: (transaction: unknown) => Promise<T>) {
      return callback(database);
    },
  };

  return {
    auditLogs,
    database,
    decisions,
    proposal,
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

  test('skips unrelated malformed HAF rows and confirms the matching operation', async () => {
    const state = createDatabase();
    const hafClient = {
      async searchBlocks() {
        return {
          operations: [
            {
              block_num: 100,
              operation_id: 0,
              transaction_id: 'tx-unrelated',
            },
            createOperation({ transactionId: 'tx-valid' }),
          ],
        };
      },
    };

    const confirmed = await confirmCanonTransaction(state.database as never, {
      blockNumber: 100,
      hafClient: hafClient as never,
      operationIndex: 0,
      proposalId: 'proposal-1',
      transactionId: 'tx-valid',
      worldId: 'world-1',
    });

    assert.equal(confirmed.decision?.transactionId, 'tx-valid');
  });

  test('returns not found when a mixed Hive block does not contain the target operation', async () => {
    const state = createDatabase();

    await assert.rejects(
      confirmCanonTransaction(state.database as never, {
        blockNumber: 100,
        hafClient: createHafClient({
          block_num: 100,
          operation_id: 0,
          transaction_id: 'tx-other',
        }) as never,
        operationIndex: 0,
        proposalId: 'proposal-1',
        transactionId: 'tx-missing',
        worldId: 'world-1',
      }),
      (error: unknown) =>
        error instanceof CanonVotingError && error.code === 'HIVE_OPERATION_NOT_FOUND',
    );
  });
});

describe('canon voting service invariants', () => {
  test('rejects proposal author self-votes even when the author has voting permission upstream', async () => {
    const state = createServiceDatabase();

    await assert.rejects(
      castCanonVote(state.database as never, {
        choice: VoteChoice.APPROVE,
        now: votingStartedAt,
        proposalId: 'proposal-1',
        voterId: 'author-1',
        worldId: 'world-1',
      }),
      (error: unknown) =>
        error instanceof CanonVotingError && error.code === 'PROPOSAL_AUTHOR_CANNOT_VOTE',
    );
  });

  test('allows non-author votes through the service path', async () => {
    const state = createServiceDatabase();

    const result = await castCanonVote(state.database as never, {
      choice: VoteChoice.REJECT,
      now: votingStartedAt,
      proposalId: 'proposal-1',
      voterId: 'reader-1',
      worldId: 'world-1',
    });

    assert.equal(result.vote.choice, VoteChoice.REJECT);
    assert.equal(state.proposal.votes.length, 1);
  });

  test('excludes legacy author votes when finalizing the frozen result', async () => {
    const state = createServiceDatabase(
      createServiceProposal({
        votes: [
          createVote('author-1', VoteChoice.APPROVE),
          createVote('reader-1', VoteChoice.APPROVE),
          createVote('reader-2', VoteChoice.APPROVE),
          createVote('reader-3', VoteChoice.APPROVE),
          createVote('reader-4', VoteChoice.APPROVE),
        ],
      }),
    );

    const result = await finalizeCanonDecision(state.database as never, {
      actorId: 'founder-1',
      now: afterVotingEnds,
      proposalId: 'proposal-1',
      worldId: 'world-1',
    });

    assert.equal(result.decision?.outcome, ProposalDecisionOutcome.REJECTED);
    assert.equal(result.decision?.totalVotes, 4);
  });

  test('does not classify a negated contradiction summary as an AI warning', async () => {
    const state = createServiceDatabase(
      createServiceProposal({
        aiReports: [
          {
            findings: { notes: 'Contradiction keyword appears in explanation only.' },
            summary: 'No contradiction found.',
          },
        ],
      }),
    );

    const detail = await getProposalDetail(state.database as never, {
      proposalId: 'proposal-1',
      worldId: 'world-1',
    });

    assert.equal(detail.aiWarning.acknowledgmentRequired, false);
    assert.equal(detail.aiWarning.acknowledged, false);
  });

  test('requires explicit acknowledgment before finalizing a major AI warning', async () => {
    const state = createServiceDatabase(
      createServiceProposal({
        aiReports: [
          {
            findings: [{ category: 'continuity', severity: 'major', summary: 'Major conflict.' }],
            summary: 'Major continuity conflict.',
          },
        ],
        votes: [
          createVote('reader-1'),
          createVote('reader-2'),
          createVote('reader-3'),
          createVote('reader-4'),
          createVote('reader-5'),
        ],
      }),
    );

    await assert.rejects(
      finalizeCanonDecision(state.database as never, {
        actorId: 'founder-1',
        now: afterVotingEnds,
        proposalId: 'proposal-1',
        worldId: 'world-1',
      }),
      (error: unknown) =>
        error instanceof CanonVotingError && error.code === 'AI_WARNING_ACKNOWLEDGMENT_REQUIRED',
    );
  });

  test('records acknowledgment timestamp and freezes it into the decision payload', async () => {
    const state = createServiceDatabase(
      createServiceProposal({
        aiReports: [
          {
            findings: [{ category: 'continuity', severity: 'major', summary: 'Major conflict.' }],
            summary: 'Major continuity conflict.',
          },
        ],
        votes: [
          createVote('reader-1'),
          createVote('reader-2'),
          createVote('reader-3'),
          createVote('reader-4'),
          createVote('reader-5'),
        ],
      }),
    );

    const acknowledged = await acknowledgeProposalAiWarning(state.database as never, {
      actorId: 'founder-1',
      now: afterVotingEnds,
      proposalId: 'proposal-1',
      worldId: 'world-1',
    });
    const finalized = await finalizeCanonDecision(state.database as never, {
      actorId: 'founder-1',
      now: new Date(afterVotingEnds.getTime() + 1),
      proposalId: 'proposal-1',
      worldId: 'world-1',
    });

    assert.equal(acknowledged.aiWarning.acknowledged, true);
    assert.equal(state.auditLogs.length, 1);
    assert.equal(finalized.decision?.aiWarningAcknowledged, true);
    assert.equal(
      (finalized.decision?.decisionPayload as { aiWarning?: { acknowledgedAt?: string } }).aiWarning
        ?.acknowledgedAt,
      afterVotingEnds.toISOString(),
    );
  });
});
