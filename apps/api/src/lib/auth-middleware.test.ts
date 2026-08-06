import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { FastifyRequest } from 'fastify';

import { PlatformRole } from '../generated/prisma/enums.js';
import { signAccessToken } from './auth-crypto.js';
import { authenticateRequest } from './auth-middleware.js';

const jwtOptions = {
  audience: 'hivelore-web',
  database: {
    refreshSession: {
      async findUnique(args: { where: { id: string }; select: unknown }) {
        if (args.where.id !== 'session-1') {
          return null;
        }

        return {
          expiresAt: new Date('2026-08-01T01:00:00.000Z'),
          revokedAt: null,
          userId: 'user-1',
        };
      },
    },
  },
  issuer: 'hivelore',
  jwtSecret: 'test-secret-that-is-long-enough-for-hmac',
  now: new Date('2026-08-01T00:00:00.000Z'),
};

describe('auth middleware', () => {
  test('decorates request.user from trusted JWT claims including platform role', async () => {
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

    const user = await authenticateRequest(request, jwtOptions);

    assert.equal(user?.id, 'user-1');
    assert.equal(user?.platformRole, PlatformRole.ADMIN);
    assert.equal(request.user?.platformRole, PlatformRole.ADMIN);
  });

  test('rejects missing or malformed bearer tokens', async () => {
    const request = {
      headers: {
        authorization: 'Basic abc',
      },
    } as FastifyRequest;

    assert.equal(await authenticateRequest(request, jwtOptions), null);
    assert.equal(request.user, undefined);
  });

  test('rejects otherwise valid access tokens after session revocation', async () => {
    const token = signAccessToken(
      {
        hiveUsername: 'alice',
        normalizedHiveUsername: 'alice',
        platformRole: PlatformRole.USER,
        sid: 'revoked-session',
        sub: 'user-1',
      },
      {
        audience: jwtOptions.audience,
        issuer: jwtOptions.issuer,
        now: jwtOptions.now,
        secret: jwtOptions.jwtSecret,
        ttlSeconds: 900,
      },
    );
    const request = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as FastifyRequest;

    assert.equal(await authenticateRequest(request, jwtOptions), null);
    assert.equal(request.user, undefined);
  });
});
