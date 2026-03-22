export const systemRoles = [
  'super_admin',
  'platform_admin',
  'billing_admin',
  'support_admin',
  'security_admin',
  'ops_admin',
  'content_admin',
] as const;

export const workspaceRoles = [
  'workspace_owner',
  'workspace_admin',
  'workspace_billing_manager',
  'workspace_security_manager',
  'workspace_manager',
  'workspace_analyst',
  'workspace_member',
  'workspace_viewer',
] as const;

export const subscriptionStatuses = [
  'trialing',
  'active',
  'past_due',
  'paused',
  'canceled',
  'expired',
  'incomplete',
  'incomplete_expired',
  'grace_period',
] as const;

export const featureFlagStatuses = ['draft', 'active', 'paused', 'archived'] as const;
export const compatibilityStatuses = [
  'supported',
  'supported_with_warnings',
  'deprecated',
  'unsupported',
] as const;

export type SystemRole = (typeof systemRoles)[number];
export type WorkspaceRole = (typeof workspaceRoles)[number];
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export type FeatureFlagStatus = (typeof featureFlagStatuses)[number];
export type CompatibilityStatus = (typeof compatibilityStatuses)[number];

export type SubjectType = 'user' | 'workspace' | 'system';
export type ResourceAction = `${string}:${string}`;

export interface WorkspaceMembership {
  workspaceId: string;
  role: WorkspaceRole;
}

export interface AccessContext {
  userId: string;
  systemRoles: SystemRole[];
  workspaceMemberships: WorkspaceMembership[];
  entitlements: string[];
  featureFlags: string[];
  attributes?: Record<string, string | number | boolean | null>;
}

export interface FeatureFlagRule {
  key: string;
  status: FeatureFlagStatus;
  description: string;
  conditions: Record<string, string | number | boolean | string[]>;
}

export interface PlanEntitlement {
  key: string;
  enabled: boolean;
  limit?: number;
}

export interface PlanDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  entitlements: PlanEntitlement[];
}

export interface CompatibilityHandshake {
  extensionVersion: string;
  schemaVersion: string;
  capabilities: string[];
  browser: 'chrome' | 'edge' | 'brave' | 'other';
}

export interface CompatibilityResult {
  status: CompatibilityStatus;
  minimumVersion: string;
  recommendedVersion: string;
  supportedSchemaVersions: string[];
  reason?: string;
}

export interface AuditEvent {
  eventId: string;
  eventType: string;
  actorId: string;
  actorType: SubjectType;
  workspaceId?: string;
  targetType: string;
  targetId: string;
  occurredAt: string;
  requestId?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}
