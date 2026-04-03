import { type AdminUserDirectoryEntry, type UiPreferences, type UserProfilePayload } from '@quizmind/contracts';

import { type AuthUserRecord } from '../auth/repositories/user.repository';

export function mapUserRecordToDirectoryEntry(user: AuthUserRecord): AdminUserDirectoryEntry {
  return {
    id: user.id,
    email: user.email,
    ...(user.displayName ? { displayName: user.displayName } : {}),
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    suspendedAt: user.suspendedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    systemRoles: user.systemRoleAssignments.map((assignment) => assignment.role),
    workspaces: [],
  };
}

export function mapUserRecordToProfile(user: AuthUserRecord): UserProfilePayload {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    locale: user.locale ?? null,
    timezone: user.timezone ?? null,
    uiPreferences: (user.uiPreferences as UiPreferences | null) ?? null,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
