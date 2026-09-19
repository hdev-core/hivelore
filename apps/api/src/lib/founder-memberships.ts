import { WORLD_ROLES } from './world-permissions.js';

type FounderMembershipWorld = {
  id: string;
  founderId: string | null;
  founder: {
    id: string;
  } | null;
};

type FounderMembership = {
  id: string;
  worldId: string;
  userId: string;
  role: string;
  revokedAt: Date | null;
};

export type FounderMembershipBackfillConflict =
  | {
      type: 'MISSING_FOUNDER';
      worldId: string;
      founderId: string | null;
    }
  | {
      type: 'ACTIVE_ROLE_CONFLICT';
      worldId: string;
      founderId: string;
      membershipId: string;
      role: string;
    }
  | {
      type: 'REVOKED_MEMBERSHIP';
      worldId: string;
      founderId: string;
      membershipId: string;
      role: string;
      revokedAt: Date;
    };

export class FounderMembershipBackfillError extends Error {
  constructor(public readonly conflicts: FounderMembershipBackfillConflict[]) {
    super('Founder membership backfill found ambiguous authorization data.');
    this.name = 'FounderMembershipBackfillError';
  }
}

export type FounderMembershipBackfillDatabase = {
  world: {
    findMany(args: {
      select: {
        id: true;
        founderId: true;
        founder: {
          select: {
            id: true;
          };
        };
      };
    }): Promise<FounderMembershipWorld[]>;
    create(args: {
      data: {
        slug: string;
        title: string;
        description: string;
        founderId: string;
      };
    }): Promise<{ id: string; founderId: string }>;
  };
  worldMembership: {
    findUnique(args: {
      where: {
        worldId_userId: {
          worldId: string;
          userId: string;
        };
      };
      select: {
        id: true;
        worldId: true;
        userId: true;
        role: true;
        revokedAt: true;
      };
    }): Promise<FounderMembership | null>;
    create(args: {
      data: {
        worldId: string;
        userId: string;
        role: typeof WORLD_ROLES.FOUNDER;
        grantedById: string;
      };
    }): Promise<FounderMembership>;
  };
  $transaction<T>(
    callback: (transaction: FounderMembershipBackfillDatabase) => Promise<T>,
  ): Promise<T>;
};

export type FounderMembershipBackfillResult = {
  created: Array<{ worldId: string; userId: string }>;
  unchanged: Array<{ worldId: string; userId: string; membershipId: string }>;
};

export type ActiveFounderMembershipDatabase = {
  worldMembership: {
    upsert(args: {
      where: {
        worldId_userId: {
          worldId: string;
          userId: string;
        };
      };
      update: {
        role: typeof WORLD_ROLES.FOUNDER;
        grantedById: string;
        revokedAt: null;
      };
      create: {
        worldId: string;
        userId: string;
        role: typeof WORLD_ROLES.FOUNDER;
        grantedById: string;
      };
    }): Promise<unknown>;
  };
};

export function ensureActiveFounderMembership(
  database: ActiveFounderMembershipDatabase,
  membership: { worldId: string; userId: string },
) {
  // Intended for disposable development seed data. It normalizes the fixture owner
  // back to an active FOUNDER membership on every seed run.
  return database.worldMembership.upsert({
    where: {
      worldId_userId: membership,
    },
    update: {
      role: WORLD_ROLES.FOUNDER,
      grantedById: membership.userId,
      revokedAt: null,
    },
    create: {
      ...membership,
      role: WORLD_ROLES.FOUNDER,
      grantedById: membership.userId,
    },
  });
}

export async function backfillFounderMemberships(
  database: FounderMembershipBackfillDatabase,
): Promise<FounderMembershipBackfillResult> {
  const worlds = await database.world.findMany({
    select: {
      id: true,
      founderId: true,
      founder: {
        select: {
          id: true,
        },
      },
    },
  });
  const conflicts: FounderMembershipBackfillConflict[] = [];
  const toCreate: Array<{ worldId: string; userId: string }> = [];
  const unchanged: FounderMembershipBackfillResult['unchanged'] = [];

  for (const world of worlds) {
    if (!world.founderId || !world.founder) {
      conflicts.push({
        type: 'MISSING_FOUNDER',
        worldId: world.id,
        founderId: world.founderId,
      });
      continue;
    }

    const membership = await database.worldMembership.findUnique({
      where: {
        worldId_userId: {
          worldId: world.id,
          userId: world.founderId,
        },
      },
      select: {
        id: true,
        worldId: true,
        userId: true,
        role: true,
        revokedAt: true,
      },
    });

    if (!membership) {
      toCreate.push({
        worldId: world.id,
        userId: world.founderId,
      });
      continue;
    }

    if (membership.revokedAt) {
      conflicts.push({
        type: 'REVOKED_MEMBERSHIP',
        worldId: world.id,
        founderId: world.founderId,
        membershipId: membership.id,
        role: membership.role,
        revokedAt: membership.revokedAt,
      });
      continue;
    }

    if (membership.role !== WORLD_ROLES.FOUNDER) {
      conflicts.push({
        type: 'ACTIVE_ROLE_CONFLICT',
        worldId: world.id,
        founderId: world.founderId,
        membershipId: membership.id,
        role: membership.role,
      });
      continue;
    }

    unchanged.push({
      worldId: world.id,
      userId: world.founderId,
      membershipId: membership.id,
    });
  }

  if (conflicts.length > 0) {
    throw new FounderMembershipBackfillError(conflicts);
  }

  const created: FounderMembershipBackfillResult['created'] = [];

  for (const membership of toCreate) {
    await database.worldMembership.create({
      data: {
        ...membership,
        role: WORLD_ROLES.FOUNDER,
        grantedById: membership.userId,
      },
    });
    created.push(membership);
  }

  return {
    created,
    unchanged,
  };
}

export async function createWorldWithFounderMembership(
  database: FounderMembershipBackfillDatabase,
  data: {
    slug: string;
    title: string;
    description: string;
    founderId: string;
  },
) {
  return database.$transaction(async (transaction) => {
    const world = await transaction.world.create({
      data,
    });

    await transaction.worldMembership.create({
      data: {
        worldId: world.id,
        userId: data.founderId,
        role: WORLD_ROLES.FOUNDER,
        grantedById: data.founderId,
      },
    });

    return world;
  });
}
