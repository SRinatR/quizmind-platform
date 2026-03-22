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
export const remoteConfigScopes = [
  'global',
  'environment',
  'plan',
  'workspace',
  'user',
  'extension_version',
  'flag',
] as const;

export type SystemRole = (typeof systemRoles)[number];
export type WorkspaceRole = (typeof workspaceRoles)[number];
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export type FeatureFlagStatus = (typeof featureFlagStatuses)[number];
export type CompatibilityStatus = (typeof compatibilityStatuses)[number];
export type RemoteConfigScope = (typeof remoteConfigScopes)[number];

export type SubjectType = 'user' | 'workspace' | 'system';
export type ResourceAction = `${string}:${string}`;
export type PrimitiveValue = string | number | boolean | null;

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
  attributes?: Record<string, PrimitiveValue>;
}

export interface FeatureFlagRule {
  key: string;
  status: FeatureFlagStatus;
  description: string;
  conditions: Record<string, PrimitiveValue | string[]>;
}

export interface FeatureFlagDefinition {
  key: string;
  status: FeatureFlagStatus;
  description: string;
  enabled: boolean;
  rolloutPercentage?: number;
  allowRoles?: Array<SystemRole | WorkspaceRole>;
  allowPlans?: string[];
  allowUsers?: string[];
  allowWorkspaces?: string[];
  minimumExtensionVersion?: string;
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

export interface AccessRequirement {
  permission: ResourceAction;
  workspaceId?: string;
  requiredEntitlements?: string[];
  requiredFlags?: string[];
  requireSystemRole?: SystemRole;
  requireWorkspaceRole?: WorkspaceRole;
  requireOwnership?: boolean;
}

export interface AccessDecision {
  allowed: boolean;
  reasons: string[];
}

export interface RemoteConfigContext {
  environment?: string;
  planCode?: string;
  workspaceId?: string;
  userId?: string;
  extensionVersion?: string;
  activeFlags?: string[];
}

export interface RemoteConfigLayer {
  id: string;
  scope: RemoteConfigScope;
  priority: number;
  conditions?: Record<string, PrimitiveValue | string[]>;
  values: Record<string, PrimitiveValue | PrimitiveValue[] | Record<string, PrimitiveValue>>;
}

export interface ResolvedRemoteConfig {
  values: Record<string, PrimitiveValue | PrimitiveValue[] | Record<string, PrimitiveValue>>;
  appliedLayerIds: string[];
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthSessionPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    displayName?: string;
    systemRoles: SystemRole[];
  };
}

export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
}

export interface SubscriptionSummary {
  workspaceId: string;
  planCode: string;
  status: SubscriptionStatus;
  seatCount: number;
  currentPeriodEnd?: string;
  entitlements: PlanEntitlement[];
}

export interface ExtensionBootstrapRequest {
  installationId: string;
  userId: string;
  workspaceId?: string;
  environment: string;
  planCode?: string;
  handshake: CompatibilityHandshake;
}

export interface ExtensionBootstrapPayload {
  compatibility: CompatibilityResult;
  featureFlags: string[];
  remoteConfig: ResolvedRemoteConfig;
}

export interface UsageEventPayload {
  installationId: string;
  workspaceId?: string;
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}


export interface RemoteConfigPublishRequest {
  versionLabel: string;
  layers: RemoteConfigLayer[];
  actorId: string;
  workspaceId?: string;
}

export interface RemoteConfigPublishResult {
  versionLabel: string;
  appliedLayerCount: number;
  publishedAt: string;
  actorId: string;
  workspaceId?: string;
}

export interface RemoteConfigPreviewRequest {
  layers: RemoteConfigLayer[];
  context: RemoteConfigContext;
}

export interface ApiRouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  permission?: ResourceAction;
}
