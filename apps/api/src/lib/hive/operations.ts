import type { comment, custom_json } from '@hiveio/wax';
import { z } from 'zod';

import {
  DEFAULT_HIVELORE_APP_ID,
  HIVELORE_CUSTOM_JSON_ID,
  HIVELORE_SCHEMA_VERSION,
} from './constants.js';
import type {
  HiveAuthorityKind,
  HiveLoreCommentKind,
  HiveLoreCustomJsonAction,
  HiveLoreCustomJsonPayload,
  HiveLoreEntityType,
  HiveLoreMetadata,
  HiveLoreOperation,
} from './types.js';

const hiveAccountLabelPattern = /^[a-z][a-z0-9-]{1,14}[a-z0-9]$/;

export const hiveAccountNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(16)
  .toLowerCase()
  .refine(
    (account) => account.split('.').every((label) => hiveAccountLabelPattern.test(label)),
    'Invalid Hive account name.',
  );

export const hivePermlinkSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,253}[a-z0-9])?$/);

const metadataSchema = z.object({
  app: z.string().min(1),
  format: z.literal('markdown'),
  tags: z.array(z.string().min(1)).min(1),
  hivelore: z.object({
    schemaVersion: z.literal(HIVELORE_SCHEMA_VERSION),
    kind: z.enum(['world_seed', 'world_bible', 'canon_lore', 'story_chapter']),
    entityType: z.enum([
      'WORLD_SEED',
      'WORLD_BIBLE_VERSION',
      'LORE_ENTRY',
      'STORY_CHAPTER',
      'CANON_DECISION',
      'LORE_RELATIONSHIP',
      'METADATA',
    ]),
    entityId: z.string().min(1),
    worldId: z.string().min(1).optional(),
    proposalId: z.string().min(1).optional(),
  }),
});

export const hiveLoreCustomJsonPayloadSchema = z.object({
  app: z.string().min(1),
  schemaVersion: z.literal(HIVELORE_SCHEMA_VERSION),
  action: z.enum([
    'canon_approval',
    'lore_relationship',
    'revision_history',
    'beneficiary_metadata',
  ]),
  signer: hiveAccountNameSchema,
  entityType: metadataSchema.shape.hivelore.shape.entityType,
  entityId: z.string().min(1),
  worldId: z.string().min(1).optional(),
  proposalId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()),
});

export interface BuildHiveLoreCommentInput {
  author: string;
  permlink: string;
  title: string;
  body: string;
  kind: HiveLoreCommentKind;
  entityType: HiveLoreEntityType;
  entityId: string;
  worldId?: string;
  proposalId?: string;
  parentAuthor?: string;
  parentPermlink?: string;
  tags?: string[];
  app?: string;
}

export interface BuildHiveLoreCustomJsonInput {
  signer: string;
  action: HiveLoreCustomJsonAction;
  entityType: HiveLoreEntityType;
  entityId: string;
  payload: Record<string, unknown>;
  worldId?: string;
  proposalId?: string;
  authority?: HiveAuthorityKind;
  app?: string;
}

export function buildHiveLoreCommentOperation(input: BuildHiveLoreCommentInput): HiveLoreOperation {
  const author = hiveAccountNameSchema.parse(input.author);
  const parentAuthor = input.parentAuthor ? hiveAccountNameSchema.parse(input.parentAuthor) : '';
  const parentPermlink = hivePermlinkSchema.parse(
    input.parentPermlink ?? input.tags?.[0] ?? 'hivelore',
  );
  const permlink = hivePermlinkSchema.parse(input.permlink);
  const tags = input.tags?.length ? input.tags : ['hivelore', input.kind.replaceAll('_', '-')];

  const metadata: HiveLoreMetadata = metadataSchema.parse({
    app: input.app ?? DEFAULT_HIVELORE_APP_ID,
    format: 'markdown',
    tags,
    hivelore: {
      schemaVersion: HIVELORE_SCHEMA_VERSION,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      worldId: input.worldId,
      proposalId: input.proposalId,
    },
  });

  const op: comment = {
    parent_author: parentAuthor,
    parent_permlink: parentPermlink,
    author,
    permlink,
    title: input.title,
    body: input.body,
    json_metadata: JSON.stringify(metadata),
  };

  return {
    comment_operation: op,
  };
}

export function buildHiveLoreCustomJsonOperation(
  input: BuildHiveLoreCustomJsonInput,
): HiveLoreOperation {
  const signer = hiveAccountNameSchema.parse(input.signer);
  const authority = input.authority ?? 'posting';

  const payload: HiveLoreCustomJsonPayload = hiveLoreCustomJsonPayloadSchema.parse({
    app: input.app ?? DEFAULT_HIVELORE_APP_ID,
    schemaVersion: HIVELORE_SCHEMA_VERSION,
    action: input.action,
    signer,
    entityType: input.entityType,
    entityId: input.entityId,
    worldId: input.worldId,
    proposalId: input.proposalId,
    payload: input.payload,
  });

  const op: custom_json = {
    id: HIVELORE_CUSTOM_JSON_ID,
    json: JSON.stringify(payload),
    required_auths: authority === 'active' ? [signer] : [],
    required_posting_auths: authority === 'posting' ? [signer] : [],
  };

  return {
    custom_json_operation: op,
  };
}

export function parseHiveLoreCommentMetadata(
  operation: HiveLoreOperation,
): HiveLoreMetadata | null {
  const commentOperation = operation.comment_operation;

  if (!commentOperation) {
    return null;
  }

  const parsedJson = safeParseJson(commentOperation.json_metadata);
  const parsedMetadata = metadataSchema.safeParse(parsedJson);

  return parsedMetadata.success ? parsedMetadata.data : null;
}

export function parseHiveLoreCustomJsonPayload(
  operation: HiveLoreOperation,
): HiveLoreCustomJsonPayload | null {
  const customJsonOperation = operation.custom_json_operation;

  if (!customJsonOperation || customJsonOperation.id !== HIVELORE_CUSTOM_JSON_ID) {
    return null;
  }

  const parsedJson = safeParseJson(customJsonOperation.json);
  const parsedPayload = hiveLoreCustomJsonPayloadSchema.safeParse(parsedJson);

  return parsedPayload.success ? parsedPayload.data : null;
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
