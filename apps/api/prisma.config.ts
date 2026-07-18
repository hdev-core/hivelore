import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // DIRECT_URL is the direct PostgreSQL connection used by Prisma migrations.
    // DATABASE_URL remains the pooled application connection consumed by the API client.
    url: env('DIRECT_URL'),
  },
});
