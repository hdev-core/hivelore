import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

process.env.NODE_ENV = 'test';

const { parseEnv } = await import('./env.js');

describe('API environment validation', () => {
  test('parses false feature flags as false', () => {
    const env = parseEnv({
      AUTH_COOKIE_SECURE: 'false',
      AUTH_JWT_SECRET: 'test-jwt-secret-that-is-long-enough',
      AUTH_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough',
      GOOGLE_AUTH_ENABLED: 'false',
      GOOGLE_HIVE_PROVISIONING_ENABLED: 'false',
      HIVE_RC_DELEGATION_ENABLED: 'false',
      NODE_ENV: 'development',
    });

    assert.equal(env.AUTH_COOKIE_SECURE, false);
    assert.equal(env.GOOGLE_AUTH_ENABLED, false);
    assert.equal(env.GOOGLE_HIVE_PROVISIONING_ENABLED, false);
    assert.equal(env.HIVE_RC_DELEGATION_ENABLED, false);
  });

  test('rejects missing Google credentials only when Google auth is enabled', () => {
    assert.throws(
      () =>
        parseEnv({
          GOOGLE_AUTH_ENABLED: 'true',
          NODE_ENV: 'development',
          AUTH_JWT_SECRET: 'test-jwt-secret-that-is-long-enough',
          AUTH_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough',
        }),
      /Google auth is enabled/,
    );

    assert.equal(
      parseEnv({
        AUTH_JWT_SECRET: 'test-jwt-secret-that-is-long-enough',
        AUTH_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough',
        GOOGLE_AUTH_ENABLED: 'false',
        NODE_ENV: 'development',
      }).GOOGLE_AUTH_ENABLED,
      false,
    );
  });

  test('rejects missing auth secrets in every non-test environment', () => {
    assert.throws(
      () =>
        parseEnv({
          NODE_ENV: 'development',
        }),
      /AUTH_JWT_SECRET/,
    );
  });

  test('allows missing auth secrets only in test', () => {
    const env = parseEnv({
      NODE_ENV: 'test',
    });

    assert.match(env.AUTH_JWT_SECRET, /test-only/);
    assert.match(env.AUTH_REFRESH_SECRET, /test-only/);
  });

  test('parses mainnet Hive config and bounded broadcast defaults', () => {
    const env = parseEnv({
      NODE_ENV: 'test',
    });

    assert.equal(
      env.HIVE_MAINNET_CHAIN_ID,
      'beeab0de00000000000000000000000000000000000000000000000000000000',
    );
    assert.equal(env.HIVE_BROADCAST_MAX_ATTEMPTS, 4);
    assert.equal(env.HIVE_BROADCAST_TOTAL_DEADLINE_MS, 90_000);
    assert.equal(env.HIVE_CONFIRMATION_TIMEOUT_MS, 60_000);
  });

  test('parses bounded proposal comment write rate-limit defaults', () => {
    const env = parseEnv({
      NODE_ENV: 'test',
    });

    assert.equal(env.PROPOSAL_COMMENT_WRITE_RATE_LIMIT_CACHE, 10_000);
    assert.equal(env.PROPOSAL_COMMENT_WRITE_RATE_LIMIT_MAX, 5);
    assert.equal(env.PROPOSAL_COMMENT_WRITE_RATE_LIMIT_WINDOW_SECONDS, 60);
  });

  test('rejects invalid Hive network configuration', () => {
    assert.throws(
      () =>
        parseEnv({
          HIVE_MAINNET_CHAIN_ID: 'not-a-chain-id',
          NODE_ENV: 'test',
        }),
      /HIVE_MAINNET_CHAIN_ID/,
    );

    assert.throws(
      () =>
        parseEnv({
          NODE_ENV: 'test',
          PROPOSAL_COMMENT_WRITE_RATE_LIMIT_MAX: '0',
        }),
      /PROPOSAL_COMMENT_WRITE_RATE_LIMIT_MAX/,
    );
  });
});
