import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { cryptoUtils, PrivateKey } from '@hiveio/dhive';
import type { ExtendedAccount } from '@hiveio/dhive';

import { DhivePostingSignatureVerifier, type HiveAccountClient } from './hive-signature.js';

function createAccount(username: string, publicKey: string, weightThreshold = 1, weight = 1) {
  return {
    name: username,
    posting: {
      account_auths: [],
      key_auths: [[publicKey, weight]],
      weight_threshold: weightThreshold,
    },
  } as unknown as ExtendedAccount;
}

function signMessage(message: string, privateKey: PrivateKey) {
  return privateKey.sign(cryptoUtils.sha256(message)).toString();
}

describe('Hive posting signature verifier', () => {
  test('accepts a signature from an authorized posting key', async () => {
    const privateKey = PrivateKey.fromSeed('alice-posting');
    const publicKey = privateKey.createPublic('STM').toString();
    const verifier = new DhivePostingSignatureVerifier({
      async getAccount() {
        return createAccount('alice', publicKey);
      },
    });
    const message = 'HiveLore Authentication';

    const verified = await verifier.verifyPostingSignature({
      message,
      signature: signMessage(message, privateKey),
      username: 'alice',
    });

    assert.equal(verified, true);
  });

  test('rejects malformed signatures and unknown accounts', async () => {
    const verifier = new DhivePostingSignatureVerifier({
      async getAccount() {
        return null;
      },
    });

    assert.equal(
      await verifier.verifyPostingSignature({
        message: 'message',
        signature: 'not-a-signature',
        username: 'alice',
      }),
      false,
    );

    const privateKey = PrivateKey.fromSeed('alice-posting');
    assert.equal(
      await verifier.verifyPostingSignature({
        message: 'message',
        signature: signMessage('message', privateKey),
        username: 'alice',
      }),
      false,
    );
  });

  test('rejects signatures from another account or insufficient authority weight', async () => {
    const authorizedPrivateKey = PrivateKey.fromSeed('alice-posting');
    const otherPrivateKey = PrivateKey.fromSeed('bob-posting');
    const authorizedPublicKey = authorizedPrivateKey.createPublic('STM').toString();
    const accountClient: HiveAccountClient = {
      async getAccount() {
        return createAccount('alice', authorizedPublicKey, 2, 1);
      },
    };
    const verifier = new DhivePostingSignatureVerifier(accountClient);
    const message = 'HiveLore Authentication';

    assert.equal(
      await verifier.verifyPostingSignature({
        message,
        signature: signMessage(message, otherPrivateKey),
        username: 'alice',
      }),
      false,
    );
    assert.equal(
      await verifier.verifyPostingSignature({
        message,
        signature: signMessage(message, authorizedPrivateKey),
        username: 'alice',
      }),
      false,
    );
  });
});
