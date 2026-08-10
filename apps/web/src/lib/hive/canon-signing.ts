'use client';

import type { CanonTransactionResponse } from '@/lib/api/proposals';

type HiveKeychainResponse = {
  success: boolean;
  error?: string;
  message?: string;
  result?: unknown;
};

type HiveKeychainWindow = Window & {
  hive_keychain?: {
    requestCustomJson?: (
      username: string,
      customJsonId: string,
      keyType: 'Posting' | 'Active',
      json: string,
      displayName: string,
      callback: (response: HiveKeychainResponse) => void,
    ) => void;
  };
};

export type HiveBroadcastReceipt = {
  provider: 'keychain' | 'manual';
  transactionId?: string;
  blockNumber?: number;
  operationIndex?: number;
};

function getCustomJsonJson(operation: CanonTransactionResponse['operation']) {
  const customJson = (operation as { custom_json_operation?: { json?: string } })
    .custom_json_operation;

  if (!customJson?.json) {
    throw new Error('Canon transaction operation is missing custom_json data.');
  }

  return customJson.json;
}

function getTransactionId(value: unknown) {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = record.id ?? record.tx_id ?? record.transaction_id;

  return typeof id === 'string' ? id : undefined;
}

export async function requestCanonDecisionSignature(
  operation: CanonTransactionResponse,
): Promise<HiveBroadcastReceipt> {
  const json = getCustomJsonJson(operation.operation);

  const keychain = (window as unknown as HiveKeychainWindow).hive_keychain;

  const requestCustomJson = keychain?.requestCustomJson;

  if (!requestCustomJson) {
    await navigator.clipboard?.writeText(json);

    return {
      provider: 'manual',
    };
  }

  return new Promise((resolve, reject) => {
    requestCustomJson(
      operation.signer,
      operation.customJsonId,
      'Posting',
      json,
      'HiveLore canon decision',
      (response) => {
        if (!response.success) {
          reject(new Error(response.error ?? response.message ?? 'Hive signing was cancelled.'));
          return;
        }

        const transactionId = getTransactionId(response.result);

        resolve({
          provider: 'keychain',
          ...(transactionId ? { transactionId } : {}),
        });
      },
    );
  });
}
