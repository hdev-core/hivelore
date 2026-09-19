import type { FastifyRequest, preHandlerHookHandler } from 'fastify';

import type { PlatformRole } from '../generated/prisma/enums.js';
import { roleHasWorldPermission } from './world-permissions.js';
import type { WorldPermission, WorldRole } from './world-permissions.js';

export type AuthenticatedUser = {
  id: string;
  hiveUsername: string;
  normalizedHiveUsername: string;
  platformRole: PlatformRole;
};

export type AuthorizedWorldMembership = {
  id: string;
  worldId: string;
  userId: string;
  role: WorldRole;
  revokedAt: Date | null;
};

export type WorldMembershipLookup = {
  worldMembership: {
    findUnique(args: {
      where: {
        worldId_userId: {
          worldId: string;
          userId: string;
        };
        revokedAt: null;
      };
      select: {
        id: true;
        worldId: true;
        userId: true;
        role: true;
        revokedAt: true;
      };
    }): Promise<AuthorizedWorldMembership | null>;
  };
};

export type WorldAuthorizationRequest = {
  user?: AuthenticatedUser;
  worldMembershipCache?: Map<string, AuthorizedWorldMembership | null>;
  worldMembership?: AuthorizedWorldMembership;
};

type WorldAuthorizationReply = {
  code(statusCode: number): {
    send(payload: { error: string }): unknown | Promise<unknown>;
  };
};

type WorldIdResolver = (request: FastifyRequest) => string | null | undefined;

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Trusted server-side identity. This must only be assigned by HiveLore's
     * authentication plugin after verifying the request session/signature.
     * Authorization code must never derive identity or roles from headers,
     * params, query strings, or request bodies supplied by the client.
     */
    user?: AuthenticatedUser;
    worldMembershipCache?: Map<string, AuthorizedWorldMembership | null>;
    worldMembership?: AuthorizedWorldMembership;
  }
}

async function getDefaultDatabase() {
  const { prisma } = await import('./prisma.js');

  return prisma;
}

function getMembershipCache(request: WorldAuthorizationRequest) {
  request.worldMembershipCache ??= new Map<string, AuthorizedWorldMembership | null>();

  return request.worldMembershipCache;
}

export async function requireTrustedAuthenticatedUser(
  request: WorldAuthorizationRequest,
  reply: WorldAuthorizationReply,
) {
  if (!request.user) {
    await reply.code(401).send({
      error: 'Authentication required.',
    });

    return null;
  }

  return request.user;
}

export async function resolveWorldMembership(
  request: WorldAuthorizationRequest,
  worldId: string,
  database?: WorldMembershipLookup,
) {
  const user = request.user;

  if (!user) {
    return null;
  }

  const membershipDatabase = database ?? (await getDefaultDatabase());
  const cache = getMembershipCache(request);

  if (cache.has(worldId)) {
    return cache.get(worldId) ?? null;
  }

  const membership = await membershipDatabase.worldMembership.findUnique({
    where: {
      worldId_userId: {
        worldId,
        userId: user.id,
      },
      revokedAt: null,
    },
    select: {
      id: true,
      worldId: true,
      userId: true,
      role: true,
      revokedAt: true,
    },
  });

  cache.set(worldId, membership);

  return membership;
}

export async function authorizeWorldPermission(
  request: WorldAuthorizationRequest,
  reply: WorldAuthorizationReply,
  worldId: string,
  permission: WorldPermission,
  database?: WorldMembershipLookup,
) {
  const user = await requireTrustedAuthenticatedUser(request, reply);

  if (!user) {
    return false;
  }

  const membership = await resolveWorldMembership(request, worldId, database);

  if (!membership || !roleHasWorldPermission(membership.role, permission)) {
    await reply.code(403).send({
      error: 'Insufficient world permissions.',
    });

    return false;
  }

  request.worldMembership = membership;

  return true;
}

export function requireWorldPermission(
  permission: WorldPermission,
  resolveWorldId: WorldIdResolver,
  database?: WorldMembershipLookup,
): preHandlerHookHandler {
  return async (request, reply) => {
    const worldId = resolveWorldId(request);

    if (!worldId) {
      await reply.code(400).send({
        error: 'World id is required.',
      });

      return;
    }

    await authorizeWorldPermission(request, reply, worldId, permission, database);
  };
}
