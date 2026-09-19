import { LoreStatus } from '../generated/prisma/enums.js';
import { roleHasWorldPermission, WORLD_PERMISSIONS } from './world-permissions.js';
import type { AuthorizedWorldMembership, AuthenticatedUser } from './world-authorization.js';

type ResourceScopedToWorld = {
  worldId: string;
};

type AuthoredDraftResource = ResourceScopedToWorld & {
  authorId: string;
  status: typeof LoreStatus.DRAFT | string;
};

type ModerationReportResource = ResourceScopedToWorld & {
  reporterId: string;
  reviewerId?: string | null;
};

export type PolicyDecision =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      statusCode: 403 | 404 | 409;
      error: string;
    };

export type ExistingVoteLookup = {
  appVote: {
    findUnique(args: {
      where: {
        proposalId_voterId: {
          proposalId: string;
          voterId: string;
        };
      };
      select: {
        id: true;
      };
    }): Promise<{ id: string } | null>;
  };
};

export function ensureResourceBelongsToWorld(
  resource: ResourceScopedToWorld | null,
  routeWorldId: string,
): PolicyDecision {
  if (!resource || resource.worldId !== routeWorldId) {
    return {
      allowed: false,
      statusCode: 404,
      error: 'Resource not found in this world.',
    };
  }

  return {
    allowed: true,
  };
}

export function ensureMembershipBelongsToWorld(
  membership: AuthorizedWorldMembership,
  routeWorldId: string,
): PolicyDecision {
  if (membership.worldId !== routeWorldId) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    };
  }

  return {
    allowed: true,
  };
}

export function canEditOwnDraft(args: {
  user: AuthenticatedUser;
  membership: AuthorizedWorldMembership;
  resource: AuthoredDraftResource | null;
  routeWorldId: string;
}): PolicyDecision {
  const membershipDecision = ensureMembershipBelongsToWorld(args.membership, args.routeWorldId);

  if (!membershipDecision.allowed) {
    return membershipDecision;
  }

  const worldDecision = ensureResourceBelongsToWorld(args.resource, args.routeWorldId);

  if (!worldDecision.allowed) {
    return worldDecision;
  }

  const resource = args.resource;
  if (!resource) {
    return {
      allowed: false,
      statusCode: 404,
      error: 'Resource not found in this world.',
    };
  }

  if (resource.status !== LoreStatus.DRAFT) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Only drafts can be edited by this policy.',
    };
  }

  if (resource.authorId !== args.user.id) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Only the draft author can edit this resource.',
    };
  }

  if (!roleHasWorldPermission(args.membership.role, WORLD_PERMISSIONS.EDIT_OWN_DRAFT)) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    };
  }

  return {
    allowed: true,
  };
}

export function canEditAnyDraft(args: {
  membership: AuthorizedWorldMembership;
  resource: AuthoredDraftResource | null;
  routeWorldId: string;
}): PolicyDecision {
  const membershipDecision = ensureMembershipBelongsToWorld(args.membership, args.routeWorldId);

  if (!membershipDecision.allowed) {
    return membershipDecision;
  }

  const worldDecision = ensureResourceBelongsToWorld(args.resource, args.routeWorldId);

  if (!worldDecision.allowed) {
    return worldDecision;
  }

  const resource = args.resource;
  if (!resource) {
    return {
      allowed: false,
      statusCode: 404,
      error: 'Resource not found in this world.',
    };
  }

  if (resource.status !== LoreStatus.DRAFT) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Only drafts can be edited by this policy.',
    };
  }

  if (!roleHasWorldPermission(args.membership.role, WORLD_PERMISSIONS.EDIT_ANY_DRAFT)) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    };
  }

  return {
    allowed: true,
  };
}

export async function canCreateVote(args: {
  user: AuthenticatedUser;
  membership: AuthorizedWorldMembership;
  proposal: ResourceScopedToWorld | null;
  proposalId: string;
  routeWorldId: string;
  database: ExistingVoteLookup;
}): Promise<PolicyDecision> {
  const membershipDecision = ensureMembershipBelongsToWorld(args.membership, args.routeWorldId);

  if (!membershipDecision.allowed) {
    return membershipDecision;
  }

  if (!roleHasWorldPermission(args.membership.role, WORLD_PERMISSIONS.VOTE_ON_PROPOSAL)) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    };
  }

  const worldDecision = ensureResourceBelongsToWorld(args.proposal, args.routeWorldId);

  if (!worldDecision.allowed) {
    return worldDecision;
  }

  const existingVote = await args.database.appVote.findUnique({
    where: {
      proposalId_voterId: {
        proposalId: args.proposalId,
        voterId: args.user.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingVote) {
    return {
      allowed: false,
      statusCode: 409,
      error: 'User has already voted on this proposal.',
    };
  }

  return {
    allowed: true,
  };
}

export function canReviewModerationReport(args: {
  user: AuthenticatedUser;
  membership: AuthorizedWorldMembership;
  report: ModerationReportResource | null;
  routeWorldId: string;
}): PolicyDecision {
  const membershipDecision = ensureMembershipBelongsToWorld(args.membership, args.routeWorldId);

  if (!membershipDecision.allowed) {
    return membershipDecision;
  }

  if (!roleHasWorldPermission(args.membership.role, WORLD_PERMISSIONS.MARK_SPAM_ABUSE)) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Insufficient world permissions.',
    };
  }

  const worldDecision = ensureResourceBelongsToWorld(args.report, args.routeWorldId);

  if (!worldDecision.allowed) {
    return worldDecision;
  }

  const report = args.report;
  if (!report) {
    return {
      allowed: false,
      statusCode: 404,
      error: 'Resource not found in this world.',
    };
  }

  if (report.reporterId === args.user.id) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Users cannot moderate their own reports.',
    };
  }

  return {
    allowed: true,
  };
}
