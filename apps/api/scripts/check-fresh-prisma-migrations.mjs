import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import pg from 'pg';

const { Client } = pg;

const disposablePrefix = 'hivelore_migrate_check_';
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;

if (!adminUrl) {
  throw new Error(
    'TEST_DATABASE_ADMIN_URL is required, for example postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  );
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

  if (result.status !== 0) {
    throw new Error(`prisma ${args.join(' ')} failed with exit code ${result.status}`);
  }
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

async function smokeCheckSchema() {
  const client = new Client({ connectionString: directUrl });
  await client.connect();

  try {
    const tables = await client.query(
      `
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename = ANY($1)
      `,
      [
        [
          'User',
          'World',
          'WorldSeed',
          'WorldMembership',
          'LoreEntry',
          'Proposal',
          'ProposalDecision',
          'ProposalComment',
          'IndexerWatermark',
        ],
      ],
    );

    const enums = await client.query(
      `
        SELECT typname
        FROM pg_type
        WHERE typname = ANY($1)
      `,
      [
        [
          'LoreType',
          'WorldAuditAction',
          'ProposalDecisionOutcome',
          'ContributionKind',
          'AuthProvider',
        ],
      ],
    );

    const constraints = await client.query(
      `
        SELECT conname
        FROM pg_constraint
        WHERE conname = ANY($1)
      `,
      [
        [
          'World_founderId_fkey',
          'ProposalDecision_proposalId_fkey',
          'ProposalComment_body_not_empty',
        ],
      ],
    );

    const indexes = await client.query(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1)
      `,
      [
        [
          'LoreEntry_worldId_slug_key',
          'ProposalDecision_decisionPayloadHash_key',
          'ProposalComment_proposalId_createdAt_id_idx',
        ],
      ],
    );

    const seedCounts = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM "User") AS users,
        (SELECT COUNT(*)::int FROM "World") AS worlds,
        (SELECT COUNT(*)::int FROM "WorldSeed") AS world_seeds,
        (SELECT COUNT(*)::int FROM "ContributionDraft") AS contribution_drafts
    `);

    const expectations = [
      ['tables', tables.rowCount, 9],
      ['enums', enums.rowCount, 5],
      ['constraints', constraints.rowCount, 3],
      ['indexes', indexes.rowCount, 3],
    ];

    for (const [label, actual, expected] of expectations) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected} ${label}, found ${actual}`);
      }
    }

    const counts = seedCounts.rows[0];
    if (
      counts.users < 2 ||
      counts.worlds < 1 ||
      counts.world_seeds < 1 ||
      counts.contribution_drafts < 1
    ) {
      throw new Error(`Seed smoke check failed: ${JSON.stringify(counts)}`);
    }
  } finally {
    await client.end();
  }
}

try {
  console.log(`Creating disposable PostgreSQL database ${databaseName}`);
  await createDatabase();

  console.log('Running prisma migrate deploy from migration zero');
  runPrisma(['migrate', 'deploy']);

  console.log('Re-running prisma migrate deploy to prove idempotency');
  runPrisma(['migrate', 'deploy']);

  console.log('Checking deployed schema for drift against schema.prisma');
  runPrisma([
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--exit-code',
  ]);

  console.log('Generating Prisma Client');
  runPrisma(['generate']);

  console.log('Running development seed against disposable database');
  runPrisma(['db', 'seed']);

  console.log('Smoke-checking tables, enums, constraints, indexes, and seed data');
  await smokeCheckSchema();

  console.log('Fresh Prisma migration check passed');
} finally {
  console.log(`Dropping disposable PostgreSQL database ${databaseName}`);
  await dropDatabase();
}
