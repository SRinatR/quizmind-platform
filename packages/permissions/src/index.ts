import {
  systemRoles,
  type AccessContext,
  type AccessDecision,
  type AccessRequirement,
  type ResourceAction,
  type SystemRole,
} from '@quizmind/contracts';

export const permissionRegistry = [
  'users:read',
  'users:update',
  'users:suspend',
  'workspaces:read',
  'workspaces:update',
  'installations:read',
  'installations:write',
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

export const allSystemRoles = [...systemRoles];

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

  return [...granted].sort();
}

export function hasPermission(permissions: Permission[], permission: Permission): boolean {
  return permissions.includes(permission);
}

export function evaluateAccess(context: AccessContext, requirement: AccessRequirement): AccessDecision {
  const reasons: string[] = [];
  const permissions = resolvePermissions({
    systemRoles: context.systemRoles,
    authenticatedUser: true,
  });

  if (!hasPermission(permissions, requirement.permission as Permission)) {
    reasons.push(`Missing permission: ${requirement.permission}`);
  }

  if (requirement.requireSystemRole && !context.systemRoles.includes(requirement.requireSystemRole)) {
    reasons.push(`Missing system role: ${requirement.requireSystemRole}`);
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

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
