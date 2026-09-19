import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ModerationStatus, WorldAuditAction } from '../generated/prisma/enums.js';
import {
  createModerationAuditLog,
  createModerationAuditMetadata,
  type WorldAuditLogWriter,
} from './world-audit-log.js';

describe('world audit log helpers', () => {
  test('creates moderation audit logs with allowlisted metadata shape', async () => {
    const calls: unknown[] = [];
    const database: WorldAuditLogWriter = {
      worldAuditLog: {
        async create(args) {
          calls.push(args);
          return args;
        },
      },
    };

    await createModerationAuditLog(database, {
      actorId: 'moderator-1',
      worldId: 'world-1',
      targetId: 'report-1',
      metadata: {
        before: {
          status: ModerationStatus.IN_REVIEW,
          reviewerId: null,
        },
        after: {
          status: ModerationStatus.RESOLVED,
          reviewerId: 'moderator-1',
        },
        reason: 'Confirmed spam report.',
      },
    });

    assert.deepEqual(calls, [
      {
        data: {
          actorId: 'moderator-1',
          worldId: 'world-1',
          action: WorldAuditAction.MODERATION_ACTION,
          targetType: 'MODERATION_REPORT',
          targetId: 'report-1',
          metadata: {
            before: {
              status: ModerationStatus.IN_REVIEW,
              reviewerId: null,
            },
            after: {
              status: ModerationStatus.RESOLVED,
              reviewerId: 'moderator-1',
            },
            reason: 'Confirmed spam report.',
          },
        },
      },
    ]);
  });

  test('requires a reason for moderation audit metadata', () => {
    assert.throws(
      () =>
        createModerationAuditMetadata({
          before: {
            status: ModerationStatus.IN_REVIEW,
          },
          after: {
            status: ModerationStatus.DISMISSED,
          },
          reason: '   ',
        }),
      /Audit log reason is required/,
    );
  });

  test('rejects forbidden secret-bearing metadata keys', () => {
    assert.throws(
      () =>
        createModerationAuditMetadata({
          before: {
            status: ModerationStatus.IN_REVIEW,
          },
          after: {
            status: ModerationStatus.RESOLVED,
          },
          reason: 'Resolved report.',
          requestPayload: {
            signature: 'do-not-store',
          },
        } as never),
      /Audit metadata key is not allowed: requestPayload/,
    );
  });
});
