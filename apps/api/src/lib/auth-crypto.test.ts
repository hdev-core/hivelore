import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { JwtVerificationError, signAccessToken, verifyAccessToken } from './auth-crypto.js';
import { PlatformRole } from '../generated/prisma/enums.js';

const jwtOptions = {
  audience: 'hivelore-web',
  issuer: 'hivelore',
  secret: 'test-secret-that-is-long-enough-for-hmac',
};

describe('access JWTs', () => {
  test('creates and validates necessary claims', () => {
    const token = signAccessToken(
      {
        hiveUsername: 'alice',
        normalizedHiveUsername: 'alice',
        platformRole: PlatformRole.ADMIN,
        sid: 'session-1',
        sub: 'user-1',
      },
      {
        ...jwtOptions,
        now: new Date('2026-08-01T00:00:00.000Z'),
        ttlSeconds: 900,
      },
    );

    const claims = verifyAccessToken(token, {
      ...jwtOptions,
      now: new Date('2026-08-01T00:10:00.000Z'),
    });

    assert.equal(claims.sub, 'user-1');
    assert.equal(claims.sid, 'session-1');
    assert.equal(claims.normalizedHiveUsername, 'alice');
    assert.equal(claims.platformRole, PlatformRole.ADMIN);
  });

  test('rejects expired tokens', () => {
    const token = signAccessToken(
      {
        hiveUsername: 'alice',
        normalizedHiveUsername: 'alice',
        platformRole: PlatformRole.USER,
        sid: 'session-1',
        sub: 'user-1',
      },
      {
        ...jwtOptions,
        now: new Date('2026-08-01T00:00:00.000Z'),
        ttlSeconds: 60,
      },
    );

    assert.throws(
      () =>
        verifyAccessToken(token, {
          ...jwtOptions,
          now: new Date('2026-08-01T00:02:00.000Z'),
        }),
      JwtVerificationError,
    );
  });

  test('rejects invalid issuer and audience', () => {
    const token = signAccessToken(
      {
        hiveUsername: 'alice',
        normalizedHiveUsername: 'alice',
        platformRole: PlatformRole.USER,
        sid: 'session-1',
        sub: 'user-1',
      },
      {
        ...jwtOptions,
        now: new Date('2026-08-01T00:00:00.000Z'),
        ttlSeconds: 900,
      },
    );

    assert.throws(
      () =>
        verifyAccessToken(token, {
          ...jwtOptions,
          audience: 'other-app',
          now: new Date('2026-08-01T00:01:00.000Z'),
        }),
      JwtVerificationError,
    );
  });

  test('rejects malformed token payloads', () => {
    assert.throws(
      () =>
        verifyAccessToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.not-json.signature', {
          ...jwtOptions,
          now: new Date('2026-08-01T00:01:00.000Z'),
        }),
      JwtVerificationError,
    );
  });
});
