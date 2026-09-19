import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AuthProvider } from '../generated/prisma/enums.js';
import {
  AuthChallengeError,
  consumeAuthChallenge,
  createAuthChallenge,
  type AuthChallengeDatabase,
} from './auth-challenges.js';

type ChallengeRecord = {
  id: string;
  normalizedHiveUsername: string;
  provider: AuthProvider;
  challengeHash: string;
  nonceHash: string;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

function createChallengeDatabase() {
  const records = new Map<string, ChallengeRecord>();
  let nextId = 1;

  const database = {
    authChallenge: {
      async create(args: {
        data: Omit<ChallengeRecord, 'id' | 'consumedAt'>;
        select: { id: true; expiresAt: true };
      }) {
        const record: ChallengeRecord = {
          ...args.data,
          consumedAt: null,
          id: `challenge-${nextId}`,
        };
        nextId += 1;
        records.set(record.id, record);

        return {
          expiresAt: record.expiresAt,
          id: record.id,
        };
      },
      async deleteMany(args: { where: { expiresAt: { lt: Date } } }) {
        let count = 0;

        for (const [id, record] of records.entries()) {
          if (record.expiresAt < args.where.expiresAt.lt) {
            records.delete(id);
            count += 1;
          }
        }

        return { count };
      },
      async findUnique(args: {
        where: { id: string };
        select: {
          challengeHash: true;
          consumedAt: true;
          expiresAt: true;
          normalizedHiveUsername: true;
          provider: true;
        };
      }) {
        const record = records.get(args.where.id);

        if (!record) {
          return null;
        }

        return {
          challengeHash: record.challengeHash,
          consumedAt: record.consumedAt,
          expiresAt: record.expiresAt,
          normalizedHiveUsername: record.normalizedHiveUsername,
          provider: record.provider,
        };
      },
      async updateMany(args: {
        where: { id: string; consumedAt: null; expiresAt: { gt: Date } };
        data: { consumedAt: Date };
      }) {
        const record = records.get(args.where.id);

        if (!record || record.consumedAt || record.expiresAt <= args.where.expiresAt.gt) {
          return { count: 0 };
        }

        record.consumedAt = args.data.consumedAt;

        return { count: 1 };
      },
    },
  } as unknown as AuthChallengeDatabase;

  return database;
}

const baseInput = {
  audience: 'hivelore-test',
  hmacSecret: 'test-secret-that-is-long-enough-for-hmac',
  nonce: 'nonce-1',
  provider: 'keychain' as const,
  ttlSeconds: 300,
  username: 'alice',
};

describe('authentication challenges', () => {
  test('creates a deterministic human-readable challenge', async () => {
    const challenge = await createAuthChallenge(createChallengeDatabase(), {
      ...baseInput,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    assert.equal(challenge.challengeId, 'challenge-1');
    assert.equal(challenge.username, 'alice');
    assert.match(challenge.message, /HiveLore Authentication/);
    assert.match(challenge.message, /Username: alice/);
    assert.match(challenge.message, /does not authorize a Hive transaction or transfer/);
  });

  test('consumes a valid challenge once', async () => {
    const database = createChallengeDatabase();
    const challenge = await createAuthChallenge(database, {
      ...baseInput,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    const username = await consumeAuthChallenge(database, {
      challengeId: challenge.challengeId,
      hmacSecret: baseInput.hmacSecret,
      message: challenge.message,
      provider: 'keychain',
      username: 'alice',
      now: new Date('2026-08-01T00:01:00.000Z'),
    });

    assert.equal(username, 'alice');
    await assert.rejects(
      () =>
        consumeAuthChallenge(database, {
          challengeId: challenge.challengeId,
          hmacSecret: baseInput.hmacSecret,
          message: challenge.message,
          provider: 'keychain',
          username: 'alice',
          now: new Date('2026-08-01T00:01:01.000Z'),
        }),
      AuthChallengeError,
    );
  });

  test('rejects expired, mismatched username, mismatched message, and wrong provider', async () => {
    const database = createChallengeDatabase();
    const challenge = await createAuthChallenge(database, {
      ...baseInput,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    await assert.rejects(
      () =>
        consumeAuthChallenge(database, {
          challengeId: challenge.challengeId,
          hmacSecret: baseInput.hmacSecret,
          message: challenge.message,
          provider: 'keychain',
          username: 'alice',
          now: new Date('2026-08-01T00:06:00.000Z'),
        }),
      AuthChallengeError,
    );
    await assert.rejects(
      () =>
        consumeAuthChallenge(database, {
          challengeId: challenge.challengeId,
          hmacSecret: baseInput.hmacSecret,
          message: challenge.message,
          provider: 'keychain',
          username: 'bob',
          now: new Date('2026-08-01T00:01:00.000Z'),
        }),
      AuthChallengeError,
    );
    await assert.rejects(
      () =>
        consumeAuthChallenge(database, {
          challengeId: challenge.challengeId,
          hmacSecret: baseInput.hmacSecret,
          message: `${challenge.message}\nextra`,
          provider: 'keychain',
          username: 'alice',
          now: new Date('2026-08-01T00:01:00.000Z'),
        }),
      AuthChallengeError,
    );
    await assert.rejects(
      () =>
        consumeAuthChallenge(database, {
          challengeId: challenge.challengeId,
          hmacSecret: baseInput.hmacSecret,
          message: challenge.message,
          provider: 'hivesigner',
          username: 'alice',
          now: new Date('2026-08-01T00:01:00.000Z'),
        }),
      AuthChallengeError,
    );
  });
});
