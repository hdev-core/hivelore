import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ApiTransaction } from '@hiveio/wax';

import { HIVE_MAINNET_CHAIN_ID } from './constants.js';
import { buildHiveLoreCustomJsonOperation } from './operations.js';
import { HiveWaxClient } from './wax-client.js';

const apiTransaction: ApiTransaction = {
  ref_block_num: 1,
  ref_block_prefix: 2,
  expiration: '2026-07-25T18:00:00',
  operations: [],
  extensions: [],
  signatures: [],
};

function createTransactionFixture(transaction: ApiTransaction, id = 'tx-id') {
  const pushedOperations: unknown[] = [];

  return {
    pushedOperations,
    transaction: {
      pushOperation(operation: unknown) {
        pushedOperations.push(operation);
        return this;
      },
      validate() {},
      toApiJson() {
        return transaction;
      },
      toBinaryForm(stripToUnsignedTransaction?: boolean) {
        return stripToUnsignedTransaction ? 'unsigned-binary' : 'binary';
      },
      requiredAuthorities: {
        posting: ['alice'],
      },
      id,
    },
  };
}

describe('Hive WAX client', () => {
  test('passes Hive mainnet chain id into WAX chain and foundation initialization', async () => {
    const chainOptions: unknown[] = [];
    const foundationOptions: unknown[] = [];
    const fixture = createTransactionFixture(apiTransaction);
    const client = new HiveWaxClient({
      async createChain(options) {
        chainOptions.push(options);

        return {
          async createTransaction() {
            return fixture.transaction;
          },
          async broadcast() {},
        };
      },
      async createFoundation(options) {
        foundationOptions.push(options);

        return {
          createTransactionFromJson() {
            return fixture.transaction;
          },
          convertTransactionToBinaryForm() {
            return 'binary';
          },
        };
      },
    });

    const built = await client.buildTransaction([
      buildHiveLoreCustomJsonOperation({
        signer: 'alice',
        action: 'canon_approval',
        entityType: 'CANON_DECISION',
        entityId: 'proposal-1',
        payload: {},
      }),
    ]);
    await client.signTransaction(built, {
      provider: 'hive-keychain',
      async signTransaction(transaction) {
        return {
          ...transaction,
          signatures: ['signature'],
        };
      },
    });

    assert.equal((chainOptions[0] as { chainId: string }).chainId, HIVE_MAINNET_CHAIN_ID);
    assert.equal((foundationOptions[0] as { chainId: string }).chainId, HIVE_MAINNET_CHAIN_ID);
  });

  test('builds, signs, serializes, and broadcasts through WAX abstractions', async () => {
    const fixture = createTransactionFixture(apiTransaction, 'signed-id');
    const broadcasted: ApiTransaction[] = [];
    const client = new HiveWaxClient({
      async createChain() {
        return {
          async createTransaction() {
            return fixture.transaction;
          },
          async broadcast(transaction) {
            broadcasted.push(transaction);
          },
        };
      },
      async createFoundation() {
        return {
          createTransactionFromJson(transaction) {
            return createTransactionFixture(transaction, 'signed-id').transaction;
          },
          convertTransactionToBinaryForm(_transaction, stripSignatures) {
            return stripSignatures ? 'serialized-unsigned' : 'serialized';
          },
        };
      },
    });

    const operation = buildHiveLoreCustomJsonOperation({
      signer: 'alice',
      action: 'revision_history',
      entityType: 'METADATA',
      entityId: 'revision-1',
      payload: {},
    });

    const built = await client.buildTransaction([operation]);
    const signed = await client.signTransaction(built, {
      provider: 'hivesigner',
      async signTransaction(transaction) {
        return {
          ...transaction,
          signatures: ['signature'],
        };
      },
    });

    assert.deepEqual(fixture.pushedOperations, [operation]);
    assert.equal(built.binaryHex, 'binary');
    assert.equal(built.unsignedBinaryHex, 'unsigned-binary');
    assert.equal(signed.transactionId, 'signed-id');
    assert.equal(await client.serializeTransaction(signed.transaction), 'serialized');
    assert.equal(
      await client.serializeTransaction(signed.transaction, true),
      'serialized-unsigned',
    );

    await client.broadcastTransaction(signed.transaction);

    assert.deepEqual(broadcasted, [signed.transaction]);
  });
});
