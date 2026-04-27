export const systemRoles = ['admin'] as const;

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
  'config-publish',
  'audit-exports',
  'history-cleanup',
] as const;
export const billingProviders = ['mock', 'stripe', 'manual', 'yookassa', 'paddle'] as const;
export const aiProviders = ['openai', 'anthropic', 'openrouter', 'routerai', 'polza', 'internal'] as const;
export const credentialOwnerTypes = ['platform', 'workspace', 'user'] as const;
export const credentialValidationStatuses = ['pending', 'valid', 'invalid', 'revoked'] as const;
export const aiAccessPolicyModes = [
  'platform_only',
  'user_key_optional',
  'user_key_required',
  'admin_approved_user_key',
  'enterprise_managed',
] as const;
export const aiProviderPolicyScopeTypes = ['global', 'workspace'] as const;
export const usageQuotaEnforcementModes = ['hard_limit', 'soft_limit', 'grace'] as const;
export const usageDecisionCodes = ['accepted', 'quota_exceeded', 'policy_denied', 'unsupported'] as const;
export const providerAvailabilityStates = ['active', 'beta', 'deprecated', 'disabled'] as const;
export const usageExportFormats = ['json', 'csv'] as const;
export const usageExportScopes = ['full', 'quotas', 'installations', 'events'] as const;
export const adminLogStreams = ['audit', 'activity', 'security', 'domain'] as const;
export const adminLogStreamFilters = ['all', 'audit', 'activity', 'security', 'domain'] as const;
export const adminLogSeverityFilters = ['all', 'debug', 'info', 'warn', 'error'] as const;
export const adminLogExportFormats = ['json', 'csv'] as const;
export const adminLogCategoryFilters = ['all', 'auth', 'extension', 'ai', 'admin', 'system'] as const;
export const adminLogSourceFilters = ['all', 'web', 'extension', 'api', 'worker', 'webhook'] as const;
export const adminLogStatusFilters = ['all', 'success', 'failure'] as const;
export const adminWebhookStatusFilters = ['all', 'received', 'processed', 'failed'] as const;
export const adminWebhookProviderFilters = ['all', 'mock', 'stripe', 'manual', 'yookassa', 'paddle'] as const;
export const adminQueueProcessorStates = ['bound', 'declared_only'] as const;
export const adminExtensionConnectionFilters = ['all', 'connected', 'reconnect_required'] as const;
export const adminExtensionCompatibilityFilters = [
  'all',
  'supported',
  'supported_with_warnings',
  'deprecated',
  'unsupported',
] as const;
export const adminExtensionSessionStatuses = ['active', 'expired', 'revoked'] as const;

export type SystemRole = (typeof systemRoles)[number];
export type WorkspaceRole = (typeof workspaceRoles)[number];
export type FeatureFlagStatus = (typeof featureFlagStatuses)[number];
export type CompatibilityStatus = (typeof compatibilityStatuses)[number];
export type TicketStatus = (typeof ticketStatuses)[number];
export type SupportTicketStatusFilter = (typeof supportTicketStatusFilters)[number];
export type SupportTicketOwnershipFilter = (typeof supportTicketOwnershipFilters)[number];
export type SupportTicketQueuePreset = (typeof supportTicketQueuePresets)[number];
export type RemoteConfigScope = (typeof remoteConfigScopes)[number];
export type PlatformQueue = (typeof platformQueues)[number];
export type BillingProvider = (typeof billingProviders)[number];
export type AiProvider = (typeof aiProviders)[number];
export type CredentialOwnerType = (typeof credentialOwnerTypes)[number];
export type CredentialValidationStatus = (typeof credentialValidationStatuses)[number];
export type AiAccessPolicyMode = (typeof aiAccessPolicyModes)[number];
export type AiProviderPolicyScopeType = (typeof aiProviderPolicyScopeTypes)[number];
export type UsageQuotaEnforcementMode = (typeof usageQuotaEnforcementModes)[number];
export type UsageDecisionCode = (typeof usageDecisionCodes)[number];
export type ProviderAvailabilityState = (typeof providerAvailabilityStates)[number];
export type UsageExportFormat = (typeof usageExportFormats)[number];
export type UsageExportScope = (typeof usageExportScopes)[number];
export type AdminLogStream = (typeof adminLogStreams)[number];
export type AdminLogStreamFilter = (typeof adminLogStreamFilters)[number];
export type AdminLogSeverityFilter = (typeof adminLogSeverityFilters)[number];
export type AdminLogExportFormat = (typeof adminLogExportFormats)[number];
export type AdminLogCategoryFilter = (typeof adminLogCategoryFilters)[number];
export type AdminLogSourceFilter = (typeof adminLogSourceFilters)[number];
export type AdminLogStatusFilter = (typeof adminLogStatusFilters)[number];
export type AdminWebhookStatusFilter = (typeof adminWebhookStatusFilters)[number];
export type AdminWebhookProviderFilter = (typeof adminWebhookProviderFilters)[number];
export type AdminQueueProcessorState = (typeof adminQueueProcessorStates)[number];
export type AdminExtensionConnectionFilter = (typeof adminExtensionConnectionFilters)[number];
export type AdminExtensionCompatibilityFilter = (typeof adminExtensionCompatibilityFilters)[number];
export type AdminExtensionSessionStatus = (typeof adminExtensionSessionStatuses)[number];

