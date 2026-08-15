import type { ApiTransaction, operation } from '@hiveio/wax';

export type HiveLoreCommentKind = 'world_seed' | 'world_bible' | 'canon_lore' | 'story_chapter';

export type HiveLoreCustomJsonAction =
  'canon_approval' | 'lore_relationship' | 'revision_history' | 'beneficiary_metadata';

export type HiveAuthorityKind = 'posting' | 'active';

export type HiveLoreEntityType =
  | 'WORLD_SEED'
  | 'WORLD_BIBLE_VERSION'
  | 'LORE_ENTRY'
  | 'STORY_CHAPTER'
  | 'CANON_DECISION'
  | 'LORE_RELATIONSHIP'
  | 'METADATA';

export type HiveLoreOperation = operation;

export interface HiveLoreMetadata {
  app: string;
  format: 'markdown';
  tags: string[];
  hivelore: {
    schemaVersion: number;
    kind: HiveLoreCommentKind;
    entityType: HiveLoreEntityType;
    entityId: string;
    worldId?: string | undefined;
    proposalId?: string | undefined;
  };
}

export interface HiveLoreCustomJsonPayload {
  app: string;
  schemaVersion: number;
  action: HiveLoreCustomJsonAction;
  signer: string;
  entityType: HiveLoreEntityType;
  entityId: string;
  worldId?: string | undefined;
  proposalId?: string | undefined;
  payload: Record<string, unknown>;
}

export interface HiveLoreSmokePayload {
  app: 'hivelore';
  type: 'mainnet_smoke';
  version: 1;
  purpose: 'broadcast_readback_verification';
}

export interface BuiltHiveTransaction {
  transaction: ApiTransaction;
  binaryHex: string;
  unsignedBinaryHex: string;
  requiredAuthorities: unknown;
}

export interface SignedHiveTransaction {
  transaction: ApiTransaction;
  binaryHex: string;
  transactionId: string;
}

export interface HiveTransactionSigner {
  readonly provider: 'hive-keychain' | 'hivesigner' | 'wax';
  signTransaction(transaction: ApiTransaction): Promise<ApiTransaction>;
}

export interface HafOperationRow {
  block_num?: number | string;
  blockNumber?: number | string;
  block?: number | string;
  transaction_num?: number | string;
  transaction_id?: string;
  transactionId?: string;
  trx_id?: string;
  operation_id?: number | string;
  operationIndex?: number | string;
  op_in_trx?: number | string;
  op_pos?: number | string;
  timestamp?: string;
  created_at?: string;
  operation_type?: string;
  operationType?: string;
  type?: string;
  operation?: unknown;
  op?: unknown;
  body?: unknown;
}

export interface HafBlockSearchPage {
  operations: HafOperationRow[];
  page?: number;
  totalPages?: number;
}

export interface NormalizedHiveOperation {
  blockNumber: bigint;
  transactionId: string;
  operationIndex: number;
  blockchainTimestamp: Date;
  operationType: 'comment' | 'custom_json';
  operation: HiveLoreOperation;
}

export interface HiveOperationVerification {
  ok: boolean;
  reason?: string;
  signer?: string;
  entityType?: HiveLoreEntityType;
  entityId?: string;
  payload?: HiveLoreMetadata | HiveLoreCustomJsonPayload | HiveLoreSmokePayload;
}
