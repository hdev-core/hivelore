import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ApiTransaction } from '@hiveio/wax';

import { buildHiveLoreCustomJsonOperation } from './operations.js';
import {
  classifyHiveBroadcastError,
  delayForAttempt,
  findAndVerifyOperation,
  HiveBroadcastError,
  HiveNodePool,
  HiveReliableBroadcaster,
} from './broadcast-reliability.js';
import {
  buildHiveNetworkConfig,
  DEFAULT_HIVE_RETRY_CONFIG,
  parseNodeList,
} from './network-config.js';
import type { HafOperationRow } from './types.js';

const network = buildHiveNetworkConfig({
  customJsonId: 'hivelore',
  mainnetRpcNodes: 'https://node-a.test,https://node-b.test',
  network: 'mainnet',
  nodeEnv: 'test',
});

const transaction: ApiTransaction = {
  expiration: '2026-08-10T12:05:00',
  extensions: [],
  operations: [],
  ref_block_num: 1,
  ref_block_prefix: 2,
  signatures: ['public-signature'],
};

const operation = buildHiveLoreCustomJsonOperation({
  action: 'canon_approval',
  entityId: 'decision-1',
  entityType: 'CANON_DECISION',
  payload: {
    contentHash: 'hash-1',
  },
  proposalId: 'proposal-1',
  signer: 'mira-vale.dev',
  worldId: 'world-1',
});

function row(transactionId = 'tx-1'): HafOperationRow {
  return {
    block_num: 101,
    operation,
    operation_id: 0,
    timestamp: '2026-08-10T12:01:00.000Z',
    transaction_id: transactionId,
  };
}

function fakeClock(random = 0.5) {
  let now = 0;

  return {
    advance(ms: number) {
      now += ms;
    },
    now: () => now,
    random: () => random,
    async sleep(ms: number) {
      now += ms;
    },
  };
}

