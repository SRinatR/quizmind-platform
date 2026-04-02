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
  'installations:read',
  'installations:write',
  'workspace_members:invite',
  'workspace_members:remove',
  'subscriptions:read',
  'subscriptions:update',
  'payments:read',
  'payments:refund',
  'plans:manage',
  'billing_providers:manage',
  'ai_providers:manage',
  'entitlements:read',
  'entitlements:override',
  'credentials:read',
  'credentials:write',
  'credentials:rotate',
  'feature_flags:read',
  'feature_flags:write',
  'feature_flags:publish',
  'flags:simulate',
  'remote_config:read',
  'remote_config:write',
  'remote_config:publish',
  'config:simulate',
  'extension_versions:manage',
  'compatibility_rules:manage',
  'audit_logs:read',
  'audit_logs:export',
  'support:impersonate',
  'impersonation:end',
  'support_tickets:manage',
  'usage:read',
  'usage:export',
  'jobs:read',
  'jobs:retry',
] as const satisfies readonly ResourceAction[];

export type Permission = (typeof permissionRegistry)[number];

const systemRolePermissions: Record<SystemRole, Permission[]> = {
  super_admin: [...permissionRegistry],
  platform_admin: permissionRegistry.filter((permission) => permission !== 'support:impersonate'),
  billing_admin: [
    'subscriptions:read',
    'subscriptions:update',
    'payments:read',
    'payments:refund',
    'plans:manage',
    'billing_providers:manage',
    'entitlements:read',
    'usage:read',
    'jobs:read',
  ],
  support_admin: [
    'users:read',
    'workspaces:read',
    'subscriptions:read',
    'payments:read',
    'audit_logs:read',
    'support:impersonate',
    'impersonation:end',
    'support_tickets:manage',
  ],
  security_admin: ['users:read', 'audit_logs:read', 'audit_logs:export'],
  ops_admin: [
    'jobs:read',
    'jobs:retry',
    'remote_config:read',
    'feature_flags:read',
    'flags:simulate',
    'config:simulate',
    'compatibility_rules:manage',
    'usage:read',
    'audit_logs:read',
  ],
  content_admin: ['feature_flags:read'],
};

const workspaceRolePermissions: Record<WorkspaceRole, Permission[]> = {
  workspace_owner: [
    'workspaces:read',
    'workspaces:update',
    'installations:read',
    'installations:write',
    'workspace_members:invite',
    'workspace_members:remove',
    'subscriptions:read',
    'subscriptions:update',
    'payments:read',
    'entitlements:read',
    'remote_config:read',
    'usage:read',
    'credentials:read',
    'credentials:write',
    'credentials:rotate',
  ],
  workspace_admin: [
    'workspaces:read',
    'workspaces:update',
    'installations:read',
    'installations:write',
    'workspace_members:invite',
    'workspace_members:remove',
    'subscriptions:read',
    'payments:read',
    'entitlements:read',
    'remote_config:read',
    'usage:read',
    'credentials:read',
    'credentials:write',
    'credentials:rotate',
  ],
  workspace_billing_manager: [
    'subscriptions:read',
    'subscriptions:update',
    'payments:read',
    'entitlements:read',
    'usage:read',
  ],
  workspace_security_manager: ['audit_logs:read', 'audit_logs:export', 'installations:read'],
  workspace_manager: ['workspaces:read', 'installations:read', 'remote_config:read', 'entitlements:read', 'usage:read'],
  workspace_analyst: ['audit_logs:read', 'installations:read', 'payments:read', 'subscriptions:read', 'usage:read', 'usage:export'],
  workspace_member: ['workspaces:read', 'credentials:read', 'credentials:write', 'credentials:rotate'],
  workspace_viewer: ['workspaces:read', 'installations:read', 'credentials:read', 'credentials:write', 'credentials:rotate'],
};

export const allSystemRoles = [...systemRoles];
export const allWorkspaceRoles = [...workspaceRoles];

/**
 * Base permissions granted to all authenticated users regardless of workspace membership.
 * These cover the personal account scope (dashboard, billing, settings, installations, credentials).
 */
export const authenticatedUserPermissions: Permission[] = [
  'installations:read',
  'installations:write',
  'credentials:read',
  'credentials:write',
  'credentials:rotate',
  'usage:read',
  'usage:export',
];

export function resolvePermissions(input: {
  systemRoles?: SystemRole[];
  workspaceRoles?: WorkspaceRole[];
  /** When true, includes the base authenticated-user permission set */
  authenticatedUser?: boolean;
}): Permission[] {
  const granted = new Set<Permission>();

  if (input.authenticatedUser) {
    for (const permission of authenticatedUserPermissions) {
      granted.add(permission);
    }
  }

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
