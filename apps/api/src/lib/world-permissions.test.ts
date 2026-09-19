import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { WORLD_PERMISSIONS, WORLD_ROLE_PERMISSIONS, WORLD_ROLES } from './world-permissions.js';
import type { WorldPermission, WorldRole } from './world-permissions.js';

const sortPermissions = (permissions: readonly WorldPermission[]) => [...permissions].sort();

const EXPECTED_ROLE_PERMISSIONS = {
  [WORLD_ROLES.READER]: [
    WORLD_PERMISSIONS.VIEW_PUBLIC_WORLD,
    WORLD_PERMISSIONS.VOTE_ON_PROPOSAL,
    WORLD_PERMISSIONS.REPORT_SPAM_ABUSE,
  ],
  [WORLD_ROLES.CONTRIBUTOR]: [
    WORLD_PERMISSIONS.VIEW_PUBLIC_WORLD,
    WORLD_PERMISSIONS.CREATE_LORE_DRAFT,
    WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
    WORLD_PERMISSIONS.EDIT_OWN_DRAFT,
    WORLD_PERMISSIONS.VOTE_ON_PROPOSAL,
    WORLD_PERMISSIONS.REPORT_SPAM_ABUSE,
  ],
  [WORLD_ROLES.FOUNDER]: [
    WORLD_PERMISSIONS.VIEW_PUBLIC_WORLD,
    WORLD_PERMISSIONS.CREATE_LORE_DRAFT,
    WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
    WORLD_PERMISSIONS.CREATE_WORLD,
    WORLD_PERMISSIONS.EDIT_OWN_DRAFT,
    WORLD_PERMISSIONS.EDIT_INITIAL_CANON,
    WORLD_PERMISSIONS.VOTE_ON_PROPOSAL,
    WORLD_PERMISSIONS.EXECUTE_CANON_STATUS_AFTER_THRESHOLD,
    WORLD_PERMISSIONS.REPORT_SPAM_ABUSE,
    WORLD_PERMISSIONS.COMMENT_ON_AI_WARNING,
  ],
  [WORLD_ROLES.CURATOR]: [
    WORLD_PERMISSIONS.VIEW_PUBLIC_WORLD,
    WORLD_PERMISSIONS.CREATE_LORE_DRAFT,
    WORLD_PERMISSIONS.SUBMIT_PROPOSAL,
    WORLD_PERMISSIONS.EDIT_OWN_DRAFT,
    WORLD_PERMISSIONS.EDIT_ANY_DRAFT,
    WORLD_PERMISSIONS.EDIT_CANON_MODERATION_FIX,
    WORLD_PERMISSIONS.VOTE_ON_PROPOSAL,
    WORLD_PERMISSIONS.EXECUTE_CANON_STATUS_AFTER_THRESHOLD,
    WORLD_PERMISSIONS.REPORT_SPAM_ABUSE,
    WORLD_PERMISSIONS.MARK_SPAM_ABUSE,
    WORLD_PERMISSIONS.RESOLVE_AI_WARNING_QUEUE,
  ],
} as const satisfies Record<WorldRole, readonly WorldPermission[]>;

describe('WORLD_ROLE_PERMISSIONS', () => {
  test('uses generated Prisma roles as the complete role source', () => {
    assert.deepEqual(Object.values(WORLD_ROLES), ['READER', 'CONTRIBUTOR', 'FOUNDER', 'CURATOR']);
  });

  test('does not include admin as a world membership role', () => {
    assert.equal(Object.values(WORLD_ROLES).includes('ADMIN' as WorldRole), false);
    assert.equal('ADMIN' in WORLD_ROLES, false);
  });

  test('defines exact permissions for every Prisma role', () => {
    assert.deepEqual(Object.keys(WORLD_ROLE_PERMISSIONS).sort(), Object.values(WORLD_ROLES).sort());

    for (const role of Object.values(WORLD_ROLES)) {
      assert.deepEqual(
        sortPermissions(WORLD_ROLE_PERMISSIONS[role]),
        sortPermissions(EXPECTED_ROLE_PERMISSIONS[role]),
      );
    }
  });
});
