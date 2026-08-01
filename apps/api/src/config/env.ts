import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

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
  AUTH_JWT_SECRET: z
    .string()
    .min(32)
    .default('development-only-auth-secret-change-before-production'),
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

  const parsedEnv = parsed.data;

  if (
    parsedEnv.NODE_ENV === 'production' &&
    parsedEnv.AUTH_JWT_SECRET.includes('development-only')
  ) {
    throw new Error('AUTH_JWT_SECRET must be set to a production secret.');
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

  return parsedEnv;
}

export const env = parseEnv(process.env);
