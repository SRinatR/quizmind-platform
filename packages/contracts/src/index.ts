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
export const ticketStatuses = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const supportTicketStatusFilters = ['active', 'open', 'in_progress', 'resolved', 'closed', 'all'] as const;
export const supportTicketOwnershipFilters = ['all', 'mine', 'unassigned'] as const;
export const supportTicketQueuePresets = [
  'active_queue',
  'my_active',
  'shared_queue',
  'resolved_review',
  'all_recent',
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
export const platformQueues = [
  'billing-webhooks',
  'usage-events',
  'emails',
  'quota-resets',
  'entitlement-refresh',
  'config-publish',
  'audit-exports',
] as const;

export type SystemRole = (typeof systemRoles)[number];
export type WorkspaceRole = (typeof workspaceRoles)[number];
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export type FeatureFlagStatus = (typeof featureFlagStatuses)[number];
export type CompatibilityStatus = (typeof compatibilityStatuses)[number];
export type TicketStatus = (typeof ticketStatuses)[number];
export type SupportTicketStatusFilter = (typeof supportTicketStatusFilters)[number];
export type SupportTicketOwnershipFilter = (typeof supportTicketOwnershipFilters)[number];
export type SupportTicketQueuePreset = (typeof supportTicketQueuePresets)[number];
export type RemoteConfigScope = (typeof remoteConfigScopes)[number];
export type PlatformQueue = (typeof platformQueues)[number];

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

export interface AuthRegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthRefreshRequest {
  refreshToken: string;
}

export interface AuthLogoutRequest {
  refreshToken?: string;
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
    emailVerifiedAt?: string | null;
  };
}

export interface AuthEmailVerificationStatus {
  required: boolean;
  delivery?: {
    provider: string;
    messageId: string;
    acceptedAt: string;
  };
  emailVerifiedAt?: string | null;
}

export interface AuthExchangePayload {
  session: AuthSessionPayload;
  emailVerification: AuthEmailVerificationStatus;
}

export interface AuthLogoutResult {
  revoked: boolean;
  revokedSessionId?: string;
}

export interface AuthLogoutAllResult {
  revoked: boolean;
  revokedCount: number;
}

export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
}

export interface AdminUserWorkspaceMembership {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  role: WorkspaceRole;
}

export interface AdminUserDirectoryEntry {
  id: string;
  email: string;
  displayName?: string;
  emailVerifiedAt?: string | null;
  suspendedAt?: string | null;
  lastLoginAt?: string | null;
  systemRoles: SystemRole[];
  workspaces: AdminUserWorkspaceMembership[];
}