export type SubjectType = 'user' | 'workspace' | 'system';
export type ResourceAction = `${string}:${string}`;
export type PrimitiveValue = string | number | boolean | null;

export interface AccessContext {
  userId: string;
  systemRoles: SystemRole[];
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
  allowUsers?: string[];
  minimumExtensionVersion?: string;
}

export interface FeatureFlagUpdateRequest {
  key: string;
  description?: string;
  status?: FeatureFlagStatus;
  enabled?: boolean;
  rolloutPercentage?: number | null;
  allowRoles?: Array<SystemRole | WorkspaceRole>;
  allowUsers?: string[];
  minimumExtensionVersion?: string | null;
}

export interface FeatureFlagUpdateResult {
  flag: FeatureFlagDefinition;
  updatedAt: string;
}

export interface CompatibilityHandshake {
  extensionVersion: string;
  buildId?: string;
  schemaVersion: string;
  capabilities: string[];
  browser: 'chrome' | 'edge' | 'brave' | 'firefox' | 'safari' | 'other';
}

export interface CompatibilityResult {
  status: CompatibilityStatus;
  minimumVersion: string;
  recommendedVersion: string;
  supportedSchemaVersions: string[];
  reason?: string;
}

export interface CompatibilityRuleDefinition {
  id: string;
  minimumVersion: string;
  recommendedVersion: string;
  supportedSchemaVersions: string[];
  requiredCapabilities?: string[];
  resultStatus: CompatibilityStatus;
  reason?: string;
  createdAt: string;
}

export interface CompatibilityRulesSnapshot {
  personaKey: string;
  publishDecision: AccessDecision;
  items: CompatibilityRuleDefinition[];
  permissions: string[];
}

export interface CompatibilityRulePublishRequest {
  minimumVersion: string;
  recommendedVersion: string;
  supportedSchemaVersions: string[];
  requiredCapabilities?: string[];
  resultStatus: CompatibilityStatus;
  reason?: string | null;
}

export interface CompatibilityRulePublishResult {
  rule: CompatibilityRuleDefinition;
  publishedAt: string;
}

