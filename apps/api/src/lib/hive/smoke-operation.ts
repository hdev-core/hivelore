import type { custom_json } from '@hiveio/wax';

import { HIVE_MAINNET_CHAIN_ID, HIVELORE_SMOKE_CUSTOM_JSON_ID } from './constants.js';
import { buildHiveNetworkConfig, type HiveNetworkConfig } from './network-config.js';
import { hiveAccountNameSchema } from './operations.js';
import type { HiveLoreOperation } from './types.js';

export const HIVELORE_MAINNET_SMOKE_PAYLOAD = {
  app: 'hivelore',
  type: 'mainnet_smoke',
  version: 1,
  purpose: 'broadcast_readback_verification',
} as const;

export function buildHiveLoreSmokeCustomJsonOperation(account: string): HiveLoreOperation {
  const signer = hiveAccountNameSchema.parse(account);
  const operation: custom_json = {
    id: HIVELORE_SMOKE_CUSTOM_JSON_ID,
    json: JSON.stringify(HIVELORE_MAINNET_SMOKE_PAYLOAD),
    required_auths: [],
    required_posting_auths: [signer],
  };

  return {
    custom_json_operation: operation,
  };
}

export function verifyHiveLoreSmokeOperation(input: {
  operation: HiveLoreOperation;
  expectedSigner: string;
}):
  | { ok: true; signer: string; payload: typeof HIVELORE_MAINNET_SMOKE_PAYLOAD }
  | {
      ok: false;
      reason: string;
    } {
  const expectedSigner = hiveAccountNameSchema.parse(input.expectedSigner);
  const customJson = input.operation.custom_json_operation;

  if (!customJson) {
    return { ok: false, reason: 'Operation is not custom_json.' };
  }

  if (customJson.id !== HIVELORE_SMOKE_CUSTOM_JSON_ID) {
    return { ok: false, reason: 'custom_json ID is not hivelore_smoke.' };
  }

  if (customJson.required_auths.length !== 0) {
    return { ok: false, reason: 'Smoke custom_json must not require active authority.' };
  }

  if (
    customJson.required_posting_auths.length !== 1 ||
    customJson.required_posting_auths[0] !== expectedSigner
  ) {
    return { ok: false, reason: 'Smoke custom_json must require posting authority only.' };
  }

  const payload = parseSmokePayload(customJson.json);

  if (!payload) {
    return { ok: false, reason: 'Smoke custom_json payload does not match expected payload.' };
  }

  return { ok: true, payload, signer: expectedSigner };
}

export function assertPostingAuthorityOnly(operation: HiveLoreOperation): void {
  const customJson = operation.custom_json_operation;

  if (!customJson) {
    throw new Error('Smoke operation must be a custom_json operation.');
  }

  if (customJson.required_auths.length > 0) {
    throw new Error('BUG: smoke operation requested active authority.');
  }

  if (customJson.required_posting_auths.length !== 1) {
    throw new Error('Smoke operation must request exactly one posting authority.');
  }
}

export function buildMainnetSmokeNetworkFromEnv(environment: NodeJS.ProcessEnv): HiveNetworkConfig {
  const network = buildHiveNetworkConfig({
    customJsonId: HIVELORE_SMOKE_CUSTOM_JSON_ID,
    mainnetChainId: environment.HIVE_MAINNET_CHAIN_ID,
    mainnetHafUrl: environment.HIVE_MAINNET_HAF_URL,
    mainnetRpcNodes: environment.HIVE_MAINNET_RPC_NODES,
    nodeEnv: environment.NODE_ENV,
  });

  if (network.name !== 'mainnet' || network.chainId !== HIVE_MAINNET_CHAIN_ID) {
    throw new Error('Hive smoke test must be pinned to Hive mainnet.');
  }

  if (network.customJsonId !== HIVELORE_SMOKE_CUSTOM_JSON_ID) {
    throw new Error('Hive smoke test must use custom_json ID hivelore_smoke.');
  }

  return network;
}

function parseSmokePayload(value: string): typeof HIVELORE_MAINNET_SMOKE_PAYLOAD | null {
  try {
    const payload = JSON.parse(value) as typeof HIVELORE_MAINNET_SMOKE_PAYLOAD;

    return payload.type === HIVELORE_MAINNET_SMOKE_PAYLOAD.type &&
      payload.version === HIVELORE_MAINNET_SMOKE_PAYLOAD.version &&
      payload.purpose === HIVELORE_MAINNET_SMOKE_PAYLOAD.purpose
      ? payload
      : null;
  } catch {
    return null;
  }
}
