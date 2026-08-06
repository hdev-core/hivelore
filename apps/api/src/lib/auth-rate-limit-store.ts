import type { PrismaClient } from '../generated/prisma/client.js';

type RateLimitBucketDatabase = Pick<
  PrismaClient,
  '$executeRaw' | '$queryRaw' | 'authRateLimitBucket'
>;

type RateLimitResult = {
  current: number;
  ttl: number;
};

type RateLimitCallback = (error: Error | null, result?: RateLimitResult) => void;

type RateLimitStoreOptions = {
  nameSpace?: string | undefined;
  routeInfo?: RateLimitRouteInfo | undefined;
};

type RateLimitRouteInfo = {
  method?: unknown;
  path?: string | undefined;
  url?: string | undefined;
};

type RateLimitRow = {
  count: number;
  expiresAt: Date;
};

type RateLimitStore = {
  child(routeOptions: RateLimitRouteInfo): RateLimitStore;
  incr(key: string, callback: RateLimitCallback, timeWindow: number): void;
  read(key: string, callback: RateLimitCallback, timeWindow: number): void;
};

type RateLimitStoreConstructor = new (options?: RateLimitStoreOptions) => RateLimitStore;

const DEFAULT_NAMESPACE = 'hivelore-auth-rate-limit';
const CLEANUP_INTERVAL_INCREMENTS = 100;

function routeScope(routeInfo: RateLimitStoreOptions['routeInfo']) {
  if (!routeInfo) {
    return 'global';
  }

  return `${String(routeInfo.method ?? 'ANY')}:${routeInfo.path ?? routeInfo.url ?? 'unknown'}`;
}

function buildBucketKey(options: RateLimitStoreOptions, key: string) {
  const namespace = options.nameSpace ?? DEFAULT_NAMESPACE;

  return `${namespace}:${routeScope(options.routeInfo)}:${key}`;
}

export function createPrismaRateLimitStore(
  database: RateLimitBucketDatabase,
): RateLimitStoreConstructor {
  return class PrismaRateLimitStore {
    cleanupCounter = 0;

    constructor(readonly options: RateLimitStoreOptions = {}) {}

    incr(key: string, callback: RateLimitCallback, timeWindow: number) {
      void this.increment(key, timeWindow).then(
        (result) => callback(null, result),
        (error: unknown) => callback(error instanceof Error ? error : new Error(String(error))),
      );
    }

    read(key: string, callback: RateLimitCallback, timeWindow: number) {
      void this.get(key, timeWindow).then(
        (result) => callback(null, result),
        (error: unknown) => callback(error instanceof Error ? error : new Error(String(error))),
      );
    }

    child(routeOptions: RateLimitRouteInfo) {
      return new PrismaRateLimitStore({
        ...this.options,
        routeInfo: routeOptions,
      });
    }

    async increment(key: string, timeWindow: number) {
      const now = new Date();
      const nextExpiresAt = new Date(now.getTime() + timeWindow);
      const bucketKey = buildBucketKey(this.options, key);

      await this.maybeDeleteExpiredBuckets(now);

      const rows = await database.$queryRaw<RateLimitRow[]>`
        INSERT INTO "AuthRateLimitBucket" ("key", "count", "expiresAt", "updatedAt")
        VALUES (${bucketKey}, 1, ${nextExpiresAt}, ${now})
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE
            WHEN "AuthRateLimitBucket"."expiresAt" <= ${now} THEN 1
            ELSE "AuthRateLimitBucket"."count" + 1
          END,
          "expiresAt" = CASE
            WHEN "AuthRateLimitBucket"."expiresAt" <= ${now} THEN ${nextExpiresAt}
            ELSE "AuthRateLimitBucket"."expiresAt"
          END,
          "updatedAt" = ${now}
        RETURNING "count", "expiresAt"
      `;
      const row = rows[0];

      if (!row) {
        throw new Error('Rate limit bucket update did not return a row.');
      }

      return toRateLimitResult(row, now);
    }

    async get(key: string, timeWindow: number) {
      const now = new Date();
      const bucket = await database.authRateLimitBucket.findUnique({
        where: {
          key: buildBucketKey(this.options, key),
        },
        select: {
          count: true,
          expiresAt: true,
        },
      });

      if (!bucket || bucket.expiresAt <= now) {
        return {
          current: 0,
          ttl: timeWindow,
        };
      }

      return toRateLimitResult(bucket, now);
    }

    async maybeDeleteExpiredBuckets(now: Date) {
      this.cleanupCounter += 1;

      if (this.cleanupCounter % CLEANUP_INTERVAL_INCREMENTS !== 0) {
        return;
      }

      await database.authRateLimitBucket.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });
    }
  };
}

function toRateLimitResult(row: Pick<RateLimitRow, 'count' | 'expiresAt'>, now: Date) {
  return {
    current: row.count,
    ttl: Math.max(0, row.expiresAt.getTime() - now.getTime()),
  };
}
