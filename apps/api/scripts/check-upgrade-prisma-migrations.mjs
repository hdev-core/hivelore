import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import pg from 'pg';

const { Client } = pg;

const disposablePrefix = 'hivelore_migrate_upgrade_';
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const baseSchema = process.env.TEST_DATABASE_BASE_PRISMA_SCHEMA;
const repairedMigration = '20260718154842_init';

if (!adminUrl) {
  throw new Error(
    'TEST_DATABASE_ADMIN_URL is required, for example postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  );
}

if (!baseSchema) {
  throw new Error('TEST_DATABASE_BASE_PRISMA_SCHEMA must point to the base branch schema.prisma.');
}

const databaseName = `${disposablePrefix}${Date.now()}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;

if (!databaseName.startsWith(disposablePrefix)) {
  throw new Error(`Refusing to use non-disposable database name: ${databaseName}`);
}

const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const directUrl = databaseUrl.toString();

function runPrisma(args, options = {}) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(executable, ['prisma', ...args], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL: directUrl,
      DIRECT_URL: directUrl,
      NODE_ENV: 'test',
    },
    shell: false,
    stdio: 'inherit',
    ...options,
  });

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`prisma ${args.join(' ')} failed with exit code ${result.status}`);
  }

  return result.status ?? 1;
}

async function withAdminClient(callback) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function createDatabase() {
  await withAdminClient((client) => client.query(`CREATE DATABASE "${databaseName}"`));
}

async function dropDatabase() {
  if (!databaseName.startsWith(disposablePrefix)) {
    throw new Error(`Refusing to drop non-disposable database: ${databaseName}`);
  }

  await withAdminClient(async (client) => {
    await client.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
      `,
      [databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  });
}

try {
  console.log(`Creating disposable PostgreSQL database ${databaseName}`);
  await createDatabase();

  console.log('Deploying base branch migration history');
  const baseStatus = runPrisma(['migrate', 'deploy', '--schema', baseSchema], {
    allowFailure: true,
  });

  if (baseStatus !== 0) {
    console.log(`Resolving historical failed migration ${repairedMigration} as rolled back`);
    runPrisma(['migrate', 'resolve', '--rolled-back', repairedMigration]);
  }

  console.log('Deploying repaired migration history from this branch');
  runPrisma(['migrate', 'deploy']);

  console.log('Checking upgraded schema for drift against schema.prisma');
  runPrisma([
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    'prisma/schema.prisma',
    '--exit-code',
  ]);

  console.log('Prisma migration upgrade check passed');
} finally {
  console.log(`Dropping disposable PostgreSQL database ${databaseName}`);
  await dropDatabase();
}
