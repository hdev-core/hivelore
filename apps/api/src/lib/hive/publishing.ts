import type {
  BuiltHiveTransaction,
  HiveTransactionSigner,
  SignedHiveTransaction,
} from './types.js';
import {
  buildHiveLoreCommentOperation,
  buildHiveLoreCustomJsonOperation,
  type BuildHiveLoreCommentInput,
  type BuildHiveLoreCustomJsonInput,
} from './operations.js';
import { HiveWaxClient } from './wax-client.js';

export async function prepareHiveLoreCommentTransaction(
  client: HiveWaxClient,
  input: BuildHiveLoreCommentInput,
): Promise<BuiltHiveTransaction> {
  return client.buildTransaction([buildHiveLoreCommentOperation(input)]);
}

export async function prepareHiveLoreCustomJsonTransaction(
  client: HiveWaxClient,
  input: BuildHiveLoreCustomJsonInput,
): Promise<BuiltHiveTransaction> {
  return client.buildTransaction([buildHiveLoreCustomJsonOperation(input)]);
}

export async function signHiveLoreTransaction(
  client: HiveWaxClient,
  transaction: BuiltHiveTransaction,
  signer: HiveTransactionSigner,
): Promise<SignedHiveTransaction> {
  return client.signTransaction(transaction, signer);
}

export async function broadcastHiveLoreTransaction(
  client: HiveWaxClient,
  transaction: SignedHiveTransaction,
): Promise<void> {
  await client.broadcastTransaction(transaction.transaction);
}
