import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { stdin as input, stdout as output } from 'node:process';
import { config as loadDotenv } from 'dotenv';

import { formatHiveMainnetSmokeResult, runHiveMainnetSmoke } from '../lib/hive/mainnet-smoke.js';
import { buildMainnetSmokeNetworkFromEnv } from '../lib/hive/smoke-operation.js';

loadDotenv();
loadDotenv({ override: false, path: 'apps/api/.env' });

const CONFIRMATION_PHRASE = 'BROADCAST HIVELORE SMOKE';

async function main() {
  const account = process.env.HIVE_SMOKE_ACCOUNT?.trim();
  const postingKey = process.env.HIVE_SMOKE_POSTING_KEY?.trim();

  if (!account) {
    throw new Error('HIVE_SMOKE_ACCOUNT must be set in the local process environment.');
  }

  if (!postingKey) {
    throw new Error('HIVE_SMOKE_POSTING_KEY must be set in the local process environment.');
  }

  const network = buildMainnetSmokeNetworkFromEnv(process.env);
  const readline = createInterface({ input, output });

  try {
    output.write('WARNING: The next command broadcasts an irreversible Hive mainnet custom_json. ');
    const answer = await readline.question(`Type ${CONFIRMATION_PHRASE} to continue: `);

    if (answer.trim() !== CONFIRMATION_PHRASE) {
      output.write('verification summary: FAIL\n');
      process.exitCode = 1;
      return;
    }
  } finally {
    readline.close();
  }

  const result = await runHiveMainnetSmoke({
    account,
    network,
    postingKey,
  });

  output.write(`${formatHiveMainnetSmokeResult(result)}\n`);
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  process.stderr.write(`verification summary: FAIL (${message})\n`);
  process.exitCode = 1;
});
