import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import pg from 'pg';

const { Client } = pg;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const currentApiDir = resolve(scriptDir, '..');
const repoRoot = resolve(currentApiDir, '..', '..');
const baseRef = process.env.PRISMA_MIGRATION_BASE_REF ?? process.env.GITHUB_BASE_REF ?? 'develop';
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const disposablePrefix = 'hivelore_upgrade_check_';
const databaseName = `${disposablePrefix}${Date.now()}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const baseWorktreeDir = mkdtempSync(join(tmpdir(), 'hivelore-base-migrations-'));

if (!adminUrl) {
  throw new Error(
    'TEST_DATABASE_ADMIN_URL is required, for example postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  );
}

if (!databaseName.startsWith(disposablePrefix)) {
  throw new Error(`Refusing to use non-disposable database name: ${databaseName}`);
}

const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const directUrl = databaseUrl.toString();
let databaseCreated = false;
let worktreeAdded = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    shell: false,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function prismaExecutable() {
  return join(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
}

function runPrisma(args, cwd) {
  run(prismaExecutable(), args, {
    cwd,
    env: {
      ...process.env,
      DATABASE_URL: directUrl,
      DIRECT_URL: directUrl,
      NODE_ENV: 'test',
    },
  });
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
  console.log(`Fetching base branch origin/${baseRef}`);
  run('git', ['fetch', '--depth=1', 'origin', baseRef]);

  console.log(`Checking out base branch migrations into ${baseWorktreeDir}`);
  run('git', ['worktree', 'add', '--detach', baseWorktreeDir, 'FETCH_HEAD']);
  worktreeAdded = true;

  console.log(`Creating disposable PostgreSQL database ${databaseName}`);
  await createDatabase();
  databaseCreated = true;

  console.log(`Deploying base branch migration history from origin/${baseRef}`);
  runPrisma(['migrate', 'deploy'], join(baseWorktreeDir, 'apps', 'api'));

  console.log('Deploying current branch migrations over the base schema');
  runPrisma(['migrate', 'deploy'], currentApiDir);

  console.log('Checking upgraded schema for drift against current schema.prisma');
  runPrisma(
    [
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--exit-code',
    ],
    currentApiDir,
  );

  console.log('Prisma migration upgrade check passed');
} finally {
  if (databaseCreated) {
    console.log(`Dropping disposable PostgreSQL database ${databaseName}`);
    await dropDatabase().catch((error) => {
      console.error(error);
    });
  }

  if (worktreeAdded) {
    console.log(`Removing base worktree ${baseWorktreeDir}`);
    try {
      run('git', ['worktree', 'remove', '--force', baseWorktreeDir]);
    } catch (error) {
      console.error(error);
    }
  }
  rmSync(baseWorktreeDir, { force: true, recursive: true });
}
