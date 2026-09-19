import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

function findTestFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return findTestFiles(path);
    }

    return entry.endsWith('.test.ts') ? [path] : [];
  });
}

const testFiles = findTestFiles('src');

if (testFiles.length === 0) {
  throw new Error('No API test files were discovered.');
}

console.log(`Discovered ${testFiles.length} API test files.`);

const testArgs = ['tsx', '--test', ...testFiles];
const command =
  process.platform === 'win32'
    ? {
        args: testArgs,
        executable: 'npx.cmd',
        shell: true,
      }
    : {
        args: testArgs,
        executable: 'npx',
        shell: false,
      };
const result = spawnSync(command.executable, command.args, {
  env: {
    ...process.env,
    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? 'test-only-jwt-secret-with-enough-entropy',
    AUTH_REFRESH_SECRET:
      process.env.AUTH_REFRESH_SECRET ?? 'test-only-refresh-secret-with-enough-entropy',
    NODE_ENV: 'test',
  },
  shell: command.shell,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
}

if (result.status !== 0) {
  console.error(`API test command exited with status ${result.status ?? 'null'}.`);
}

process.exit(result.status ?? 1);
