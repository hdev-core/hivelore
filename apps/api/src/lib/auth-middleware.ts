import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { verifyAccessToken } from './auth-crypto.js';
import { isRefreshSessionActive, type SessionVerificationDatabase } from './auth-sessions.js';
import type { AuthenticatedUser } from './world-authorization.js';

export function readBearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

export async function authenticateRequest(
  request: FastifyRequest,
  options: {
    audience: string;
    database: SessionVerificationDatabase;
    issuer: string;
    jwtSecret: string;
    now?: Date;
  },
) {
  const token = readBearerToken(request);

  if (!token) {
    return null;
  }

  try {
    const claims = verifyAccessToken(token, {
      audience: options.audience,
      issuer: options.issuer,
      secret: options.jwtSecret,
      ...(options.now ? { now: options.now } : {}),
    });

    const hasActiveSession = await isRefreshSessionActive(options.database, {
      sessionId: claims.sid,
      userId: claims.sub,
      ...(options.now ? { now: options.now } : {}),
    });

    if (!hasActiveSession) {
      return null;
    }

    const user: AuthenticatedUser = {
      hiveUsername: claims.hiveUsername,
      id: claims.sub,
      normalizedHiveUsername: claims.normalizedHiveUsername,
      platformRole: claims.platformRole,
    };

    request.user = user;

    return user;
  } catch {
    return null;
  }
}

export function requireSession(options: {
  audience: string;
  database: SessionVerificationDatabase;
  issuer: string;
  jwtSecret: string;
}): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await authenticateRequest(request, options);

    if (!user) {
      return reply.code(401).send({
        error: 'Authentication required.',
      });
    }
  };
}
