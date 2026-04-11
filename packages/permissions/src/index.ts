import {
  type AccessContext,
  type AccessDecision,
  type AccessRequirement,
  type ResourceAction,
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

export const allSystemRoles = ['admin'] as const;

/**
 * Base permissions granted to all authenticated users regardless of role.
 * Covers the personal account scope (dashboard, billing, settings, installations, credentials).
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

/**
 * Admin accounts receive the full permission set.
 * Any non-empty systemRoles array (including legacy role strings during migration)
 * is treated as admin.
 */
export function resolvePermissions(input: {
  systemRoles?: readonly string[];
  /** When true, includes the base authenticated-user permission set */
  authenticatedUser?: boolean;
}): Permission[] {
  const granted = new Set<Permission>();

  if (input.authenticatedUser) {
    for (const permission of authenticatedUserPermissions) {
      granted.add(permission);
    }
  }

  if ((input.systemRoles ?? []).length > 0) {
    for (const permission of permissionRegistry) {
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
