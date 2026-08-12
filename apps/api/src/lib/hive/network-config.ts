import {
  DEFAULT_HAF_API_URL,
  DEFAULT_HIVE_RPC_URL,
  DEFAULT_HIVE_TESTNET_RPC_URL,
  HIVE_MAINNET_CHAIN_ID,
  HIVE_PUBLIC_TESTNET_CHAIN_ID,
} from './constants.js';

export type HiveNetworkName = 'mainnet' | 'testnet';

export interface HiveNetworkConfig {
  name: HiveNetworkName;
  chainId: string;
  rpcNodes: string[];
  hafUrl?: string | undefined;
  addressPrefix: 'STM' | 'TST';
  customJsonId: string;
  transactionExpirationMinutes: number;
  explorerTransactionUrl?: string | undefined;
}

export interface HiveRetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterRatio: number;
  requestTimeoutMs: number;
  totalDeadlineMs: number;
  confirmationPollIntervalMs: number;
  confirmationTimeoutMs: number;
  maxConsecutiveNodeFailures: number;
  nodeCooldownMs: number;
}

export const DEFAULT_HIVE_RETRY_CONFIG: HiveRetryConfig = {
  backoffMultiplier: 2,
  confirmationPollIntervalMs: 3_000,
  confirmationTimeoutMs: 60_000,
  initialDelayMs: 500,
  jitterRatio: 0.2,
  maxAttempts: 4,
  maxConsecutiveNodeFailures: 1,
  maxDelayMs: 5_000,
  nodeCooldownMs: 30_000,
  requestTimeoutMs: 10_000,
  totalDeadlineMs: 90_000,
};

export function buildHiveNetworkConfig(input: {
  network: HiveNetworkName;
  mainnetChainId?: string | undefined;
  mainnetRpcNodes?: string | undefined;
  mainnetHafUrl?: string | undefined;
  testnetChainId?: string | undefined;
  testnetRpcNodes?: string | undefined;
  testnetHafUrl?: string | undefined;
  customJsonId: string;
  nodeEnv?: string | undefined;
}): HiveNetworkConfig {
  const isTestnet = input.network === 'testnet';
  const chainId = isTestnet
    ? input.testnetChainId || HIVE_PUBLIC_TESTNET_CHAIN_ID
    : input.mainnetChainId || HIVE_MAINNET_CHAIN_ID;
  const rpcNodes = parseNodeList(
    isTestnet
      ? input.testnetRpcNodes || DEFAULT_HIVE_TESTNET_RPC_URL
      : input.mainnetRpcNodes || DEFAULT_HIVE_RPC_URL,
    input.nodeEnv,
  );
  const hafUrl = isTestnet ? input.testnetHafUrl : input.mainnetHafUrl || DEFAULT_HAF_API_URL;

  validateChainId(chainId);

  if (!isTestnet && chainId !== HIVE_MAINNET_CHAIN_ID) {
    throw new Error('HIVE_MAINNET_CHAIN_ID must match the Hive mainnet chain ID.');
  }

  return {
    addressPrefix: isTestnet ? 'TST' : 'STM',
    chainId,
    customJsonId: input.customJsonId,
    explorerTransactionUrl: isTestnet
      ? 'https://testnet.openhive.network/tx/{transactionId}'
      : 'https://hiveblocks.com/tx/{transactionId}',
    hafUrl: hafUrl || undefined,
    name: input.network,
    rpcNodes,
    transactionExpirationMinutes: isTestnet ? 60 : 10,
  };
}

export function parseNodeList(value: string, nodeEnv = 'development'): string[] {
  const seen = new Set<string>();
  const nodes = value
    .split(',')
    .map((node) => node.trim())
    .filter(Boolean)
    .map((node) => {
      const url = new URL(node);

      if (url.username || url.password) {
        throw new Error('Hive RPC node URLs must not contain credentials.');
      }

      if (nodeEnv !== 'test' && nodeEnv !== 'development' && url.protocol !== 'https:') {
        throw new Error('Hive RPC node URLs must use HTTPS outside local/test environments.');
      }

      url.hash = '';

      return url.toString().replace(/\/$/, '');
    })
    .filter((node) => {
      if (seen.has(node)) {
        return false;
      }

      seen.add(node);

      return true;
    });

  if (nodes.length === 0) {
    throw new Error('At least one Hive RPC node must be configured.');
  }

  return nodes;
}

export function validateHiveRetryConfig(config: HiveRetryConfig): HiveRetryConfig {
  const entries = Object.entries(config);

  for (const [key, value] of entries) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid Hive retry configuration for ${key}.`);
    }
  }

  if (config.maxAttempts < 1) {
    throw new Error('HIVE_BROADCAST_MAX_ATTEMPTS must be at least 1.');
  }

  if (config.backoffMultiplier < 1) {
    throw new Error('HIVE_BROADCAST_BACKOFF_MULTIPLIER must be at least 1.');
  }

  if (config.initialDelayMs <= 0 || config.maxDelayMs < config.initialDelayMs) {
    throw new Error('Hive broadcast delay configuration is invalid.');
  }

  if (config.jitterRatio > 1) {
    throw new Error('HIVE_BROADCAST_JITTER_RATIO must be between 0 and 1.');
  }

  if (config.totalDeadlineMs < config.requestTimeoutMs) {
    throw new Error('HIVE_BROADCAST_TOTAL_DEADLINE_MS must be >= request timeout.');
  }

  if (config.totalDeadlineMs < config.confirmationTimeoutMs) {
    throw new Error('HIVE_BROADCAST_TOTAL_DEADLINE_MS must be >= confirmation timeout.');
  }

  return config;
}

export function sanitizeHiveNodeUrl(nodeUrl: string): string {
  const url = new URL(nodeUrl);

  url.username = '';
  url.password = '';
  url.pathname = '';
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
}

function validateChainId(chainId: string) {
  if (!/^[a-f0-9]{64}$/i.test(chainId)) {
    throw new Error('Hive chain ID must be a 64-character hex string.');
  }
}
