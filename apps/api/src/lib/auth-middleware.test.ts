import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { FastifyRequest } from 'fastify';

import { PlatformRole } from '../generated/prisma/enums.js';
import { signAccessToken } from './auth-crypto.js';
import { authenticateRequest } from './auth-middleware.js';

const jwtOptions = {
  audience: 'hivelore-web',
  issuer: 'hivelore',
  jwtSecret: 'test-secret-that-is-long-enough-for-hmac',
};

describe('auth middleware', () => {
  test('decorates request.user from trusted JWT claims including platform role', () => {
    const token = signAccessToken(
      {
        hiveUsername: 'alice',
        normalizedHiveUsername: 'alice',
        platformRole: PlatformRole.ADMIN,
        sid: 'session-1',
        sub: 'user-1',
      },
      {
        audience: jwtOptions.audience,
        issuer: jwtOptions.issuer,
        secret: jwtOptions.jwtSecret,
        ttlSeconds: 900,
      },
    );
    const request = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as FastifyRequest;

    const user = authenticateRequest(request, jwtOptions);

    assert.equal(user?.id, 'user-1');
    assert.equal(user?.platformRole, PlatformRole.ADMIN);
    assert.equal(request.user?.platformRole, PlatformRole.ADMIN);
  });

  test('rejects missing or malformed bearer tokens', () => {
    const request = {
      headers: {
        authorization: 'Basic abc',
      },
    } as FastifyRequest;

    assert.equal(authenticateRequest(request, jwtOptions), null);
    assert.equal(request.user, undefined);
  });
});
