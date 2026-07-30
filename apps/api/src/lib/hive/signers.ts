import type { ApiTransaction } from '@hiveio/wax';

import type { BuiltHiveTransaction, HiveAuthorityKind, HiveTransactionSigner } from './types.js';

export interface HiveKeychainSignRequest {
  provider: 'hive-keychain';
  username: string;
  authority: HiveAuthorityKind;
  transaction: ApiTransaction;
}

export interface HiveSignerSignRequest {
  provider: 'hivesigner';
  username: string;
  authority: HiveAuthorityKind;
  transaction: ApiTransaction;
  callbackUrl: string;
}

export type BrowserHiveSignRequest = HiveKeychainSignRequest | HiveSignerSignRequest;

export function createHiveKeychainSignRequest(input: {
  username: string;
  authority?: HiveAuthorityKind;
  builtTransaction: BuiltHiveTransaction;
}): HiveKeychainSignRequest {
  return {
    provider: 'hive-keychain',
    username: input.username.trim().toLowerCase(),
    authority: input.authority ?? 'posting',
    transaction: input.builtTransaction.transaction,
  };
}

export function createHiveSignerSignRequest(input: {
  username: string;
  authority?: HiveAuthorityKind;
  builtTransaction: BuiltHiveTransaction;
  callbackUrl: string;
}): HiveSignerSignRequest {
  return {
    provider: 'hivesigner',
    username: input.username.trim().toLowerCase(),
    authority: input.authority ?? 'posting',
    transaction: input.builtTransaction.transaction,
    callbackUrl: input.callbackUrl,
  };
}

export function createExternalSigner(
  provider: HiveTransactionSigner['provider'],
  sign: (transaction: ApiTransaction) => Promise<ApiTransaction>,
): HiveTransactionSigner {
  return {
    provider,
    signTransaction: sign,
  };
}
