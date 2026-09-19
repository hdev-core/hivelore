import { PlatformRole } from '../generated/prisma/enums.js';
import type { PlatformRole as PlatformRoleType } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from './world-authorization.js';

export const PLATFORM_ROLES = PlatformRole;

export type PlatformRoleValue = PlatformRoleType;

export const PLATFORM_PERMISSIONS = {
  MANAGE_PLATFORM_SETTINGS: 'MANAGE_PLATFORM_SETTINGS',
} as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

export function hasPlatformPermission(user: AuthenticatedUser, permission: PlatformPermission) {
  if (permission === PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS) {
    return user.platformRole === PLATFORM_ROLES.ADMIN;
  }

  return false;
}