export interface AuditEvent {
  eventId: string;
  eventType: string;
  actorId: string;
  actorType: SubjectType;
  targetType: string;
  targetId: string;
  occurredAt: string;
  requestId?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface AccessRequirement {
  permission?: ResourceAction;
  requiredEntitlements?: string[];
  requiredFlags?: string[];
  requireSystemRole?: SystemRole;
}

export interface AccessDecision {
  allowed: boolean;
  reasons: string[];
}

export interface RemoteConfigContext {
  environment?: string;
  planCode?: string;
  userId?: string;
  extensionVersion?: string;
  buildId?: string;
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

export interface AuthForgotPasswordRequest {
  email: string;
}

export interface AuthForgotPasswordResult {
  accepted: boolean;
  expiresInMinutes: number;
}

export interface AuthResetPasswordRequest {
  token: string;
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

export interface AuthResetPasswordResult {
  session: AuthSessionPayload;
  resetAt: string;
}

export interface AuthLogoutResult {
  revoked: boolean;
  revokedSessionId?: string;
}

export interface AuthLogoutAllResult {
  revoked: boolean;
  revokedCount: number;
}

export interface AuthVerifyEmailResult {
  verified: boolean;
  emailVerifiedAt: string;
}

export interface AuthSessionSummary {
  id: string;
  browser?: string | null;
  deviceName?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AuthSessionsPayload {
  items: AuthSessionSummary[];
}

/**
 * Per-user UI preferences stored server-side.
 * All fields are optional so partial updates are safe.
 */
export interface UiPreferences {
  theme?: 'light' | 'dark' | 'system';
  language?: 'en' | 'ru';
  density?: 'comfortable' | 'compact';
  reducedMotion?: boolean;
  sidebarCollapsed?: boolean;
  balanceDisplayCurrency?: 'RUB' | 'USD' | 'EUR';
}

export interface UserProfilePayload {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
  timezone?: string | null;
  uiPreferences?: UiPreferences | null;
  emailVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileUpdateRequest {
  displayName?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
  timezone?: string | null;
  uiPreferences?: UiPreferences | null;
}

export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
}

export interface AdminUserWorkspaceMembership {
  workspaceSlug: string;
  workspaceName: string;
  role: WorkspaceRole;
}

export interface AdminUserWorkspaceMembershipInput {
  role: WorkspaceRole;
}

export interface AdminUserDirectoryEntry {
  id: string;
  email: string;
  displayName?: string;
  emailVerifiedAt?: string | null;
  suspendedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  systemRoles: SystemRole[];
  workspaces: AdminUserWorkspaceMembership[];
}

export interface AdminUserCreateRequest {
  email: string;
  password: string;
  displayName?: string;
  systemRoles?: SystemRole[];
  emailVerified?: boolean;
}

export interface AdminUserAccessUpdateRequest {
  userId: string;
  displayName?: string | null;
  systemRoles?: SystemRole[];
  suspend?: boolean;
  suspendReason?: string | null;
}

export interface AdminUserMutationResult {
  user: AdminUserDirectoryEntry;
  updatedAt: string;
}

export interface AdminUserDirectorySnapshot {
  personaKey: string;
  accessDecision: AccessDecision;
  writeDecision: AccessDecision;
  items: AdminUserDirectoryEntry[];
  total?: number;
  page?: number;
  limit: number;
  hasNext?: boolean;
  nextCursor?: string | null;
  previousCursor?: string | null;
  permissions: string[];
}

export interface AdminLogActorSummary {
  id: string;
  email?: string;
  displayName?: string;
}

export interface AdminLogFilters {
  stream: AdminLogStreamFilter;
  severity: AdminLogSeverityFilter;
  search?: string;
  limit: number;
  cursor?: string;
  category?: AdminLogCategoryFilter;
  source?: AdminLogSourceFilter;
  status?: AdminLogStatusFilter;
  eventType?: string;
  from?: string;
  to?: string;
  page?: number;
}

export interface AdminLogEntry {
  id: string;
  stream: AdminLogStream;
  eventType: string;
  summary: string;
  occurredAt: string;
  severity?: UsageEventSeverity;
  status?: 'success' | 'failure';
  actor?: AdminLogActorSummary;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  /** Derived domain category for filtering */
  category?: Exclude<AdminLogCategoryFilter, 'all'>;
  /** Derived request source */
  source?: Exclude<AdminLogSourceFilter, 'all'>;
  installationId?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  costUsd?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  errorSummary?: string;
  aiRequest?: AdminLogAiRequestDetail;
}

export interface AdminLogAiRequestDetail {
  id: string;
  provider: string;
  model: string;
  modelDisplayName?: string | null;
  status: AiRequestStatus;
  requestType: AiRequestType;
  estimatedCostUsd?: number | null;
  durationMs?: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptExcerpt?: string | null;
  responseExcerpt?: string | null;
  promptContentJson?: unknown;
  responseContentJson?: unknown;
  contentAvailability?: 'available' | 'expired' | 'missing';
  contentMessage?: string;
  attachments?: AiHistoryAttachment[];
}

export interface AdminLogStreamCounts {
  audit: number;
  activity: number;
  security: number;
  domain: number;
}

export interface AdminLogCategoryCounts {
  auth: number;
  extension: number;
  ai: number;
  admin: number;
  system: number;
}

export interface AdminLogsSnapshot {
  personaKey: string;
  accessDecision: AccessDecision;
  exportDecision: AccessDecision;
  filters: AdminLogFilters;
  items: AdminLogEntry[];
  streamCounts: AdminLogStreamCounts;
  categoryCounts: AdminLogCategoryCounts;
  total?: number;
  hasNext: boolean;
  nextCursor?: string | null;
  permissions: string[];
}

export type AdminSecurityControlStatus = 'planned' | 'in_progress' | 'enabled';

export interface AdminSecurityFindingCounts {
  suspiciousAuthFailures: number;
  impersonationEvents: number;
  providerCredentialEvents: number;
  privilegedActionEvents: number;
  extensionBootstrapRefreshFailures: number;
  extensionReconnectRequests: number;
  extensionReconnectRecoveries: number;
  extensionReconnectOutstanding: number;
  extensionSessionRevocations: number;
  extensionSessionRotations: number;
  extensionRuntimeErrors: number;
  totalFailures: number;
}

export interface AdminSecurityLifecycleTrendBucket {
  bucketStart: string;
  extensionBootstrapRefreshFailures: number;
  extensionReconnectRequests: number;
  extensionReconnectRecoveries: number;
  extensionSessionRevocations: number;
  extensionSessionRotations: number;
  extensionRuntimeErrors: number;
}

export interface AdminSecurityLifecycleTrend {
  windowHours: number;
  bucketHours: number;
  buckets: AdminSecurityLifecycleTrendBucket[];
}

export interface AdminSecurityControlCheckpoint {
  id: 'admin_mfa' | 'step_up_auth' | 'secret_access_audit' | 'risk_scoring';
  title: string;
  status: AdminSecurityControlStatus;
  description: string;
}

export interface AdminSecuritySnapshot {
  personaKey: string;
  accessDecision: AccessDecision;
  exportDecision: AccessDecision;
  filters: AdminLogFilters;
  items: AdminLogEntry[];
  streamCounts: AdminLogStreamCounts;
  categoryCounts: AdminLogCategoryCounts;
  total: number;
  hasNext: boolean;
  findings: AdminSecurityFindingCounts;
  lifecycleTrend: AdminSecurityLifecycleTrend;
  controls: AdminSecurityControlCheckpoint[];
  permissions: string[];
}

export interface AdminLogExportRequest {
  stream?: AdminLogStreamFilter;
  severity?: AdminLogSeverityFilter;
  search?: string;
  limit?: number;
  format: AdminLogExportFormat;
  category?: AdminLogCategoryFilter;
  source?: AdminLogSourceFilter;
  status?: AdminLogStatusFilter;
  eventType?: string;
  from?: string;
  to?: string;
}

export interface AdminLogExportResult {
  format: AdminLogExportFormat;
  fileName: string;
  contentType: string;
  exportedAt: string;
  itemCount: number;
  content: string;
}

export interface AdminWebhookFilters {
  provider: AdminWebhookProviderFilter;
  status: AdminWebhookStatusFilter;
  search?: string;
  limit: number;
}

export interface AdminQueueSummary {
  name: PlatformQueue;
  description: string;
  attempts: number;
  processorState: AdminQueueProcessorState;
  handler?: string;
}

export interface AdminWebhookEventSummary {
  id: string;
  provider: BillingProvider;
  externalEventId: string;
  eventType: string;
  status: 'received' | 'processed' | 'failed';
  queue: PlatformQueue;
  retryable: boolean;
  receivedAt: string;
  providerCreatedAt?: string | null;
  processedAt?: string | null;
  lastError?: string | null;
}

export interface AdminWebhookStatusCounts {
  received: number;
  processed: number;
  failed: number;
}

export interface AdminWebhooksSnapshot {
  personaKey: string;
  accessDecision: AccessDecision;
  retryDecision: AccessDecision;
  filters: AdminWebhookFilters;
  items: AdminWebhookEventSummary[];
  statusCounts: AdminWebhookStatusCounts;
  queues: AdminQueueSummary[];
  permissions: string[];
}

export interface AdminWebhookRetryRequest {
  webhookEventId: string;
}

export interface AdminWebhookRetryResult {
  webhookEventId: string;
  provider: BillingProvider;
  externalEventId: string;
  eventType: string;
  queue: PlatformQueue;
  jobId: string;
  retriedAt: string;
  status: 'received';
}

export interface ExtensionBootstrapRequest {
  installationId: string;
  userId: string;
  environment: string;
  planCode?: string;
  handshake: CompatibilityHandshake;
}

export interface ExtensionBootstrapPayload {
  compatibility: CompatibilityResult;
  featureFlags: string[];
  remoteConfig: ResolvedRemoteConfig;
}

export interface ExtensionBootstrapRequestV2 {
  installationId: string;
  environment: string;
  handshake: CompatibilityHandshake;
}

export interface UsageQuotaHint {
  key: string;
  label: string;
  limit?: number;
  remaining?: number;
  status: UsageMetricStatus;
  enforcementMode: UsageQuotaEnforcementMode;
}

export interface UsageDecision {
  accepted: boolean;
  code: UsageDecisionCode;
  quotaKey?: string;
  message?: string;
  retryAt?: string;
}

export interface AiAccessPolicy {
  mode: AiAccessPolicyMode;
  allowPlatformManaged: boolean;
  allowBringYourOwnKey: boolean;
  allowDirectProviderMode: boolean;
  allowWorkspaceSharedCredentials?: boolean;
  requireAdminApproval?: boolean;
  allowVisionOnUserKeys?: boolean;
  providers: AiProvider[];
  allowedModelTags?: string[];
  defaultProvider?: AiProvider;
  defaultModel?: string;
  reason?: string;
}

export interface AiProviderPolicySnapshot extends AiAccessPolicy {
  scopeType: AiProviderPolicyScopeType;
  scopeKey: string;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiProviderPolicyHistoryActor {
  id: string;
  email?: string | null;
  displayName?: string | null;
}

export interface AiProviderPolicyHistoryEntry {
  id: string;
  eventType: string;
  summary: string;
  scopeType: AiProviderPolicyScopeType;
  scopeKey: string;
  actor?: AiProviderPolicyHistoryActor | null;
  occurredAt: string;
  mode?: AiAccessPolicyMode;
  providers: AiProvider[];
  allowBringYourOwnKey?: boolean;
  allowWorkspaceSharedCredentials?: boolean;
  requireAdminApproval?: boolean;
  defaultProvider?: AiProvider;
  defaultModel?: string;
  allowedModelTags?: string[];
  reason?: string;
}

export interface ExtensionInstallationBindingSummary {
  installationId: string;
  userId: string;
  browser: CompatibilityHandshake['browser'];
  extensionVersion: string;
  buildId?: string;
  schemaVersion: string;
  capabilities: string[];
  lastSeenAt: string;
  boundAt: string;
}

export interface ExtensionInstallationTokenSession {
  token: string;
  expiresAt: string;
  refreshAfterSeconds: number;
}

export type ExtensionConnectionStatus = 'connected' | 'expiring_soon' | 'reconnect_required';

export interface ExtensionInstallationSessionRefreshResult {
  installationId: string;
  installationToken: string;
  tokenExpiresAt: string;
  refreshAfterSeconds: number;
  status: 'refreshed';
}

export interface ExtensionBootstrapPayloadV2 {
  installationId: string;
  compatibility: CompatibilityResult;
  entitlements: string[];
  featureFlags: string[];
  remoteConfig: ResolvedRemoteConfig;
  quotaHints: UsageQuotaHint[];
  aiAccessPolicy: AiAccessPolicy;
  deprecationMessages: string[];
  killSwitches: string[];
  refreshAfterSeconds: number;
  issuedAt: string;
}

export interface ExtensionInstallationBindRequest {
  installationId: string;
  environment: string;
  handshake: CompatibilityHandshake;
}

export interface ExtensionInstallationBindResult {
  installation: ExtensionInstallationBindingSummary;
  session: ExtensionInstallationTokenSession;
  bootstrap: ExtensionBootstrapPayloadV2;
}

export interface ExtensionInstallationInventoryItem {
  installationId: string;
  browser: CompatibilityHandshake['browser'];
  extensionVersion: string;
  schemaVersion: string;
  capabilities: string[];
  boundAt: string;
  lastSeenAt?: string;
  activeSessionCount: number;
  lastSessionIssuedAt?: string;
  lastSessionExpiresAt?: string;
  compatibility: CompatibilityResult;
  requiresReconnect: boolean;
  connectionStatus: ExtensionConnectionStatus;
}

export interface ExtensionInstallationInventorySnapshot {
  accessDecision: AccessDecision;
  disconnectDecision: AccessDecision;
  items: ExtensionInstallationInventoryItem[];
  permissions: string[];
}

export interface ExtensionInstallationDisconnectRequest {
  installationId: string;
  reason: string;
}

export interface ExtensionInstallationDisconnectResult {
  installationId: string;
  revokedSessionCount: number;
  disconnectedAt: string;
  requiresReconnect: boolean;
}

export interface ExtensionInstallationRotateSessionRequest {
  installationId: string;
  reason: string;
}

export interface ExtensionInstallationRotateSessionResult {
  installationId: string;
  revokedSessionCount: number;
  rotatedAt: string;
  session: ExtensionInstallationTokenSession;
}

export interface AdminExtensionFleetFilters {
  compatibility: AdminExtensionCompatibilityFilter;
  connection: AdminExtensionConnectionFilter;
  installationId?: string;
  search?: string;
  limit: number;
}

export interface AdminExtensionFleetItem {
  userId: string;
  installationId: string;
  browser: CompatibilityHandshake['browser'];
  extensionVersion: string;
  schemaVersion: string;
  capabilities: string[];
  boundAt: string;
  lastSeenAt?: string;
  activeSessionCount: number;
  lastSessionIssuedAt?: string;
  lastSessionExpiresAt?: string;
  compatibility: CompatibilityResult;
  requiresReconnect: boolean;
}

export interface AdminExtensionFleetCounts {
  total: number;
  connected: number;
  reconnectRequired: number;
  supported: number;
  supportedWithWarnings: number;
  deprecated: number;
  unsupported: number;
}

export interface AdminExtensionFleetSessionHistoryItem {
  id: string;
  installationId: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
  status: AdminExtensionSessionStatus;
}

export interface AdminExtensionFleetSessionHistoryCounts {
  total: number;
  active: number;
  expired: number;
  revoked: number;
}

export interface AdminExtensionFleetInstallationDetail {
  installation: AdminExtensionFleetItem;
  counts: AdminExtensionFleetSessionHistoryCounts;
  sessions: AdminExtensionFleetSessionHistoryItem[];
}

export interface AdminExtensionFleetSnapshot {
  personaKey: string;
  accessDecision: AccessDecision;
  manageDecision: AccessDecision;
  filters: AdminExtensionFleetFilters;
  items: AdminExtensionFleetItem[];
  counts: AdminExtensionFleetCounts;
  selectedInstallationId?: string;
  selectedInstallation?: AdminExtensionFleetInstallationDetail;
  permissions: string[];
}

export interface UsageEventPayload {
  installationId: string;
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface UsageEventIngestResult {
  queued: boolean;
  queue: PlatformQueue;
  job: {
    id: string;
    queue: PlatformQueue;
    dedupeKey?: string;
    createdAt: string;
    attempts?: number;
  };
  handler: string;
  logEvent: {
    eventId: string;
    eventType: string;
    occurredAt: string;
    status: string;
  };
}

export interface UsageExportRequest {
  format: UsageExportFormat;
  scope: UsageExportScope;
}

export interface UsageExportResult {
  format: UsageExportFormat;
  scope: UsageExportScope;
  fileName: string;
  contentType: string;
  exportedAt: string;
  content: string;
}

export const emailQueueTemplateKeys = ['auth.verify-email', 'auth.password-reset', 'workspace.invitation'] as const;
export type EmailQueueTemplateKey = (typeof emailQueueTemplateKeys)[number];

export interface EmailQueueJobPayload {
  to: string;
  templateKey: EmailQueueTemplateKey;
  variables: Record<string, unknown>;
  requestedAt: string;
  requestedByUserId?: string;
}

export interface QuotaResetJobPayload {
  key: string;
  consumed: number;
  periodStart: string;
  periodEnd: string;
  nextPeriodStart: string;
  nextPeriodEnd: string;
  requestedAt: string;
}

export interface UsageAuditExportJobPayload {
  exportType: 'usage';
  format: UsageExportFormat;
  scope: UsageExportScope;
  fileName: string;
  contentType: string;
  exportedAt: string;
  requestedByUserId: string;
}

export interface AdminLogsAuditExportJobPayload {
  exportType: 'admin_logs';
  format: AdminLogExportFormat;
  fileName: string;
  contentType: string;
  exportedAt: string;
  itemCount: number;
  requestedByUserId: string;
}

export type AuditExportJobPayload = UsageAuditExportJobPayload | AdminLogsAuditExportJobPayload;

export type UsageMetricStatus = 'healthy' | 'warning' | 'exceeded';
export type UsageEventSource = 'telemetry' | 'activity' | 'ai';
export type UsageEventSeverity = 'debug' | 'info' | 'warn' | 'error';
export type UsageHistorySourceFilter = UsageEventSource | 'all';

export interface UsageQuotaSnapshot {
  key: string;
  label: string;
  consumed: number;
  limit?: number;
  remaining?: number;
  periodStart: string;
  periodEnd: string;
  status: UsageMetricStatus;
}

export interface UsageInstallationSummary {
  installationId: string;
  browser: string;
  extensionVersion: string;
  schemaVersion: string;
  capabilities: string[];
  lastSeenAt?: string | null;
}

export interface UsageRecentEventSummary {
  id: string;
  source: UsageEventSource;
  eventType: string;
  severity?: UsageEventSeverity;
  occurredAt: string;
  installationId?: string;
  actorId?: string;
  summary: string;
}

export interface UsageHistoryRequest {
  source?: UsageHistorySourceFilter;
  eventType?: string;
  installationId?: string;
  actorId?: string;
  limit?: number;
}

export interface UsageHistoryFilters {
  source: UsageHistorySourceFilter;
  eventType?: string;
  installationId?: string;
  actorId?: string;
  limit: number;
}

export interface WorkspaceUsageHistorySnapshot {
  accessDecision: AccessDecision;
  exportDecision: AccessDecision;
  filters: UsageHistoryFilters;
  items: UsageRecentEventSummary[];
  permissions: string[];
}

export interface WorkspaceUsageSnapshot {
  accessDecision: AccessDecision;
  exportDecision: AccessDecision;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  quotas: UsageQuotaSnapshot[];
  installations: UsageInstallationSummary[];
  recentEvents: UsageRecentEventSummary[];
}

export interface BillingWebhookJobPayload {
  provider: BillingProvider;
  webhookEventId: string;
  externalEventId: string;
  eventType: string;
  receivedAt: string;
}

export interface BillingWebhookIngestResult {
  accepted: boolean;
  duplicate: boolean;
  provider: BillingProvider;
  eventId: string;
  eventType: string;
  receivedAt: string;
  queue?: PlatformQueue;
  jobId?: string;
}

export interface ProviderRegistryEntry {
  provider: AiProvider;
  displayName: string;
  availability: ProviderAvailabilityState;
  supportsProxy: boolean;
  supportsBringYourOwnKey: boolean;
}

export interface ProviderModelCatalogEntry {
  provider: AiProvider;
  modelId: string;
  displayName: string;
  capabilityTags: string[];
  availability: ProviderAvailabilityState;
  latencyClass?: 'low' | 'standard' | 'high';
  planAvailability?: string[];
}

export interface ProviderCatalogPayload {
  providers: ProviderRegistryEntry[];
  models: ProviderModelCatalogEntry[];
}

export interface ProviderCredentialSummary {
  id: string;
  provider: AiProvider;
  ownerType: CredentialOwnerType;
  ownerId: string;
  userId?: string | null;
  label?: string | null;
  keyHint?: string | null;
  validationStatus: CredentialValidationStatus;
  validationMessage?: string | null;
  scopes: string[];
  secretPreview?: string | null;
  lastValidatedAt?: string | null;
  disabledAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderCredentialInventory {
  accessDecision: AccessDecision;
  writeDecision: AccessDecision;
  rotateDecision: AccessDecision;
  permissions: string[];
  providers: ProviderRegistryEntry[];
  models: ProviderModelCatalogEntry[];
  aiAccessPolicy: AiAccessPolicy;
  policy: AiProviderPolicySnapshot;
  items: ProviderCredentialSummary[];
}

export interface ProviderCredentialOwnerBreakdown {
  platform: number;
  workspace: number;
  user: number;
}

export interface ProviderCredentialStatusBreakdown {
  pending: number;
  valid: number;
  invalid: number;
  revoked: number;
}

export interface ProviderCredentialProviderBreakdown {
  provider: AiProvider;
  displayName: string;
  availability: ProviderAvailabilityState;
  totalCredentials: number;
  ownerBreakdown: ProviderCredentialOwnerBreakdown;
  statusBreakdown: ProviderCredentialStatusBreakdown;
}

export interface AdminProviderGovernanceSnapshot {
  accessDecision: AccessDecision;
  writeDecision: AccessDecision;
  rotateDecision: AccessDecision;
  permissions: string[];
  providers: ProviderRegistryEntry[];
  models: ProviderModelCatalogEntry[];
  aiAccessPolicy: AiAccessPolicy;
  policy: AiProviderPolicySnapshot;
  policyHistory: AiProviderPolicyHistoryEntry[];
  items: ProviderCredentialSummary[];
  ownerBreakdown: ProviderCredentialOwnerBreakdown;
  statusBreakdown: ProviderCredentialStatusBreakdown;
  providerBreakdown: ProviderCredentialProviderBreakdown[];
}

export interface AiProviderPolicyUpdateRequest {
  mode?: AiAccessPolicyMode;
  allowPlatformManaged?: boolean;
  allowBringYourOwnKey?: boolean;
  allowDirectProviderMode?: boolean;
  allowWorkspaceSharedCredentials?: boolean;
  requireAdminApproval?: boolean;
  allowVisionOnUserKeys?: boolean;
  providers?: AiProvider[];
  allowedModelTags?: string[];
  defaultProvider?: AiProvider | null;
  defaultModel?: string | null;
  reason?: string | null;
}

export interface AiProviderPolicyUpdateResult {
  policy: AiProviderPolicySnapshot;
  updatedAt: string;
}

export interface AiProviderPolicyResetRequest {
}

export interface AiProviderPolicyResetResult {
  scopeKey: string;
  resetApplied: boolean;
  policy: AiProviderPolicySnapshot;
  resetAt: string;
}

export interface ProviderCredentialCreateRequest {
  provider: AiProvider;
  ownerType: CredentialOwnerType;
  ownerId?: string;
  label?: string;
  secret: string;
  scopes?: string[];
}

export interface ProviderCredentialRotateRequest {
  credentialId: string;
  secret: string;
  scopes?: string[];
}

export interface ProviderCredentialRevokeRequest {
  credentialId: string;
  reason?: string;
}

export interface ProviderCredentialMutationResult {
  credential: ProviderCredentialSummary;
  validationMessage?: string;
}

export interface ProviderCredentialRevokeResult {
  credentialId: string;
  revokedAt: string;
}

export interface UserApiKeySummary {
  id: string;
  provider: AiProvider;
  label?: string | null;
  keyHint?: string | null;
  validationStatus: CredentialValidationStatus;
  validationMessage?: string | null;
  lastValidatedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserApiKeyInventoryPayload {
  items: UserApiKeySummary[];
}

export interface UserApiKeyCreateRequest {
  provider: AiProvider;
  secret: string;
  label?: string;
}

export interface UserApiKeyCreateResult {
  apiKey: UserApiKeySummary;
  validationMessage?: string;
}

export interface UserApiKeyDeleteResult {
  apiKeyId: string;
  deletedAt: string;
}

export interface UserApiKeyTestResult {
  apiKey: UserApiKeySummary;
  valid: boolean;
  validationMessage?: string;
  testedAt: string;
}

export type AiProxyMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AiProxyTextContentBlock {
  type: 'text';
  text: string;
}

export interface AiProxyImageContentBlock {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export type AiProxyContentBlock = AiProxyTextContentBlock | AiProxyImageContentBlock;

export interface AiProxyMessage {
  role: AiProxyMessageRole;
  content: string | AiProxyContentBlock[];
  name?: string;
}

export interface AiProxyRequest {
  provider?: AiProvider;
  model?: string;
  messages: AiProxyMessage[];
  useOwnKey?: boolean;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ExtensionFileUploadAnswerResult {
  id: string;
  model: string;
  provider: AiProvider;
  keySource: 'platform' | 'user';
  choices: unknown[];
  usage?: unknown;
  quota?: unknown;
  fileInfo: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    contentType: 'text' | 'image';
  };
}

export interface AiModelsCatalogPayload {
  providers: ProviderRegistryEntry[];
  models: ProviderModelCatalogEntry[];
  defaultProvider?: AiProvider;
  defaultModel?: string;
  allowedModelTags?: string[];
}

export interface AiProxyTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AiProxyQuotaSnapshot {
  key: string;
  consumed: number;
  limit?: number;
  remaining?: number;
  periodStart: string;
  periodEnd: string;
  decremented: boolean;
}

export interface AiProxyResult {
  requestId: string;
  provider: AiProvider;
  model: string;
  keySource: 'platform' | 'user';
  usage?: AiProxyTokenUsage;
  quota?: AiProxyQuotaSnapshot;
  response: Record<string, unknown>;
}


export interface RemoteConfigPublishRequest {
  versionLabel: string;
  layers: RemoteConfigLayer[];
  actorId: string;
}

export interface RemoteConfigPublishResult {
  versionLabel: string;
  appliedLayerCount: number;
  publishedAt: string;
  actorId: string;
}

export interface RemoteConfigVersionSummary {
  id: string;
  versionLabel: string;
  isActive: boolean;
  publishedAt: string;
  publishedBy?: {
    id: string;
    email: string;
    displayName?: string;
  };
  layers: RemoteConfigLayer[];
}

export interface RemoteConfigSnapshot {
  personaKey: string;
  publishDecision: AccessDecision;
  activeLayers: RemoteConfigLayer[];
  versions: RemoteConfigVersionSummary[];
  previewContext: RemoteConfigContext;
  preview: ResolvedRemoteConfig;
  permissions: string[];
}

export interface RemoteConfigPublishResponse {
  publishResult: RemoteConfigPublishResult;
  preview: ResolvedRemoteConfig;
}

export interface RemoteConfigPreviewRequest {
  layers: RemoteConfigLayer[];
  context: RemoteConfigContext;
}

export interface RemoteConfigActivateVersionRequest {
  versionId: string;
}

export interface RemoteConfigActivateVersionResult {
  version: RemoteConfigVersionSummary;
  activatedAt: string;
}


export interface SupportImpersonationRequest {
  supportActorId: string;
  targetUserId: string;
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

// ─── Wallet / Balance top-up (YooKassa) ────────────────────────────────────

export type WalletTopUpStatus = 'pending' | 'succeeded' | 'canceled' | 'refunded';

export interface WalletBalanceSnapshot {
  currency: string;
  balanceKopecks: number;
  balanceRub: number;
}

export interface WalletTopUpEntry {
  id: string;
  amountKopecks: number;
  amountRub: number;
  currency: string;
  status: WalletTopUpStatus;
  provider: string;
  providerPaymentId: string | null;
  idempotenceKey: string;
  paidAt: string | null;
  createdAt: string;
}

export interface WalletTopUpsPayload {
  items: WalletTopUpEntry[];
}

export interface WalletTopUpCreateRequest {
  amountKopecks: number;
}

export interface WalletTopUpCreateResult {
  topUpId: string;
  confirmationToken: string;
  amountKopecks: number;
  currency: string;
  providerPaymentId: string;
  status: WalletTopUpStatus;
}

// ─── AI History + Analytics ──────────────────────────────────────────────────

export type AiRequestType = 'text' | 'image' | 'file';
export type AiRequestStatus = 'success' | 'error' | 'quota_exceeded';

export interface AiHistoryFileMetadata {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  contentType: 'text' | 'image';
}

export interface AiHistoryAttachment {
  id: string;
  role: 'prompt' | 'response';
  kind: 'image' | 'file';
  mimeType: string;
  originalName?: string | null;
  sizeBytes: number;
  deleted: boolean;
  expired: boolean;
  viewUrl?: string;
  downloadUrl?: string;
}

export interface AiHistoryListItem {
  id: string;
  requestType: AiRequestType;
  provider: string;
  model: string;
  keySource: string;
  status: AiRequestStatus;
  errorCode?: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs?: number | null;
  estimatedCostUsd: number;
  /** Full serialized prompt messages used for timeline preview (without inlined attachment bytes). */
  promptContentJson?: unknown;
  /** Short excerpt of the prompt text (first ~300 chars). */
  promptExcerpt?: string | null;
  /** Short excerpt of the response text (first ~300 chars). */
  responseExcerpt?: string | null;
  fileMetadata?: AiHistoryFileMetadata | null;
  /** Prompt/response attachments metadata (without inlined binary). */
  attachments?: AiHistoryAttachment[];
  occurredAt: string;
  expiresAt?: string | null;
}

export interface AiHistoryDetail extends AiHistoryListItem {
  /** Full serialized prompt messages (from blob storage). */
  promptContentJson?: unknown;
  /** Full serialized provider response (from blob storage). */
  responseContentJson?: unknown;
  attachments?: AiHistoryAttachment[];
}

export interface AiHistoryListFilters {
  requestType?: AiRequestType;
  status?: AiRequestStatus;
  model?: string;
  provider?: string;
  /** ISO date string – lower bound for occurredAt. */
  from?: string;
  /** ISO date string – upper bound for occurredAt. */
  to?: string;
  limit: number;
  offset: number;
}

export interface AiHistoryListResponse {
  items: AiHistoryListItem[];
  total: number;
  filters: AiHistoryListFilters;
}

export interface AiAnalyticsModelBreakdown {
  model: string;
  provider: string;
  displayName?: string;
  requestCount: number;
  successCount?: number;
  failedCount?: number;
  totalPromptTokens?: number;
  totalCompletionTokens?: number;
  totalTokens: number;
  estimatedCostUsd: number;
  avgDurationMs?: number | null;
}

export interface AiAnalyticsSnapshot {
  /** ISO date string of the period start. */
  from: string;
  /** ISO date string of the period end. */
  to: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  /** Model/provider-aware cost estimate in USD. */
  estimatedCostUsd: number;
  avgDurationMs: number | null;
  byModel: AiAnalyticsModelBreakdown[];
}

export interface ModelCatalogDisplayNameEntry {
  modelId: string;
  displayName: string;
}

const MODEL_TOKEN_DISPLAY_OVERRIDES: Record<string, string> = {
  gpt: 'GPT',
  llm: 'LLM',
  llava: 'LLaVA',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
  gemma: 'Gemma',
  claude: 'Claude',
  llama: 'Llama',
  mistral: 'Mistral',
  mixtral: 'Mixtral',
  qwen: 'Qwen',
  nemotron: 'Nemotron',
};

function toModelTokenDisplayName(token: string): string {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return '';

  const override = MODEL_TOKEN_DISPLAY_OVERRIDES[normalized];
  if (override) return override;

  if (/^[a-z]*\d+[a-z\d]*$/i.test(normalized)) {
    return normalized.toUpperCase();
  }

  if (/^[a-z]{1,3}$/i.test(normalized)) {
    return normalized.toUpperCase();
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/** Strip route/provider/variant details and format model IDs for user-facing display. */
export function fallbackModelDisplayName(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) {
    return 'Unknown model';
  }

  const withoutTier = trimmed.split(':')[0] ?? trimmed;
  const segments = withoutTier.split('/').filter(Boolean);
  const modelSegment = segments.length > 1 ? segments.slice(1).join('/') : withoutTier;
  const tokens = modelSegment
    .split(/[-_/.\s]+/)
    .map((token) => toModelTokenDisplayName(token))
    .filter(Boolean);

  return tokens.length > 0 ? tokens.join(' ') : trimmed;
}

/** Resolve displayName from catalog first, then fallback to a readable formatter. */
export function resolveModelDisplayName(
  modelId: string,
  catalog: ModelCatalogDisplayNameEntry[] = [],
): string {
  const normalized = modelId.trim().toLowerCase();
  const normalizedBase = (normalized.split(':')[0] ?? normalized).trim();

  const catalogMatch = catalog.find((entry) => {
    const entryNorm = entry.modelId.trim().toLowerCase();
    const entryBase = (entryNorm.split(':')[0] ?? entryNorm).trim();
    return entryNorm === normalized || entryBase === normalizedBase;
  });

  if (catalogMatch?.displayName?.trim()) {
    return catalogMatch.displayName.trim();
  }

  return fallbackModelDisplayName(modelId);
}

export interface HistoryCleanupJobPayload {
  triggeredAt: string;
}
