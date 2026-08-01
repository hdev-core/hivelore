import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { verifyAccessToken } from './auth-crypto.js';
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

export function authenticateRequest(
  request: FastifyRequest,
  options: {
    audience: string;
    issuer: string;
    jwtSecret: string;
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
    });
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
  issuer: string;
  jwtSecret: string;
}): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = authenticateRequest(request, options);

    if (!user) {
      await reply.code(401).send({
        error: 'Authentication required.',
      });
    }
  };
}
