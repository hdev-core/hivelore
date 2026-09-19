import type { ApiTransaction } from '@hiveio/wax';
import { PrivateKey, cryptoUtils } from '@hiveio/dhive';

import type { HiveNetworkConfig } from './network-config.js';
import { hiveAccountNameSchema } from './operations.js';
import { HiveReliableBroadcaster, type HiveBroadcastTransport } from './broadcast-reliability.js';
import { HiveWaxClient } from './wax-client.js';
import {
  assertPostingAuthorityOnly,
  buildHiveLoreSmokeCustomJsonOperation,
  verifyHiveLoreSmokeOperation,
} from './smoke-operation.js';

export interface HiveMainnetSmokeResult {
  transactionId: string;
  blockNumber: number;
  blockTimestamp: string;
  rpcNodeUsed: string;
  verificationSummary: 'PASS' | 'FAIL';
}

export interface RunHiveMainnetSmokeInput {
  account: string;
  postingKey: string;
  network: HiveNetworkConfig;
  waxClient?: HiveWaxClient | undefined;
  transport?: HiveBroadcastTransport | undefined;
}

export async function runHiveMainnetSmoke(
  input: RunHiveMainnetSmokeInput,
): Promise<HiveMainnetSmokeResult> {
  const signer = hiveAccountNameSchema.parse(input.account);
  const operation = buildHiveLoreSmokeCustomJsonOperation(signer);
  const smokeVerification = verifyHiveLoreSmokeOperation({ expectedSigner: signer, operation });

  if (!smokeVerification.ok) {
    throw new Error(smokeVerification.reason);
  }

  assertPostingAuthorityOnly(operation);

  const primaryRpcNode = input.network.rpcNodes[0];

  if (!primaryRpcNode) {
    throw new Error('Hive mainnet smoke test requires at least one RPC node.');
  }

  const waxClient =
    input.waxClient ??
    new HiveWaxClient({
      apiEndpoint: primaryRpcNode,
      chainId: input.network.chainId,
    });
  const built = await waxClient.buildTransaction([operation]);
  const signed = await waxClient.signTransaction(built, {
    provider: 'wax',
    async signTransaction(transaction) {
      return signApiTransactionWithPostingKey({
        chainId: input.network.chainId,
        postingKey: input.postingKey,
        transaction,
      });
    },
  });
  const broadcaster = new HiveReliableBroadcaster(input.network, input.transport);
  const confirmed = await broadcaster.broadcastSignedTransaction({
    expectedOperation: operation,
    expectedSigner: signer,
    transaction: signed.transaction,
    transactionId: signed.transactionId,
  });

  return {
    blockNumber: confirmed.blockNumber,
    blockTimestamp: confirmed.blockchainTimestamp,
    rpcNodeUsed: confirmed.nodeUrl ?? primaryRpcNode,
    transactionId: confirmed.transactionId,
    verificationSummary: 'PASS',
  };
}

export function formatHiveMainnetSmokeResult(result: HiveMainnetSmokeResult): string {
  return [
    `transaction ID: ${result.transactionId}`,
    `block number: ${result.blockNumber}`,
    `block timestamp: ${result.blockTimestamp}`,
    `RPC node used: ${result.rpcNodeUsed}`,
    `verification summary: ${result.verificationSummary}`,
  ].join('\n');
}

export function signApiTransactionWithPostingKey(input: {
  transaction: ApiTransaction;
  postingKey: string;
  chainId: string;
}): ApiTransaction {
  const key = PrivateKey.fromString(input.postingKey);
  const signed = cryptoUtils.signTransaction(
    apiTransactionToLegacyCustomJsonTransaction(input.transaction),
    key,
    Buffer.from(input.chainId, 'hex'),
  );

  return {
    ...input.transaction,
    signatures: signed.signatures,
  };
}

function apiTransactionToLegacyCustomJsonTransaction(transaction: ApiTransaction) {
  return {
    ...transaction,
    operations: transaction.operations.map((operation) => {
      const customJson =
        'custom_json_operation' in operation
          ? operation.custom_json_operation
          : operation.type === 'custom_json_operation'
            ? operation.value
            : undefined;

      if (!customJson) {
        throw new Error('Smoke transaction may only contain custom_json operations.');
      }

      return ['custom_json', customJson] as const;
    }),
  };
}
