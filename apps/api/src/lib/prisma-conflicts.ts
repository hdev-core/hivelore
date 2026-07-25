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