describe('Hive broadcast reliability', () => {
  test('retries a transient broadcast failure on the next node and confirms through HAF', async () => {
    const calls: string[] = [];
    const clock = fakeClock();
    const broadcaster = new HiveReliableBroadcaster(
      network,
      {
        async broadcast(nodeUrl) {
          calls.push(nodeUrl);

          if (calls.length === 1) {
            throw Object.assign(new Error('HTTP 503'), { status: 503 });
          }
        },
        async getHeadBlock() {
          return 101;
        },
        async searchBlocks() {
          return calls.length < 2 ? [] : [row()];
        },
      },
      {
        confirmationPollIntervalMs: 1,
        confirmationTimeoutMs: 10,
        initialDelayMs: 10,
        maxDelayMs: 10,
      },
      clock,
    );

    const result = await broadcaster.broadcastSignedTransaction({
      expectedOperation: operation,
      expectedSigner: 'mira-vale.dev',
      transaction,
      transactionId: 'tx-1',
    });

    assert.deepEqual(calls, ['https://node-a.test', 'https://node-b.test']);
    assert.equal(result.transactionId, 'tx-1');
    assert.equal(result.blockNumber, 101);
    assert.equal(result.attempts, 2);
  });

  test('fails fast for permanent transaction errors without rotating every node', async () => {
    const calls: string[] = [];
    const broadcaster = new HiveReliableBroadcaster(
      network,
      {
        async broadcast(nodeUrl) {
          calls.push(nodeUrl);
          throw new Error('missing required signature');
        },
        async getHeadBlock() {
          return 0;
        },
        async searchBlocks() {
          return [];
        },
      },
      {},
      fakeClock(),
    );

    await assert.rejects(
      broadcaster.broadcastSignedTransaction({
        transaction,
        transactionId: 'tx-1',
      }),
      (error: unknown) =>
        error instanceof HiveBroadcastError && error.code === 'PERMANENT_TRANSACTION_ERROR',
    );
    assert.deepEqual(calls, ['https://node-a.test']);
  });

  test('ambiguous timeout enters confirmation before retrying the same signed transaction', async () => {
    let broadcasts = 0;
    const broadcaster = new HiveReliableBroadcaster(
      network,
      {
        async broadcast() {
          broadcasts += 1;
          throw new Error('request timeout');
        },
        async getHeadBlock() {
          return 101;
        },
        async searchBlocks() {
          return [row()];
        },
      },
      {
        confirmationPollIntervalMs: 1,
        confirmationTimeoutMs: 10,
      },
      fakeClock(),
    );

    const result = await broadcaster.broadcastSignedTransaction({
      expectedOperation: operation,
      expectedSigner: 'mira-vale.dev',
      transaction,
      transactionId: 'tx-1',
    });

    assert.equal(broadcasts, 1);
    assert.equal(result.transactionId, 'tx-1');
  });

  test('confirmation read-back rotates nodes after transient provider failures', async () => {
    const readNodes: string[] = [];
    const broadcaster = new HiveReliableBroadcaster(
      network,
      {
        async broadcast() {},
        async getHeadBlock(nodeUrl) {
          readNodes.push(nodeUrl ?? 'none');

          if (readNodes.length === 1) {
            throw Object.assign(new Error('HTTP 503'), { status: 503 });
          }

          return 101;
        },
        async searchBlocks() {
          return [row()];
        },
      },
      {
        confirmationPollIntervalMs: 1,
        confirmationTimeoutMs: 10,
        maxConsecutiveNodeFailures: 1,
      },
      fakeClock(),
    );

    const result = await broadcaster.confirmTransaction({
      expectedOperation: operation,
      expectedSigner: 'mira-vale.dev',
      transactionId: 'tx-1',
    });

    assert.deepEqual(readNodes, ['https://node-a.test', 'https://node-b.test']);
    assert.equal(result.transactionId, 'tx-1');
  });

  test('confirmation can read back through a different healthy node than broadcast', async () => {
    const broadcastNodes: string[] = [];
    const readNodes: string[] = [];
    const broadcaster = new HiveReliableBroadcaster(
      network,
      {
        async broadcast(nodeUrl) {
          broadcastNodes.push(nodeUrl);
        },
        async getHeadBlock(nodeUrl) {
          readNodes.push(nodeUrl ?? 'none');

          if (readNodes.length === 1) {
            throw Object.assign(new Error('HTTP 503'), { status: 503 });
          }

          return 101;
        },
        async searchBlocks() {
          return [row()];
        },
      },
      {
        confirmationPollIntervalMs: 1,
        confirmationTimeoutMs: 10,
      },
      fakeClock(),
    );

    await broadcaster.broadcastSignedTransaction({
      expectedOperation: operation,
      expectedSigner: 'mira-vale.dev',
      transaction,
      transactionId: 'tx-1',
    });

    assert.deepEqual(broadcastNodes, ['https://node-a.test']);
    assert.deepEqual(readNodes, ['https://node-a.test', 'https://node-b.test']);
  });

  test('rejects a confirmed transaction id with mismatched operation content', () => {
    const mismatched = buildHiveLoreCustomJsonOperation({
      action: 'canon_approval',
      entityId: 'decision-2',
      entityType: 'CANON_DECISION',
      payload: {
        contentHash: 'other',
      },
      proposalId: 'proposal-1',
      signer: 'mira-vale.dev',
      worldId: 'world-1',
    });

    assert.throws(
      () =>
        findAndVerifyOperation([row()], {
          expectedOperation: mismatched,
          expectedSigner: 'mira-vale.dev',
          transactionId: 'tx-1',
        }),
      (error: unknown) =>
        error instanceof HiveBroadcastError && error.code === 'BROADCAST_REJECTED',
    );
  });

  test('matches expected operations with canonical JSON ordering', () => {
    const customJson = operation.custom_json_operation;
    assert.ok(customJson);

    const hivedOrderedOperation = {
      custom_json_operation: {
        required_auths: customJson.required_auths,
        required_posting_auths: customJson.required_posting_auths,
        id: customJson.id,
        json: customJson.json,
      },
    };

    const confirmed = findAndVerifyOperation(
      [
        {
          block_num: 101,
          operation: hivedOrderedOperation,
          operation_id: 0,
          timestamp: '2026-08-10T12:01:00.000Z',
          transaction_id: 'tx-1',
        },
      ],
      {
        expectedOperation: operation,
        expectedSigner: 'mira-vale.dev',
        transactionId: 'tx-1',
      },
    );

    assert.equal(confirmed?.transactionId, 'tx-1');
  });

  test('ignores unrelated malformed HAF rows before normalizing candidates', () => {
    const confirmed = findAndVerifyOperation(
      [
        {
          block_num: 101,
          operation: { transfer_operation: { from: 'alice', to: 'bob' } },
          operation_id: 0,
          timestamp: '2026-08-10T12:01:00.000Z',
          transaction_id: 'unrelated-tx',
        },
        row(),
      ],
      {
        expectedOperation: operation,
        expectedSigner: 'mira-vale.dev',
        transactionId: 'tx-1',
      },
    );

    assert.equal(confirmed?.transactionId, 'tx-1');
  });

  test('walks HAF block-search pages until the target transaction is found', async () => {
    const searchedPages: number[] = [];
    const broadcaster = new HiveReliableBroadcaster(
      network,
      {
        async broadcast() {},
        async getHeadBlock() {
          return 101;
        },
        async searchBlocks(params) {
          searchedPages.push(params.page ?? 0);

          if (params.page === 1) {
            return {
              operations: Array.from({ length: params.pageSize ?? 100 }, (_, index) => ({
                block_num: 101,
                operation: { transfer_operation: { from: 'alice', to: 'bob' } },
                operation_id: index,
                timestamp: '2026-08-10T12:01:00.000Z',
                transaction_id: `unrelated-${index}`,
              })),
              totalPages: 2,
            };
          }

          return { operations: [row()], totalPages: 2 };
        },
      },
      {
        confirmationPollIntervalMs: 1,
        confirmationTimeoutMs: 10,
      },
      fakeClock(),
    );

    const result = await broadcaster.confirmTransaction({
      expectedOperation: operation,
      expectedSigner: 'mira-vale.dev',
      transactionId: 'tx-1',
    });

    assert.deepEqual(searchedPages, [1, 2]);
    assert.equal(result.transactionId, 'tx-1');
  });

  test('calculates capped exponential backoff with bounded jitter', () => {
    assert.equal(delayForAttempt(1, DEFAULT_HIVE_RETRY_CONFIG, 0.5), 500);
    assert.equal(delayForAttempt(3, DEFAULT_HIVE_RETRY_CONFIG, 0.5), 2_000);
    assert.equal(delayForAttempt(6, DEFAULT_HIVE_RETRY_CONFIG, 0.5), 5_000);
    assert.equal(delayForAttempt(1, DEFAULT_HIVE_RETRY_CONFIG, 0), 400);
    assert.equal(delayForAttempt(1, DEFAULT_HIVE_RETRY_CONFIG, 1), 600);
  });

  test('classifies transient, permanent, and expired provider failures', () => {
    assert.equal(classifyHiveBroadcastError(new Error('HTTP timeout')).failureClass, 'transient');
    assert.equal(
      classifyHiveBroadcastError(new Error('insufficient authority')).failureClass,
      'permanent',
    );
    assert.equal(
      classifyHiveBroadcastError(new Error('transaction expired')).code,
      'TRANSACTION_EXPIRED',
    );
  });

  test('rotates unhealthy nodes and recovers after cooldown', () => {
    let now = 0;
    const pool = new HiveNodePool(
      ['https://a.test', 'https://b.test'],
      {
        ...DEFAULT_HIVE_RETRY_CONFIG,
        maxConsecutiveNodeFailures: 1,
        nodeCooldownMs: 100,
      },
      () => now,
    );

    assert.equal(pool.current(), 'https://a.test');
    pool.reportTransientFailure('https://a.test');
    assert.equal(pool.current(), 'https://b.test');
    now = 101;
    assert.equal(pool.current(), 'https://b.test');
    pool.reportTransientFailure('https://b.test');
    assert.equal(pool.current(), 'https://a.test');
  });

  test('validates node lists without mixing credentials or duplicates', () => {
    assert.deepEqual(parseNodeList('https://a.test, https://a.test/', 'test'), ['https://a.test']);
    assert.throws(() => parseNodeList('https://user:pass@a.test', 'test'), /credentials/);
    assert.throws(() => parseNodeList('', 'test'), /At least one/);
  });
});
