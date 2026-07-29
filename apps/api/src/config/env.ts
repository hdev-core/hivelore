import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  HIVE_RPC_URL: z.string().url().default('https://api.hive.blog'),
  HAF_API_URL: z.string().url().default('https://api.hive.blog/hafbe-api'),
  HIVELORE_APP_ID: z.string().min(1).default('hivelore/0.1.0'),
  INDEXER_NAME: z.string().min(1).default('hivelore-haf'),
  INDEXER_START_BLOCK: z.coerce.number().int().positive().default(1),
  INDEXER_BATCH_SIZE: z.coerce.number().int().positive().max(1_000).default(100),
  INDEXER_MAX_BLOCKS_PER_RUN: z.coerce.number().int().positive().default(1_000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid API environment configuration: ${errors}`);
}

export const env = parsed.data;
