import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

import { DEFAULT_HIVE_RETRY_CONFIG } from '../lib/hive/network-config.js';

loadDotenv();

const booleanEnv = (defaultValue: boolean) =>
  z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value === 'true'));
const optionalBooleanEnv = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  TRUST_PROXY: booleanEnv(false),
  AUTH_JWT_SECRET: z.string().min(32).optional(),
  AUTH_REFRESH_SECRET: z.string().min(32).optional(),
  AUTH_JWT_ISSUER: z.string().min(1).default('hivelore'),
  AUTH_JWT_AUDIENCE: z.string().min(1).default('hivelore-web'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 14),
  AUTH_CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  AUTH_COOKIE_SECURE: optionalBooleanEnv,
  HIVE_RPC_URL: z.string().url().default('https://api.hive.blog'),
  HIVE_NETWORK: z.enum(['mainnet', 'testnet']).default('mainnet'),
  HIVE_MAINNET_CHAIN_ID: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .default('beeab0de00000000000000000000000000000000000000000000000000000000'),
  HIVE_MAINNET_RPC_NODES: z.string().min(1).default('https://api.hive.blog'),
  HIVE_MAINNET_HAF_URL: z.string().url().default('https://api.hive.blog/hafbe-api'),
  HIVE_TESTNET_CHAIN_ID: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .default('18dcf0a285365fc58b71f18b3d3fec954aa0c141c44e4e5cb4cf777b9eab274e'),
  HIVE_TESTNET_RPC_NODES: z.string().min(1).default('https://testnet.openhive.network'),
  HIVE_TESTNET_HAF_URL: z.string().url().optional(),
  HIVE_BROADCAST_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HIVE_RETRY_CONFIG.maxAttempts),
  HIVE_BROADCAST_INITIAL_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HIVE_RETRY_CONFIG.initialDelayMs),
  HIVE_BROADCAST_MAX_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HIVE_RETRY_CONFIG.maxDelayMs),
  HIVE_BROADCAST_BACKOFF_MULTIPLIER: z.coerce
    .number()
    .positive()
    .default(DEFAULT_HIVE_RETRY_CONFIG.backoffMultiplier),
  HIVE_BROADCAST_JITTER_RATIO: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(DEFAULT_HIVE_RETRY_CONFIG.jitterRatio),
  HIVE_BROADCAST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HIVE_RETRY_CONFIG.requestTimeoutMs),
  HIVE_BROADCAST_TOTAL_DEADLINE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HIVE_RETRY_CONFIG.totalDeadlineMs),
  HIVE_CONFIRMATION_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HIVE_RETRY_CONFIG.confirmationPollIntervalMs),
  HIVE_CONFIRMATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HIVE_RETRY_CONFIG.confirmationTimeoutMs),
  HIVE_NODE_MAX_CONSECUTIVE_FAILURES: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HIVE_RETRY_CONFIG.maxConsecutiveNodeFailures),
  HIVE_NODE_COOLDOWN_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HIVE_RETRY_CONFIG.nodeCooldownMs),
  HIVE_AUTH_AUDIENCE: z.string().min(1).default('hivelore-local-api'),
  HAF_API_URL: z.string().url().default('https://api.hive.blog/hafbe-api'),
  HIVELORE_APP_ID: z.string().min(1).default('hivelore/0.1.0'),
  INDEXER_NAME: z.string().min(1).default('hivelore-haf'),
  INDEXER_START_BLOCK: z.coerce.number().int().positive().default(1),
  INDEXER_BATCH_SIZE: z.coerce.number().int().positive().max(1_000).default(100),
  INDEXER_MAX_BLOCKS_PER_RUN: z.coerce.number().int().positive().default(1_000),
  GOOGLE_AUTH_ENABLED: booleanEnv(false),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_HIVE_PROVISIONING_ENABLED: booleanEnv(false),
  HIVE_RC_DELEGATION_ENABLED: booleanEnv(false),
  HIVE_RC_DELEGATOR_ACCOUNT: z.string().optional(),
  HIVE_RC_DELEGATION_AMOUNT: z.string().optional(),
});

export function parseEnv(environment: NodeJS.ProcessEnv) {
  const parsed = envSchema.safeParse(environment);

  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid API environment configuration: ${errors}`);
  }

  const parsedEnv =
    parsed.data.NODE_ENV === 'test'
      ? {
          ...parsed.data,
          AUTH_JWT_SECRET:
            parsed.data.AUTH_JWT_SECRET ?? 'test-only-jwt-secret-with-enough-entropy',
          AUTH_REFRESH_SECRET:
            parsed.data.AUTH_REFRESH_SECRET ?? 'test-only-refresh-secret-with-enough-entropy',
        }
      : parsed.data;

  if (parsedEnv.NODE_ENV !== 'test') {
    if (!parsedEnv.AUTH_JWT_SECRET) {
      throw new Error('AUTH_JWT_SECRET must be set.');
    }

    if (!parsedEnv.AUTH_REFRESH_SECRET) {
      throw new Error('AUTH_REFRESH_SECRET must be set.');
    }

    if (
      parsedEnv.AUTH_JWT_SECRET.includes('development-only') ||
      parsedEnv.AUTH_REFRESH_SECRET.includes('development-only')
    ) {
      throw new Error('Authentication secrets must not use development-only defaults.');
    }
  }

  if (parsedEnv.NODE_ENV === 'production' && parsedEnv.AUTH_COOKIE_SECURE === false) {
    throw new Error('AUTH_COOKIE_SECURE must be true in production.');
  }

  if (
    parsedEnv.GOOGLE_AUTH_ENABLED &&
    (!parsedEnv.GOOGLE_CLIENT_ID ||
      !parsedEnv.GOOGLE_CLIENT_SECRET ||
      !parsedEnv.GOOGLE_REDIRECT_URI)
  ) {
    throw new Error('Google auth is enabled but Google OAuth environment variables are missing.');
  }

  if (
    parsedEnv.HIVE_RC_DELEGATION_ENABLED &&
    (!parsedEnv.HIVE_RC_DELEGATOR_ACCOUNT || !parsedEnv.HIVE_RC_DELEGATION_AMOUNT)
  ) {
    throw new Error('Hive RC delegation is enabled but delegation configuration is missing.');
  }

  if (!parsedEnv.AUTH_JWT_SECRET || !parsedEnv.AUTH_REFRESH_SECRET) {
    throw new Error('Authentication secrets must be set.');
  }

  return parsedEnv as typeof parsedEnv & {
    AUTH_JWT_SECRET: string;
    AUTH_REFRESH_SECRET: string;
  };
}

export const env = parseEnv(process.env);
