import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import { AuthProvider } from '../generated/prisma/enums.js';
import { registerAuthRoutes } from '../routes/auth.js';
import { createPrismaRateLimitStore, extractRateLimitRouteInfo } from './auth-rate-limit-store.js';

function createDatabase() {
  const buckets = new Map<string, { count: number; expiresAt: Date }>();

  return {
    authRateLimitBucket: {
      async deleteMany(args: { where: { expiresAt: { lt: Date } } }) {
        let count = 0;

        for (const [key, bucket] of buckets) {
          if (bucket.expiresAt < args.where.expiresAt.lt) {
            buckets.delete(key);
            count += 1;
          }
        }

        return { count };
      },
      async findUnique(args: { select: { count: true; expiresAt: true }; where: { key: string } }) {
        return buckets.get(args.where.key) ?? null;
      },
    },
    async $queryRaw(_strings: TemplateStringsArray, ...values: unknown[]) {
      const key = values[0] as string;
      const nextExpiresAt = values[1] as Date;
      const now = values[2] as Date;
      const current = buckets.get(key);
      const next =
        !current || current.expiresAt <= now
          ? { count: 1, expiresAt: nextExpiresAt }
          : { count: current.count + 1, expiresAt: current.expiresAt };

      buckets.set(key, next);

      return [next];
    },
    buckets,
  };
}

function increment(store: {
  incr(
    key: string,
    callback: (error: Error | null, result?: unknown) => void,
    timeWindow: number,
  ): void;
}) {
  return new Promise<{ current: number; ttl: number }>((resolve, reject) => {
    store.incr(
      '127.0.0.1',
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result as { current: number; ttl: number });
      },
      60_000,
    );
  });
}

function read(store: {
  read(
    key: string,
    callback: (error: Error | null, result?: unknown) => void,
    timeWindow: number,
  ): void;
}) {
  return new Promise<{ current: number; ttl: number }>((resolve, reject) => {
    store.read(
      '127.0.0.1',
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result as { current: number; ttl: number });
      },
      60_000,
    );
  });
}

describe('Prisma auth rate-limit store', () => {
  test('increments and reads counters from a shared database bucket', async () => {
    const database = createDatabase();
    const Store = createPrismaRateLimitStore(database as never);
    const store = new Store();

    assert.equal((await increment(store)).current, 1);
    assert.equal((await increment(store)).current, 2);
    assert.equal((await read(store)).current, 2);
    assert.equal(database.buckets.size, 1);
  });

  test('scopes counters by route child store', async () => {
    const database = createDatabase();
    const Store = createPrismaRateLimitStore(database as never);
    const store = new Store();
    const challengeStore = store.child({
      method: 'POST',
      path: '/auth/challenge',
      prefix: '',
      url: '/auth/challenge',
    } as never);
    const verifyStore = store.child({
      method: 'POST',
      path: '/auth/verify',
      prefix: '',
      url: '/auth/verify',
    } as never);

    assert.equal((await increment(challengeStore)).current, 1);
    assert.equal((await increment(verifyStore)).current, 1);
    assert.equal(database.buckets.size, 2);
  });

  test('extracts nested Fastify routeInfo from child options', () => {
    assert.deepEqual(
      extractRateLimitRouteInfo({
        max: 40,
        routeInfo: {
          method: 'POST',
          path: '/auth/refresh',
          url: '/auth/refresh',
        },
      } as never),
      {
        method: 'POST',
        path: '/auth/refresh',
        url: '/auth/refresh',
      },
    );
  });

  test('falls back safely when child options contain no route information', () => {
    const routeInfo = extractRateLimitRouteInfo({} as never);

    assert.equal(routeInfo.method, undefined);
    assert.equal(routeInfo.path, undefined);
    assert.equal(routeInfo.url, undefined);
  });

  test('exhausting refresh does not rate-limit challenge', async () => {
    const database = createDatabase();
    const Store = createPrismaRateLimitStore(database as never);
    const app = Fastify();

    await app.register(rateLimit, {
      global: false,
      skipOnError: false,
      store: Store,
    });
    await registerAuthRoutes(app, {
      challengeDatabase: {
        authChallenge: {
          async create(args: {
            data: {
              challengeHash: string;
              expiresAt: Date;
              issuedAt: Date;
              nonceHash: string;
              normalizedHiveUsername: string;
              provider: AuthProvider;
            };
            select: { expiresAt: true; id: true };
          }) {
            return {
              expiresAt: args.data.expiresAt,
              id: 'challenge-1',
            };
          },
          async deleteMany() {
            return { count: 0 };
          },
        },
      } as never,
      signatureVerifier: {
        async verifyPostingSignature() {
          return false;
        },
      },
    });

    let refreshStatus = 0;

    for (let index = 0; index < 41; index += 1) {
      const response = await app.inject({
        method: 'POST',
        payload: {},
        url: '/auth/refresh',
      });
      refreshStatus = response.statusCode;
    }

    const challenge = await app.inject({
      method: 'POST',
      payload: {
        provider: 'keychain',
        username: 'alice',
      },
      url: '/auth/challenge',
    });

    assert.equal(refreshStatus, 429);
    assert.equal(challenge.statusCode, 200, challenge.body);
    assert.equal(challenge.json().hiveUsername, 'alice');
    await app.close();
  });
});
