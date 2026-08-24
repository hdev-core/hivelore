type PrismaKnownRequestErrorLike = {
  code: string;
  meta?: {
    target?: unknown;
  } | null;
};

export type ConflictHttpError = {
  statusCode: 409;
  error: string;
};

function hasDuplicateVoteTarget(target: unknown) {
  return Array.isArray(target) && target.includes('proposalId') && target.includes('voterId');
}

function hasWorldSlugTarget(target: unknown) {
  if (Array.isArray(target)) {
    return target.length === 1 && target.includes('slug');
  }

  return target === 'World_slug_key';
}

export function mapDuplicateVoteConflict(error: unknown): ConflictHttpError | null {
  const knownError = error as PrismaKnownRequestErrorLike;

  if (knownError.code !== 'P2002' || !hasDuplicateVoteTarget(knownError.meta?.target)) {
    return null;
  }

  return {
    statusCode: 409,
    error: 'User has already voted on this proposal.',
  };
}

export function mapWorldSlugConflict(error: unknown): ConflictHttpError | null {
  const knownError = error as PrismaKnownRequestErrorLike;

  if (knownError.code !== 'P2002' || !hasWorldSlugTarget(knownError.meta?.target)) {
    return null;
  }

  return {
    statusCode: 409,
    error: 'World slug is already in use.',
  };
}
