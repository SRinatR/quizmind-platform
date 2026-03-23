import { type AdminUserDirectoryEntry } from '@quizmind/contracts';

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
    workspaces: user.memberships.map((membership) => ({
      workspaceId: membership.workspaceId,
      workspaceSlug: membership.workspace.slug,
      workspaceName: membership.workspace.name,
      role: membership.role,
    })),
  };
}
