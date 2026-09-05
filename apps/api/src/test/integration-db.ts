import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { PrismaClient } from '../generated/prisma/client.js';

const { Client } = pg;

export const testDatabaseAdminUrl = process.env.TEST_DATABASE_ADMIN_URL;

function disposableDatabaseName(prefix: string) {
  return `${prefix}_${Date.now()}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

function databaseUrlFor(adminConnectionUrl: string, databaseName: string) {
  const databaseUrl = new URL(adminConnectionUrl);
  databaseUrl.pathname = `/${databaseName}`;

  return databaseUrl.toString();
}

async function withPgClient<T>(
  connectionString: string,
  callback: (client: pg.Client) => Promise<T>,
) {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function runPrismaMigrateDeploy(databaseUrl: string) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(executable, ['prisma', 'migrate', 'deploy'], {
    cwd: new URL('../..', import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      NODE_ENV: 'test',
    },
    shell: false,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed with exit code ${result.status}`);
  }
}

export function createPrismaClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

export async function withDisposablePrismaDatabase<T>(
  prefix: string,
  callback: (database: PrismaClient, databaseUrl: string) => Promise<T>,
) {
  if (!testDatabaseAdminUrl) {
    throw new Error('TEST_DATABASE_ADMIN_URL is not configured.');
  }

  const databaseName = disposableDatabaseName(prefix);

  if (!databaseName.startsWith(`${prefix}_`)) {
    throw new Error(`Refusing to use non-disposable database name: ${databaseName}`);
  }

  const directUrl = databaseUrlFor(testDatabaseAdminUrl, databaseName);

  await withPgClient(testDatabaseAdminUrl, (client) =>
    client.query(`CREATE DATABASE "${databaseName}"`),
  );

  try {
    runPrismaMigrateDeploy(directUrl);

    const database = createPrismaClient(directUrl);

    try {
      return await callback(database, directUrl);
    } finally {
      await database.$disconnect();
    }
  } finally {
    await withPgClient(testDatabaseAdminUrl, async (client) => {
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
}
