import { type AccessContext, type SystemRole, type WorkspaceMembership } from '@quizmind/contracts';
import { resolvePermissions, type Permission } from '@quizmind/permissions';

export interface SessionPrincipal {
  userId: string;
  email: string;
  systemRoles: SystemRole[];
  workspaceMemberships: WorkspaceMembership[];
  entitlements: string[];
  featureFlags: string[];
}

export function buildAccessContext(principal: SessionPrincipal): AccessContext {
  return {
    userId: principal.userId,
    systemRoles: principal.systemRoles,
    workspaceMemberships: principal.workspaceMemberships,
    entitlements: principal.entitlements,
    featureFlags: principal.featureFlags,
  };
}

export function getPrincipalPermissions(principal: SessionPrincipal, workspaceId?: string): Permission[] {
  const workspaceRoles = workspaceId
    ? principal.workspaceMemberships.filter((membership) => membership.workspaceId === workspaceId).map((membership) => membership.role)
    : [];

  return resolvePermissions({
    systemRoles: principal.systemRoles,
    workspaceRoles,
  });
}
