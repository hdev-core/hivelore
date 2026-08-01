import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseEnv } from './env.js';

describe('API environment validation', () => {
  test('parses false feature flags as false', () => {
    const env = parseEnv({
      AUTH_COOKIE_SECURE: 'false',
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
        }),
      /Google auth is enabled/,
    );

    assert.equal(
      parseEnv({
        GOOGLE_AUTH_ENABLED: 'false',
        NODE_ENV: 'development',
      }).GOOGLE_AUTH_ENABLED,
      false,
    );
  });

  test('rejects the development JWT secret in production', () => {
    assert.throws(
      () =>
        parseEnv({
          NODE_ENV: 'production',
        }),
      /AUTH_JWT_SECRET/,
    );
  });
});
