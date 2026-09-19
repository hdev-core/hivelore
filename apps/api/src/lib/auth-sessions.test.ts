import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PlatformRole } from '../generated/prisma/enums.js';
import type { PrismaClient, RefreshSession, User } from '../generated/prisma/client.js';
import { sha256Hmac, verifyAccessToken } from './auth-crypto.js';
import {
  issueSession,
  RefreshTokenReuseError,
  revokeRefreshToken,
  rotateRefreshSession,
  type SafeUser,
} from './auth-sessions.js';

const user: User = {
  avatarUrl: null,
  bio: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  displayName: null,
  hiveUsername: 'alice',
  id: 'user-1',
  normalizedHiveUsername: 'alice',
  platformRole: PlatformRole.USER,
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

const safeUser: SafeUser = {
  avatarUrl: null,
  displayName: null,
  hiveUsername: 'alice',
  id: 'user-1',
  normalizedHiveUsername: 'alice',
  platformRole: PlatformRole.USER,
};

const sessionOptions = {
  accessTtlSeconds: 900,
  audience: 'hivelore-web',
  issuer: 'hivelore',
  jwtSecret: 'test-secret-that-is-long-enough-for-hmac',
  refreshSecret: 'test-secret-that-is-long-enough-for-hmac',
  refreshTtlSeconds: 60 * 60,
};

type StoredRefreshSession = RefreshSession & {
  user: User;
};

function createDatabase() {
  const sessions = new Map<string, StoredRefreshSession>();
  let nextId = 1;

  const database = {
    refreshSession: {
      async create(args: {
        data: {
          expiresAt: Date;
          refreshTokenHash: string;
          sessionFamilyId: string;
          userId: string;
          userAgent?: string;
          ipAddress?: string;
        };
        include?: { user: true };
      }) {
        const session: StoredRefreshSession = {
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          expiresAt: args.data.expiresAt,
          id: `session-${nextId}`,
          ipAddress: args.data.ipAddress ?? null,
          lastUsedAt: null,
          refreshTokenHash: args.data.refreshTokenHash,
          replacedById: null,
          revokedAt: null,
          rotatedAt: null,
          sessionFamilyId: args.data.sessionFamilyId,
          user,
          userAgent: args.data.userAgent ?? null,
          userId: args.data.userId,
        };
        nextId += 1;
        sessions.set(session.id, session);

        return args.include?.user ? session : (session as RefreshSession);
      },
      async findUnique(args: {
        where: { refreshTokenHash?: string; id?: string };
        include?: { user: true };
        select?: {
          expiresAt?: true;
          id?: true;
          revokedAt?: true;
          sessionFamilyId?: true;
          userId?: true;
        };
      }) {
        const session = [...sessions.values()].find((candidate) => {
          if (args.where.refreshTokenHash) {
            return candidate.refreshTokenHash === args.where.refreshTokenHash;
          }

          return candidate.id === args.where.id;
        });

        if (!session) {
          return null;
        }

        if (args.select) {
          return {
            ...(args.select.expiresAt ? { expiresAt: session.expiresAt } : {}),
            ...(args.select.id ? { id: session.id } : {}),
            ...(args.select.revokedAt ? { revokedAt: session.revokedAt } : {}),
            ...(args.select.sessionFamilyId ? { sessionFamilyId: session.sessionFamilyId } : {}),
            ...(args.select.userId ? { userId: session.userId } : {}),
          };
        }

        return args.include?.user ? session : (session as RefreshSession);
      },
      async update(args: {
        where: { id: string };
        data: Partial<
          Pick<RefreshSession, 'lastUsedAt' | 'replacedById' | 'revokedAt' | 'rotatedAt'>
        >;
      }) {
        const session = sessions.get(args.where.id);

        if (!session) {
          throw new Error('Missing session.');
        }

        Object.assign(session, args.data);

        return session;
      },
      async updateMany(args: {
        where:
          | { sessionFamilyId: string; revokedAt: null }
          | {
              expiresAt: { gt: Date };
              id: string;
              revokedAt: null;
              rotatedAt: null;
            };
        data: Partial<
          Pick<RefreshSession, 'lastUsedAt' | 'replacedById' | 'revokedAt' | 'rotatedAt'>
        >;
      }) {
        let count = 0;

        for (const session of sessions.values()) {
          if ('sessionFamilyId' in args.where) {
            if (session.sessionFamilyId !== args.where.sessionFamilyId || session.revokedAt) {
              continue;
            }

            Object.assign(session, args.data);
            count += 1;
            continue;
          }

          if (
            session.id === args.where.id &&
            !session.revokedAt &&
            !session.rotatedAt &&
            session.expiresAt > args.where.expiresAt.gt
          ) {
            Object.assign(session, args.data);
            count += 1;
          }
        }

        return { count };
      },
    },
    async $transaction<T>(callback: (transaction: PrismaClient) => Promise<T>) {
      return callback(database as unknown as PrismaClient);
    },
    sessions,
  };

  return database as unknown as PrismaClient & { sessions: Map<string, StoredRefreshSession> };
}

describe('refresh sessions', () => {
  test('issues access and refresh credentials', async () => {
    const database = createDatabase();
    const issued = await issueSession(database, {
      ...sessionOptions,
      now: new Date('2026-08-01T00:00:00.000Z'),
      user: safeUser,
    });

    const claims = verifyAccessToken(issued.accessToken, {
      audience: sessionOptions.audience,
      issuer: sessionOptions.issuer,
      now: new Date('2026-08-01T00:01:00.000Z'),
      secret: sessionOptions.jwtSecret,
    });

    assert.equal(claims.sub, user.id);
    assert.equal(database.sessions.size, 1);
    assert.equal(
      [...database.sessions.values()][0]?.refreshTokenHash,
      sha256Hmac(issued.refreshToken, sessionOptions.refreshSecret),
    );
  });

  test('rotates refresh tokens and rejects reuse by revoking the family', async () => {
    const database = createDatabase();
    const issued = await issueSession(database, {
      ...sessionOptions,
      now: new Date('2026-08-01T00:00:00.000Z'),
      user: safeUser,
    });
    const rotated = await rotateRefreshSession(database, {
      ...sessionOptions,
      now: new Date('2026-08-01T00:05:00.000Z'),
      refreshToken: issued.refreshToken,
    });

    assert.notEqual(rotated.refreshToken, issued.refreshToken);
    assert.equal(database.sessions.size, 2);

    await assert.rejects(
      () =>
        rotateRefreshSession(database, {
          ...sessionOptions,
          now: new Date('2026-08-01T00:06:00.000Z'),
          refreshToken: issued.refreshToken,
        }),
      RefreshTokenReuseError,
    );

    assert.equal(
      [...database.sessions.values()].every((session) => session.revokedAt),
      true,
    );
  });

  test('logout revocation is idempotent', async () => {
    const database = createDatabase();
    const issued = await issueSession(database, {
      ...sessionOptions,
      now: new Date('2026-08-01T00:00:00.000Z'),
      user: safeUser,
    });

    await revokeRefreshToken(database, {
      refreshSecret: sessionOptions.refreshSecret,
      refreshToken: issued.refreshToken,
    });
    await revokeRefreshToken(database, {
      refreshSecret: sessionOptions.refreshSecret,
      refreshToken: issued.refreshToken,
    });

    assert.equal([...database.sessions.values()][0]?.revokedAt instanceof Date, true);
  });
});
