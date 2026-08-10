import { env } from '../../config/env.js';
import { HiveReliableBroadcaster } from './broadcast-reliability.js';
import { HafClient } from './haf-client.js';
import { HIVELORE_CUSTOM_JSON_ID } from './constants.js';
import {
  buildHiveNetworkConfig,
  validateHiveRetryConfig,
  type HiveRetryConfig,
} from './network-config.js';
import { HiveWaxClient } from './wax-client.js';

export function createHiveNetworkConfig() {
  return buildHiveNetworkConfig({
    customJsonId: HIVELORE_CUSTOM_JSON_ID,
    mainnetChainId: env.HIVE_MAINNET_CHAIN_ID,
    mainnetHafUrl: env.HIVE_MAINNET_HAF_URL,
    mainnetRpcNodes: env.HIVE_MAINNET_RPC_NODES || env.HIVE_RPC_URL,
    network: env.HIVE_NETWORK,
    nodeEnv: env.NODE_ENV,
    testnetChainId: env.HIVE_TESTNET_CHAIN_ID,
    testnetHafUrl: env.HIVE_TESTNET_HAF_URL,
    testnetRpcNodes: env.HIVE_TESTNET_RPC_NODES,
  });
}

export function createHiveRetryConfig(): HiveRetryConfig {
  return validateHiveRetryConfig({
    backoffMultiplier: env.HIVE_BROADCAST_BACKOFF_MULTIPLIER,
    confirmationPollIntervalMs: env.HIVE_CONFIRMATION_POLL_INTERVAL_MS,
    confirmationTimeoutMs: env.HIVE_CONFIRMATION_TIMEOUT_MS,
    initialDelayMs: env.HIVE_BROADCAST_INITIAL_DELAY_MS,
    jitterRatio: env.HIVE_BROADCAST_JITTER_RATIO,
    maxAttempts: env.HIVE_BROADCAST_MAX_ATTEMPTS,
    maxConsecutiveNodeFailures: env.HIVE_NODE_MAX_CONSECUTIVE_FAILURES,
    maxDelayMs: env.HIVE_BROADCAST_MAX_DELAY_MS,
    nodeCooldownMs: env.HIVE_NODE_COOLDOWN_MS,
    requestTimeoutMs: env.HIVE_BROADCAST_TIMEOUT_MS,
    totalDeadlineMs: env.HIVE_BROADCAST_TOTAL_DEADLINE_MS,
  });
}

export function createHiveWaxClient() {
  const network = createHiveNetworkConfig();
  const [apiEndpoint] = network.rpcNodes;

  if (!apiEndpoint) {
    throw new Error('At least one Hive RPC node must be configured.');
  }

  return new HiveWaxClient({
    apiEndpoint,
    appName: env.HIVELORE_APP_ID,
    apiTimeoutMs: env.HIVE_BROADCAST_TIMEOUT_MS,
    chainId: network.chainId,
  });
}

export function createHafClient() {
  const network = createHiveNetworkConfig();

  return new HafClient({
    baseUrl: network.hafUrl ?? env.HAF_API_URL,
  });
}

export function createHiveReliableBroadcaster() {
  return new HiveReliableBroadcaster(createHiveNetworkConfig(), undefined, createHiveRetryConfig());
}