export interface AdminUserDirectorySnapshot {
  personaKey: string;
  accessDecision: AccessDecision;
  items: AdminUserDirectoryEntry[];
  permissions: string[];
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


export interface SupportImpersonationRequest {
  supportActorId: string;
  targetUserId: string;
  workspaceId?: string;
  reason: string;
  supportTicketId?: string;
  operatorNote?: string;
}

export interface SupportTicketReference {
  id: string;
  subject: string;
  status: TicketStatus;
}

export interface SupportTicketTimelineEntry {
  id: string;
  eventType: string;
  summary: string;
  occurredAt: string;
  actor: SupportImpersonationActor;
  previousStatus?: TicketStatus;
  nextStatus?: TicketStatus;
  previousAssignee?: SupportImpersonationActor;
  nextAssignee?: SupportImpersonationActor;
  handoffNote?: string;
}

export interface SupportTicketQueueFilters {
  status: SupportTicketStatusFilter;
  ownership: SupportTicketOwnershipFilter;
  preset?: SupportTicketQueuePreset;
  search?: string;
  limit: number;
  timelineLimit: number;
}

export interface SupportTicketQueuePresetDefinition {
  key: SupportTicketQueuePreset;
  label: string;
  description: string;
  filters: Omit<SupportTicketQueueFilters, 'preset'>;
}

export const supportTicketQueuePresetDefinitions: SupportTicketQueuePresetDefinition[] = [
  {
    key: 'active_queue',
    label: 'Active queue',
    description: 'The default support inbox across open and in-progress tickets.',
    filters: {
      status: 'active',
      ownership: 'all',
      limit: 8,
      timelineLimit: 4,
    },
  },
  {
    key: 'my_active',
    label: 'My active',
    description: 'Only tickets currently owned by the signed-in support operator.',
    filters: {
      status: 'active',
      ownership: 'mine',
      limit: 8,
      timelineLimit: 4,
    },
  },
  {
    key: 'shared_queue',
    label: 'Shared queue',
    description: 'Unassigned open tickets waiting for an operator to claim them.',
    filters: {
      status: 'open',
      ownership: 'unassigned',
      limit: 8,
      timelineLimit: 4,
    },
  },
  {
    key: 'resolved_review',
    label: 'Resolved review',
    description: 'Recently resolved tickets with deeper workflow history for QA follow-up.',
    filters: {
      status: 'resolved',
      ownership: 'all',
      limit: 12,
      timelineLimit: 8,
    },
  },
  {
    key: 'all_recent',
    label: 'All recent',
    description: 'A broader view across every workflow state for recent ticket traffic.',
    filters: {
      status: 'all',
      ownership: 'all',
      limit: 12,
      timelineLimit: 4,
    },
  },
];

export interface SupportTicketQueuePresetFavoriteRequest {
  preset: SupportTicketQueuePreset;
  favorite: boolean;
}

export interface SupportTicketQueuePresetFavoriteResult {
  preset: SupportTicketQueuePreset;
  favorite: boolean;
  favorites: SupportTicketQueuePreset[];
}

export interface SupportTicketWorkflowUpdateRequest {
  supportTicketId: string;
  status?: TicketStatus;
  assignedToUserId?: string | null;
  handoffNote?: string | null;
}

export interface SupportImpersonationResult {
  impersonationSessionId: string;
  supportActorId: string;
  targetUserId: string;
  workspaceId?: string;
  reason: string;
  createdAt: string;
  supportTicket?: SupportTicketReference;
  operatorNote?: string;
}

export interface SupportImpersonationEndRequest {
  impersonationSessionId: string;
  closeReason?: string;
}

export interface SupportImpersonationEndResult {
  impersonationSessionId: string;
  targetUserId: string;
  workspaceId?: string;
  reason: string;
  createdAt: string;
  endedAt: string;
  supportTicket?: SupportTicketReference;
  operatorNote?: string;
  closeReason?: string;
}

export interface SupportImpersonationActor {
  id: string;
  email: string;
  displayName?: string;
}

export interface SupportImpersonationWorkspace {
  id: string;
  slug: string;
  name: string;
}

export interface SupportImpersonationSessionSnapshot {
  impersonationSessionId: string;
  supportActor: SupportImpersonationActor;
  targetUser: SupportImpersonationActor;
  workspace?: SupportImpersonationWorkspace;
  reason: string;
  createdAt: string;
  endedAt?: string | null;
  supportTicket?: SupportTicketReference;
  operatorNote?: string;
  closeReason?: string;
}

export interface SupportImpersonationHistorySnapshot {
  personaKey: string;
  accessDecision: AccessDecision;
  items: SupportImpersonationSessionSnapshot[];
  permissions: string[];
}

export interface SupportTicketQueueEntry {
  id: string;
  subject: string;
  body: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  requester: SupportImpersonationActor;
  assignedTo?: SupportImpersonationActor;
  workspace?: SupportImpersonationWorkspace;
  handoffNote?: string;
  timeline?: SupportTicketTimelineEntry[];
}

export interface SupportTicketQueueSnapshot {
  personaKey: string;
  accessDecision: AccessDecision;
  items: SupportTicketQueueEntry[];
  permissions: string[];
  filters: SupportTicketQueueFilters;
  favoritePresets: SupportTicketQueuePreset[];
}

export interface SupportTicketWorkflowUpdateResult extends SupportTicketQueueEntry {}

export interface ApiRouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  permission?: ResourceAction;
}
