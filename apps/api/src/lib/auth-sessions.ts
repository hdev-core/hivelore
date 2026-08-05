import type { PlatformRole as PlatformRoleType } from '../generated/prisma/enums.js';
import type { PrismaClient, RefreshSession, User } from '../generated/prisma/client.js';
import { randomToken, sha256Hmac, signAccessToken } from './auth-crypto.js';

export type SafeUser = {
  id: string;
  hiveUsername: string;
  normalizedHiveUsername: string;
  displayName: string | null;
  avatarUrl: string | null;
  platformRole: PlatformRoleType;
};

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  refreshSessionId: string;
  user: SafeUser;
};

export class RefreshTokenReuseError extends Error {
  constructor() {
    super('Refresh token reuse detected.');
  }
}

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('Invalid refresh token.');
  }
}

function selectSafeUser(user: User): SafeUser {
  return {
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    hiveUsername: user.hiveUsername,
    id: user.id,
    normalizedHiveUsername: user.normalizedHiveUsername,
    platformRole: user.platformRole,
  };
}

function buildAccessToken(
  user: SafeUser,
  refreshSessionId: string,
  options: {
    audience: string;
    issuer: string;
    jwtSecret: string;
    ttlSeconds: number;
  },
) {
  return signAccessToken(
    {
      hiveUsername: user.hiveUsername,
      normalizedHiveUsername: user.normalizedHiveUsername,
      platformRole: user.platformRole,
      sid: refreshSessionId,
      sub: user.id,
    },
    {
      audience: options.audience,
      issuer: options.issuer,
      secret: options.jwtSecret,
      ttlSeconds: options.ttlSeconds,
    },
  );
}

type UserProjectionDatabase = Pick<PrismaClient, 'user'>;
type SessionIssueDatabase = Pick<PrismaClient, 'refreshSession'>;
type SessionRotationDatabase = Pick<PrismaClient, '$transaction' | 'refreshSession'>;
type SessionRevocationDatabase = Pick<PrismaClient, 'refreshSession'>;
export type SessionVerificationDatabase = {
  refreshSession: {
    findUnique(args: {
      where: {
        id: string;
      };
      select: {
        expiresAt: true;
        revokedAt: true;
        userId: true;
      };
    }): Promise<Pick<RefreshSession, 'expiresAt' | 'revokedAt' | 'userId'> | null>;
  };
};

export async function upsertHiveUser(
  database: UserProjectionDatabase,
  input: {
    normalizedHiveUsername: string;
  },
) {
  const user = await database.user.upsert({
    where: {
      normalizedHiveUsername: input.normalizedHiveUsername,
    },
    update: {
      hiveUsername: input.normalizedHiveUsername,
    },
    create: {
      hiveUsername: input.normalizedHiveUsername,
      normalizedHiveUsername: input.normalizedHiveUsername,
    },
  });

  return selectSafeUser(user);
}

export async function issueSession(
  database: SessionIssueDatabase,
  input: {
    audience: string;
    ipAddress?: string | undefined;
    issuer: string;
    jwtSecret: string;
    refreshSecret: string;
    refreshTtlSeconds: number;
    accessTtlSeconds: number;
    user: SafeUser;
    userAgent?: string | undefined;
    now?: Date;
  },
): Promise<IssuedSession> {
  const now = input.now ?? new Date();
  const refreshToken = randomToken(48);
  const sessionData = {
    expiresAt: new Date(now.getTime() + input.refreshTtlSeconds * 1000),
    refreshTokenHash: sha256Hmac(refreshToken, input.refreshSecret),
    sessionFamilyId: randomToken(24),
    userId: input.user.id,
    ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 300) } : {}),
  };
  const refreshSession = await database.refreshSession.create({
    data: sessionData,
  });

  return {
    accessToken: buildAccessToken(input.user, refreshSession.id, {
      audience: input.audience,
      issuer: input.issuer,
      jwtSecret: input.jwtSecret,
      ttlSeconds: input.accessTtlSeconds,
    }),
    refreshSessionId: refreshSession.id,
    refreshToken,
    user: input.user,
  };
}

