import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PlatformRole } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from './world-authorization.js';
import {
  hasPlatformPermission,
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
} from './platform-authorization.js';

const user: AuthenticatedUser = {
  id: 'user-1',
  hiveUsername: 'emberquill.dev',
  normalizedHiveUsername: 'emberquill.dev',
  platformRole: PlatformRole.USER,
};

describe('platform authorization', () => {
  test('resolves platform admin status separately from world membership', () => {
    const platformAdmin: AuthenticatedUser = {
      ...user,
      platformRole: PLATFORM_ROLES.ADMIN,
    };

    assert.equal(
      hasPlatformPermission(platformAdmin, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS),
      true,
    );
  });

  test('denies platform permissions to ordinary users', () => {
    assert.equal(hasPlatformPermission(user, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS), false);
  });
});
