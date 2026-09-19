import { ModerationStatus, WorldAuditAction } from '../generated/prisma/enums.js';

type ModerationAuditStatus =
  | typeof ModerationStatus.IN_REVIEW
  | typeof ModerationStatus.RESOLVED
  | typeof ModerationStatus.DISMISSED;

type ModerationAuditMetadata = {
  before: {
    status: ModerationAuditStatus;
    reviewerId?: string | null;
  };
  after: {
    status: ModerationAuditStatus;
    reviewerId?: string | null;
  };
  reason: string;
};

export type CreateModerationAuditLogInput = {
  actorId: string;
  worldId: string;
  targetId: string;
  metadata: ModerationAuditMetadata;
};

export type WorldAuditLogWriter = {
  worldAuditLog: {
    create(args: {
      data: {
        actorId: string;
        worldId: string;
        action: typeof WorldAuditAction.MODERATION_ACTION;
        targetType: 'MODERATION_REPORT';
        targetId: string;
        metadata: ModerationAuditMetadata;
      };
    }): Promise<unknown>;
  };
};

const FORBIDDEN_METADATA_KEYS = [
  'auth',
  'authentication',
  'challenge',
  'cookie',
  'cookies',
  'env',
  'environment',
  'headers',
  'payload',
  'request',
  'secret',
  'signature',
  'token',
] as const;

function assertNonEmptyReason(reason: string) {
  if (!reason.trim()) {
    throw new Error('Audit log reason is required.');
  }
}

function assertNoForbiddenMetadataKeys(value: unknown) {
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    const containsForbiddenKey = FORBIDDEN_METADATA_KEYS.some((forbiddenKey) =>
      normalizedKey.includes(forbiddenKey),
    );

    if (containsForbiddenKey) {
      throw new Error(`Audit metadata key is not allowed: ${key}`);
    }

    assertNoForbiddenMetadataKeys(nestedValue);
  }
}

export function createModerationAuditMetadata(metadata: ModerationAuditMetadata) {
  assertNonEmptyReason(metadata.reason);
  assertNoForbiddenMetadataKeys(metadata);

  return metadata;
}

export async function createModerationAuditLog(
  database: WorldAuditLogWriter,
  input: CreateModerationAuditLogInput,
) {
  return database.worldAuditLog.create({
    data: {
      actorId: input.actorId,
      worldId: input.worldId,
      action: WorldAuditAction.MODERATION_ACTION,
      targetType: 'MODERATION_REPORT',
      targetId: input.targetId,
      metadata: createModerationAuditMetadata(input.metadata),
    },
  });
}