export async function rotateRefreshSession(
  database: SessionRotationDatabase,
  input: {
    audience: string;
    issuer: string;
    jwtSecret: string;
    refreshSecret: string;
    refreshToken: string;
    refreshTtlSeconds: number;
    accessTtlSeconds: number;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const tokenHash = sha256Hmac(input.refreshToken, input.refreshSecret);

  return database.$transaction(async (transaction) => {
    const session = await transaction.refreshSession.findUnique({
      where: {
        refreshTokenHash: tokenHash,
      },
      include: {
        user: true,
      },
    });

    if (!session) {
      throw new InvalidRefreshTokenError();
    }

    if (session.rotatedAt || session.revokedAt) {
      await revokeSessionFamily(transaction, session.sessionFamilyId, now);
      throw new RefreshTokenReuseError();
    }

    if (session.expiresAt <= now) {
      await transaction.refreshSession.update({
        where: {
          id: session.id,
        },
        data: {
          revokedAt: now,
        },
      });
      throw new InvalidRefreshTokenError();
    }

    const claimed = await transaction.refreshSession.updateMany({
      where: {
        expiresAt: {
          gt: now,
        },
        id: session.id,
        revokedAt: null,
        rotatedAt: null,
      },
      data: {
        lastUsedAt: now,
        revokedAt: now,
        rotatedAt: now,
      },
    });

    if (claimed.count !== 1) {
      await revokeSessionFamily(transaction, session.sessionFamilyId, now);
      throw new RefreshTokenReuseError();
    }

    const refreshToken = randomToken(48);
    const replacement = await transaction.refreshSession.create({
      data: {
        expiresAt: new Date(now.getTime() + input.refreshTtlSeconds * 1000),
        refreshTokenHash: sha256Hmac(refreshToken, input.refreshSecret),
        sessionFamilyId: session.sessionFamilyId,
        userAgent: session.userAgent,
        userId: session.userId,
      },
      include: {
        user: true,
      },
    });

    await transaction.refreshSession.update({
      where: {
        id: session.id,
      },
      data: {
        replacedById: replacement.id,
      },
    });

    const user = selectSafeUser(replacement.user);

    return {
      accessToken: buildAccessToken(user, replacement.id, {
        audience: input.audience,
        issuer: input.issuer,
        jwtSecret: input.jwtSecret,
        ttlSeconds: input.accessTtlSeconds,
      }),
      refreshSessionId: replacement.id,
      refreshToken,
      user,
    };
  });
}

export async function revokeRefreshToken(
  database: SessionRevocationDatabase,
  input: {
    refreshSecret: string;
    refreshToken: string;
    revokeFamily?: boolean;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const session = await database.refreshSession.findUnique({
    where: {
      refreshTokenHash: sha256Hmac(input.refreshToken, input.refreshSecret),
    },
    select: {
      id: true,
      sessionFamilyId: true,
    },
  });

  if (!session) {
    return;
  }

  if (input.revokeFamily) {
    await revokeSessionFamily(database, session.sessionFamilyId, now);
    return;
  }

  await database.refreshSession.update({
    where: {
      id: session.id,
    },
    data: {
      revokedAt: now,
    },
  });
}

async function revokeSessionFamily(
  database: SessionRevocationDatabase,
  sessionFamilyId: string,
  now: Date,
) {
  await database.refreshSession.updateMany({
    where: {
      sessionFamilyId,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
    },
  });
}

export function isRefreshSessionValid(session: Pick<RefreshSession, 'expiresAt' | 'revokedAt'>) {
  return !session.revokedAt && session.expiresAt > new Date();
}

export async function isRefreshSessionActive(
  database: SessionVerificationDatabase,
  input: {
    sessionId: string;
    userId: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const session = await database.refreshSession.findUnique({
    where: {
      id: input.sessionId,
    },
    select: {
      expiresAt: true,
      revokedAt: true,
      userId: true,
    },
  });

  return Boolean(
    session && session.userId === input.userId && !session.revokedAt && session.expiresAt > now,
  );
}
