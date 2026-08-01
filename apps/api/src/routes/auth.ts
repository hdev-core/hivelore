import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import {
  createAuthChallenge,
  consumeAuthChallenge,
  type AuthChallengeDatabase,
} from '../lib/auth-challenges.js';
import { randomToken } from '../lib/auth-crypto.js';
import {
  clearRefreshCookie,
  getRefreshCookieName,
  readCookie,
  setRefreshCookie,
} from '../lib/auth-cookies.js';
import { authenticateRequest, requireSession } from '../lib/auth-middleware.js';
import {
  issueSession,
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
  revokeRefreshToken,
  rotateRefreshSession,
  upsertHiveUser,
} from '../lib/auth-sessions.js';
import {
  DhiveAccountClient,
  DhivePostingSignatureVerifier,
  type HiveSignatureVerifier,
} from '../lib/hive-signature.js';
import { InvalidHiveUsernameError, normalizeHiveUsername } from '../lib/hive-username.js';

const providerSchema = z.enum(['keychain', 'hivesigner']);

const challengeSchema = z.object({
  provider: providerSchema.default('keychain'),
  username: z.string().min(1).max(64).optional(),
  hiveUsername: z.string().min(1).max(64).optional(),
});

const verifySchema = z.object({
  challengeId: z.string().min(1),
  provider: providerSchema,
  username: z.string().min(1).max(64).optional(),
  hiveUsername: z.string().min(1).max(64).optional(),
  message: z.string().min(1),
  signature: z.string().min(1),
  publicKey: z.string().min(1).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
  revokeFamily: z.boolean().optional(),
});

type RegisterAuthRoutesOptions = {
  challengeDatabase?: AuthChallengeDatabase;
  signatureVerifier?: HiveSignatureVerifier;
};

const challengeRateLimits = new Map<string, number[]>();
const verifyRateLimits = new Map<string, number[]>();
const refreshRateLimits = new Map<string, number[]>();

function rateLimit(bucket: Map<string, number[]>, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (bucket.get(key) ?? []).filter((timestamp) => timestamp > now - windowMs);

  if (recent.length >= limit) {
    return false;
  }

  recent.push(now);
  bucket.set(key, recent);

  return true;
}

function clientRateLimitKey(request: FastifyRequest) {
  return request.ip || 'unknown';
}

