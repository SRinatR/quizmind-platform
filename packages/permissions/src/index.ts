import {
  systemRoles,
  workspaceRoles,
  type AccessContext,
  type AccessDecision,
  type AccessRequirement,
  type ResourceAction,
  type SystemRole,
  type WorkspaceRole,
} from '@quizmind/contracts';

export const permissionRegistry = [
  'users:read',
  'users:update',
  'users:suspend',
  'workspaces:read',
  'workspaces:update',
  'workspace_members:invite',
  'workspace_members:remove',
  'subscriptions:read',
  'subscriptions:update',
  'payments:read',
  'payments:refund',
  'plans:manage',
  'entitlements:read',
  'entitlements:override',
  'feature_flags:read',
  'feature_flags:write',
  'feature_flags:publish',
  'remote_config:read',
  'remote_config:write',
  'remote_config:publish',
  'extension_versions:manage',
  'audit_logs:read',
  'audit_logs:export',
  'support:impersonate',
  'jobs:retry',
] as const satisfies readonly ResourceAction[];

export type Permission = (typeof permissionRegistry)[number];

const systemRolePermissions: Record<SystemRole, Permission[]> = {
  super_admin: [...permissionRegistry],
  platform_admin: permissionRegistry.filter((permission) => permission !== 'support:impersonate'),
  billing_admin: ['subscriptions:read', 'subscriptions:update', 'payments:read', 'payments:refund', 'plans:manage', 'entitlements:read'],
  support_admin: ['users:read', 'workspaces:read', 'subscriptions:read', 'payments:read', 'audit_logs:read', 'support:impersonate'],
  security_admin: ['users:read', 'audit_logs:read', 'audit_logs:export'],
  ops_admin: ['jobs:retry', 'remote_config:read', 'feature_flags:read', 'audit_logs:read'],
  content_admin: ['feature_flags:read'],
};

const workspaceRolePermissions: Record<WorkspaceRole, Permission[]> = {
  workspace_owner: ['workspaces:read', 'workspaces:update', 'workspace_members:invite', 'workspace_members:remove', 'subscriptions:read', 'subscriptions:update', 'payments:read', 'entitlements:read', 'remote_config:read'],
  workspace_admin: ['workspaces:read', 'workspaces:update', 'workspace_members:invite', 'workspace_members:remove', 'subscriptions:read', 'payments:read', 'entitlements:read', 'remote_config:read'],
  workspace_billing_manager: ['subscriptions:read', 'subscriptions:update', 'payments:read', 'entitlements:read'],
  workspace_security_manager: ['audit_logs:read', 'audit_logs:export'],
  workspace_manager: ['workspaces:read', 'remote_config:read', 'entitlements:read'],
  workspace_analyst: ['audit_logs:read', 'payments:read', 'subscriptions:read'],
  workspace_member: ['workspaces:read'],
  workspace_viewer: ['workspaces:read'],
};

export const allSystemRoles = [...systemRoles];
export const allWorkspaceRoles = [...workspaceRoles];

export function resolvePermissions(input: {
  systemRoles?: SystemRole[];
  workspaceRoles?: WorkspaceRole[];
}): Permission[] {
  const granted = new Set<Permission>();

  for (const role of input.systemRoles ?? []) {
    for (const permission of systemRolePermissions[role]) {
      granted.add(permission);
    }
  }

  for (const role of input.workspaceRoles ?? []) {
    for (const permission of workspaceRolePermissions[role]) {
      granted.add(permission);
    }
  }

  return [...granted].sort();
}

export function hasPermission(permissions: Permission[], permission: Permission): boolean {
  return permissions.includes(permission);
}

export function evaluateAccess(context: AccessContext, requirement: AccessRequirement): AccessDecision {
  const reasons: string[] = [];
  const workspaceRoles = requirement.workspaceId
    ? context.workspaceMemberships
        .filter((membership) => membership.workspaceId === requirement.workspaceId)
        .map((membership) => membership.role)
    : [];
  const permissions = resolvePermissions({
    systemRoles: context.systemRoles,
    workspaceRoles,
  });

  if (!hasPermission(permissions, requirement.permission as Permission)) {
    reasons.push(`Missing permission: ${requirement.permission}`);
  }

  if (requirement.requireSystemRole && !context.systemRoles.includes(requirement.requireSystemRole)) {
    reasons.push(`Missing system role: ${requirement.requireSystemRole}`);
  }

  if (requirement.requireWorkspaceRole && !workspaceRoles.includes(requirement.requireWorkspaceRole)) {
    reasons.push(`Missing workspace role: ${requirement.requireWorkspaceRole}`);
  }

  for (const entitlement of requirement.requiredEntitlements ?? []) {
    if (!context.entitlements.includes(entitlement)) {
      reasons.push(`Missing entitlement: ${entitlement}`);
    }
  }

  for (const flag of requirement.requiredFlags ?? []) {
    if (!context.featureFlags.includes(flag)) {
      reasons.push(`Missing feature flag: ${flag}`);
    }
  }

  if (requirement.requireOwnership && requirement.workspaceId) {
    const ownsWorkspace = context.attributes?.workspaceOwnerId === context.userId;
    if (!ownsWorkspace) {
      reasons.push('Ownership check failed.');
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
