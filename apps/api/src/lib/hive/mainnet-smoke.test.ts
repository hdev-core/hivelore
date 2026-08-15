import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ApiOperation, ApiTransaction } from '@hiveio/wax';

import { formatHiveMainnetSmokeResult, runHiveMainnetSmoke } from './mainnet-smoke.js';
import {
  HIVELORE_MAINNET_SMOKE_PAYLOAD,
  assertPostingAuthorityOnly,
  buildHiveLoreSmokeCustomJsonOperation,
  buildMainnetSmokeNetworkFromEnv,
  verifyHiveLoreSmokeOperation,
} from './smoke-operation.js';
import type { BuiltHiveTransaction, SignedHiveTransaction } from './types.js';
import type { HiveWaxClient } from './wax-client.js';

const network = buildMainnetSmokeNetworkFromEnv({
  HIVE_MAINNET_RPC_NODES: 'https://node-a.test,https://node-b.test',
  NODE_ENV: 'test',
});

const unsignedTransaction: ApiTransaction = {
  expiration: '2026-08-15T12:10:00',
  extensions: [],
  operations: [],
  ref_block_num: 1,
  ref_block_prefix: 2,
  signatures: [],
};

describe('Hive mainnet smoke test', () => {
  test('builds the hivelore_smoke operation with posting authority only', () => {
    const operation = buildHiveLoreSmokeCustomJsonOperation('Mira-Vale.Dev');
    const customJson = operation.custom_json_operation;

    assert.ok(customJson);
    assert.equal(customJson.id, 'hivelore_smoke');
    assert.deepEqual(customJson.required_auths, []);
    assert.deepEqual(customJson.required_posting_auths, ['mira-vale.dev']);
    assert.deepEqual(JSON.parse(customJson.json), HIVELORE_MAINNET_SMOKE_PAYLOAD);
    assert.deepEqual(verifyHiveLoreSmokeOperation({ expectedSigner: 'mira-vale.dev', operation }), {
      ok: true,
      payload: HIVELORE_MAINNET_SMOKE_PAYLOAD,
      signer: 'mira-vale.dev',
    });
  });

  test('fails closed if a smoke operation requests active authority', () => {
    const operation = buildHiveLoreSmokeCustomJsonOperation('mira-vale.dev');

    assert.ok(operation.custom_json_operation);
    operation.custom_json_operation.required_auths = ['mira-vale.dev'];
    operation.custom_json_operation.required_posting_auths = [];

    assert.throws(() => assertPostingAuthorityOnly(operation), /BUG/);
    assert.deepEqual(verifyHiveLoreSmokeOperation({ expectedSigner: 'mira-vale.dev', operation }), {
      ok: false,
      reason: 'Smoke custom_json must not require active authority.',
    });
  });

  test('rejects non-mainnet smoke configuration before broadcasting', () => {
    assert.throws(
      () =>
        buildMainnetSmokeNetworkFromEnv({
          HIVE_MAINNET_CHAIN_ID: '0'.repeat(64),
          HIVE_MAINNET_RPC_NODES: 'https://node-a.test',
          NODE_ENV: 'test',
        }),
      /mainnet chain ID/,
    );
  });

  test('broadcasts through the reliability path and confirms by transaction read-back', async () => {
    let builtOperation = buildHiveLoreSmokeCustomJsonOperation('mira-vale.dev');
    const signedTransaction: ApiTransaction = {
      ...unsignedTransaction,
      signatures: ['stub-signature'],
    };
    const transactionLookups: string[] = [];
    const blockSearches: string[] = [];
    const broadcasts: string[] = [];
    const customJsonOperation = builtOperation.custom_json_operation;

    assert.ok(customJsonOperation);

    const transactionOperations: ApiOperation[] = [
      {
        type: 'custom_json_operation',
        value: customJsonOperation as unknown as Record<string, unknown>,
      },
    ];
    const waxClient = {
      async buildTransaction(operations: Parameters<HiveWaxClient['buildTransaction']>[0]) {
        builtOperation = operations[0] ?? builtOperation;

        return {
          binaryHex: 'binary',
          requiredAuthorities: { posting: ['mira-vale.dev'] },
          transaction: {
            ...unsignedTransaction,
            operations: transactionOperations,
          },
          unsignedBinaryHex: 'unsigned-binary',
        } satisfies BuiltHiveTransaction;
      },
      async signTransaction(): Promise<SignedHiveTransaction> {
        return {
          binaryHex: 'signed-binary',
          transaction: signedTransaction,
          transactionId: 'tx-smoke-1',
        } satisfies SignedHiveTransaction;
      },
    } as unknown as HiveWaxClient;

    const result = await runHiveMainnetSmoke({
      account: 'mira-vale.dev',
      network,
      postingKey: 'stub-not-used-by-fake-client',
      transport: {
        async broadcast(nodeUrl) {
          broadcasts.push(nodeUrl);
        },
        async getHeadBlock() {
          return 101;
        },
        async getTransaction(params) {
          transactionLookups.push(params.nodeUrl ?? 'none');

          return [
            {
              block_num: 101,
              operation: builtOperation,
              operation_id: 0,
              timestamp: '2026-08-15T12:00:00.000Z',
              transaction_id: params.transactionId,
            },
          ];
        },
        async searchBlocks(params) {
          blockSearches.push(params.nodeUrl ?? 'none');

          return [];
        },
      },
      waxClient,
    });

    assert.deepEqual(broadcasts, ['https://node-a.test']);
    assert.deepEqual(transactionLookups, ['https://node-a.test']);
    assert.deepEqual(blockSearches, []);
    assert.deepEqual(result, {
      blockNumber: 101,
      blockTimestamp: '2026-08-15T12:00:00.000Z',
      rpcNodeUsed: 'https://node-a.test',
      transactionId: 'tx-smoke-1',
      verificationSummary: 'PASS',
    });
  });

  test('formats only the approved confirmation fields', () => {
    assert.equal(
      formatHiveMainnetSmokeResult({
        blockNumber: 101,
        blockTimestamp: '2026-08-15T12:00:00.000Z',
        rpcNodeUsed: 'https://node-a.test',
        transactionId: 'tx-smoke-1',
        verificationSummary: 'PASS',
      }),
      [
        'transaction ID: tx-smoke-1',
        'block number: 101',
        'block timestamp: 2026-08-15T12:00:00.000Z',
        'RPC node used: https://node-a.test',
        'verification summary: PASS',
      ].join('\n'),
    );
  });
});