function isTrustedBrowserOrigin(request: FastifyRequest) {
  const expectedOrigin = env.CORS_ORIGIN;
  const origin = request.headers.origin;

  if (origin) {
    return origin === expectedOrigin;
  }

  const referer = request.headers.referer;

  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function readSubmittedUsername(body: {
  hiveUsername?: string | undefined;
  username?: string | undefined;
}) {
  const username = body.username ?? body.hiveUsername;

  if (!username) {
    throw new InvalidHiveUsernameError();
  }

  return normalizeHiveUsername(username);
}

function cookieOptions() {
  return {
    domain: env.AUTH_COOKIE_DOMAIN,
    secure: env.AUTH_COOKIE_SECURE ?? env.NODE_ENV === 'production',
  };
}

function sessionOptions() {
  return {
    accessTtlSeconds: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
    audience: env.AUTH_JWT_AUDIENCE,
    issuer: env.AUTH_JWT_ISSUER,
    jwtSecret: env.AUTH_JWT_SECRET,
    refreshSecret: env.AUTH_JWT_SECRET,
    refreshTtlSeconds: env.AUTH_REFRESH_TOKEN_TTL_SECONDS,
  };
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: RegisterAuthRoutesOptions = {},
) {
  const database = prisma;
  const challengeDatabase = options.challengeDatabase ?? database;
  const signatureVerifier =
    options.signatureVerifier ??
    new DhivePostingSignatureVerifier(new DhiveAccountClient(env.HIVE_RPC_URL));

  app.post('/auth/challenge', async (request, reply) => {
    if (!rateLimit(challengeRateLimits, clientRateLimitKey(request), 20, 60_000)) {
      return reply.code(429).send({
        error: 'Too many authentication attempts.',
      });
    }

    const parsed = challengeSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid challenge payload.',
      });
    }

    try {
      const normalizedHiveUsername = readSubmittedUsername(parsed.data);
      const challenge = await createAuthChallenge(challengeDatabase, {
        audience: env.HIVE_AUTH_AUDIENCE,
        hmacSecret: env.AUTH_JWT_SECRET,
        nonce: randomToken(32),
        provider: parsed.data.provider,
        ttlSeconds: env.AUTH_CHALLENGE_TTL_SECONDS,
        username: normalizedHiveUsername,
      });

      return {
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt.toISOString(),
        expiresInSeconds: env.AUTH_CHALLENGE_TTL_SECONDS,
        hiveUsername: challenge.username,
        message: challenge.message,
        provider: parsed.data.provider,
      };
    } catch (error) {
      if (error instanceof InvalidHiveUsernameError) {
        return reply.code(400).send({
          error: 'Invalid Hive username.',
        });
      }

      throw error;
    }
  });

  app.post('/auth/verify', async (request, reply) => {
    if (!rateLimit(verifyRateLimits, clientRateLimitKey(request), 30, 60_000)) {
      return reply.code(429).send({
        error: 'Too many authentication attempts.',
      });
    }

    const parsed = verifySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid verification payload.',
      });
    }

    try {
      const normalizedHiveUsername = readSubmittedUsername(parsed.data);
      const isValidSignature = await signatureVerifier.verifyPostingSignature({
        message: parsed.data.message,
        publicKey: parsed.data.publicKey,
        signature: parsed.data.signature,
        username: normalizedHiveUsername,
      });

      if (!isValidSignature) {
        return reply.code(401).send({
          error: 'Authentication failed.',
        });
      }

      const issuedSession = await database.$transaction(async (transaction) => {
        await consumeAuthChallenge(transaction, {
          challengeId: parsed.data.challengeId,
          hmacSecret: env.AUTH_JWT_SECRET,
          message: parsed.data.message,
          provider: parsed.data.provider,
          username: normalizedHiveUsername,
        });

        const user = await upsertHiveUser(transaction, {
          normalizedHiveUsername,
        });

        return issueSession(transaction, {
          ...sessionOptions(),
          ipAddress: request.ip,
          user,
          userAgent: request.headers['user-agent'],
        });
      });

      setRefreshCookie(reply, issuedSession.refreshToken, {
        ...cookieOptions(),
        maxAgeSeconds: env.AUTH_REFRESH_TOKEN_TTL_SECONDS,
      });

      return {
        accessToken: issuedSession.accessToken,
        expiresInSeconds: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
        user: issuedSession.user,
      };
    } catch (error) {
      if (error instanceof InvalidHiveUsernameError) {
        return reply.code(400).send({
          error: 'Invalid Hive username.',
        });
      }

      return reply.code(401).send({
        error: 'Authentication failed.',
      });
    }
  });

  app.post('/auth/refresh', async (request, reply) => {
    if (!rateLimit(refreshRateLimits, clientRateLimitKey(request), 40, 60_000)) {
      return reply.code(429).send({
        error: 'Too many refresh attempts.',
      });
    }

    const parsed = refreshSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid refresh payload.',
      });
    }

    const bodyRefreshToken = parsed.data.refreshToken;
    const cookieRefreshToken = readCookie(request, getRefreshCookieName());
    const refreshToken = bodyRefreshToken ?? cookieRefreshToken;

    if (!refreshToken) {
      return reply.code(401).send({
        error: 'Authentication required.',
      });
    }

    if (!bodyRefreshToken && !isTrustedBrowserOrigin(request)) {
      return reply.code(403).send({
        error: 'Request origin is not allowed.',
      });
    }

    try {
      const issuedSession = await rotateRefreshSession(database, {
        ...sessionOptions(),
        refreshToken,
      });

      setRefreshCookie(reply, issuedSession.refreshToken, {
        ...cookieOptions(),
        maxAgeSeconds: env.AUTH_REFRESH_TOKEN_TTL_SECONDS,
      });

      return {
        accessToken: issuedSession.accessToken,
        expiresInSeconds: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
        user: issuedSession.user,
      };
    } catch (error) {
      clearRefreshCookie(reply, cookieOptions());

      if (error instanceof RefreshTokenReuseError) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      if (error instanceof InvalidRefreshTokenError) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      throw error;
    }
  });

  app.post('/auth/logout', async (request, reply) => {
    const parsed = logoutSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid logout payload.',
      });
    }

    const bodyRefreshToken = parsed.data.refreshToken;
    const cookieRefreshToken = readCookie(request, getRefreshCookieName());
    const refreshToken = bodyRefreshToken ?? cookieRefreshToken;

    if (!bodyRefreshToken && cookieRefreshToken && !isTrustedBrowserOrigin(request)) {
      clearRefreshCookie(reply, cookieOptions());

      return reply.code(403).send({
        error: 'Request origin is not allowed.',
      });
    }

    if (refreshToken) {
      const logoutInput = {
        refreshSecret: env.AUTH_JWT_SECRET,
        refreshToken,
        ...(parsed.data.revokeFamily === undefined
          ? {}
          : {
              revokeFamily: parsed.data.revokeFamily,
            }),
      };

      await revokeRefreshToken(database, {
        ...logoutInput,
      });
    }

    clearRefreshCookie(reply, cookieOptions());

    return {
      ok: true,
    };
  });

  app.get(
    '/me',
    {
      preHandler: requireSession({
        audience: env.AUTH_JWT_AUDIENCE,
        issuer: env.AUTH_JWT_ISSUER,
        jwtSecret: env.AUTH_JWT_SECRET,
      }),
    },
    async (request, reply) => {
      const authenticatedUser = authenticateRequest(request, {
        audience: env.AUTH_JWT_AUDIENCE,
        issuer: env.AUTH_JWT_ISSUER,
        jwtSecret: env.AUTH_JWT_SECRET,
      });

      if (!authenticatedUser) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      const user = await database.user.findUnique({
        where: {
          id: authenticatedUser.id,
        },
        select: {
          avatarUrl: true,
          displayName: true,
          hiveUsername: true,
          id: true,
          normalizedHiveUsername: true,
          platformRole: true,
        },
      });

      if (!user) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      return {
        user,
      };
    },
  );

  if (!env.GOOGLE_AUTH_ENABLED) {
    app.all('/auth/google/*', async (_request, reply) =>
      reply.code(404).send({
        error: 'Google authentication is not enabled.',
      }),
    );
    return;
  }

  app.all('/auth/google/*', async (_request, reply) =>
    reply.code(501).send({
      error:
        'Google authentication is configured but OAuth handling is not implemented in this MVP build.',
    }),
  );
}
