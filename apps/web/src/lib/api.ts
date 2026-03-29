import { type SessionPrincipal } from '@quizmind/auth';
import {
  type AdminExtensionFleetFilters,
  type AdminExtensionFleetSnapshot,
  type AuthSessionsPayload,
  type AccessDecision,
  type AdminLogsSnapshot,
  type AdminLogFilters,
  type AdminSecuritySnapshot,
  type AdminWebhookFilters,
  type AdminWebhooksSnapshot,
  type AdminUserDirectorySnapshot,
  type AdminUserCreateRequest,
  type AdminUserAccessUpdateRequest,
  type AdminUserMutationResult,
  type CompatibilityRulesSnapshot,
  type BillingAdminPlansPayload,
  type BillingCheckoutResult,
  type BillingInvoicesPayload,
  type BillingPlansPayload,
  type BillingPortalResult,
  type BillingSubscriptionMutationResult,
  type ApiRouteDefinition,
  type AdminProviderGovernanceSnapshot,
  type ExtensionBootstrapPayload,
  type ExtensionBootstrapRequest,
  type ExtensionInstallationInventorySnapshot,
  type ProviderCatalogPayload,
  type ProviderCredentialInventory,
  type FeatureFlagDefinition,
  type PlanDefinition,
  type RemoteConfigLayer,
  type RemoteConfigPublishResponse,
  type RemoteConfigSnapshot,
  type SupportImpersonationHistorySnapshot,
  type SupportTicketQueueFilters,
  type SupportTicketQueueSnapshot,
  type SubscriptionSummary,
  type UsageHistoryRequest,
  type UsageEventIngestResult,
  type UsageEventPayload,
  type WorkspaceUsageHistorySnapshot,
  type WorkspaceUsageSnapshot,
  type WorkspaceSummary,
  type UserProfilePayload,
  type UserProfileUpdateRequest,
  type WalletBalanceSnapshot,
  type WalletTopUpsPayload,
} from '@quizmind/contracts';
import { WEB_ENV } from './web-env';

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
}

export interface HealthSnapshot {
  status: string;
  timestamp: string;
  runtime: {
    nodeEnv: string;
    runtimeMode: string;
    apiUrl: string;
    appUrl: string;
    port: number;
  };
  observability: Record<string, string>;
  infrastructure: Array<{
    service: string;
    status: string;
    url?: string;
    queues?: string[];
  }>;
}

export interface FoundationSnapshot {
  name: string;
  summary: string;
  frameworks: Record<string, string>;
  modules: string[];
  routes: ApiRouteDefinition[];
  queues: string[];
  schemas: Record<string, string[]>;
  roles: {
    system: string[];
    workspace: string[];
  };
  permissions: string[];
  plans: PlanDefinition[];
  featureFlags: FeatureFlagDefinition[];
  remoteConfigLayers: RemoteConfigLayer[];
  foundationTracks: Array<{
    id: string;
    title: string;
    status: string;
    description: string;
  }>;
  personas: Array<{
    key: string;
    label: string;
    email: string;
    systemRoles: string[];
    workspaceMemberships: Array<{ workspaceId: string; role: string }>;
    notes: string[];
  }>;
  runtime: {
    apiUrl: string;
    appUrl: string;
    mode: string;
  };
}

export interface SessionSnapshot {
  personaKey: string;
  personaLabel: string;
  notes: string[];
  user: {
    id: string;
    email: string;
    displayName?: string | null;
    emailVerifiedAt?: string | null;
  };
  principal: SessionPrincipal;
  workspaces: WorkspaceSummary[];
  permissions: string[];
}

export interface WorkspaceListSnapshot {
  personaKey: string;
  items: WorkspaceSummary[];
}

export interface WorkspaceSubscriptionSnapshot {
  workspace: WorkspaceSummary;
  accessDecision: AccessDecision;
  summary: SubscriptionSummary;
}

export interface FeatureFlagsSnapshot {
  personaKey: string;
  flags: FeatureFlagDefinition[];
  writeDecision: AccessDecision;
  permissions: string[];
}

export type SupportImpersonationSnapshot = SupportImpersonationHistorySnapshot;
export type SupportTicketsSnapshot = SupportTicketQueueSnapshot;
export type AdminLogsStateSnapshot = AdminLogsSnapshot;
export type AdminSecurityStateSnapshot = AdminSecuritySnapshot;
export type AdminWebhooksStateSnapshot = AdminWebhooksSnapshot;
export type AdminUsersSnapshot = AdminUserDirectorySnapshot;
export type CompatibilityRulesStateSnapshot = CompatibilityRulesSnapshot;
export type AuthSessionsSnapshot = AuthSessionsPayload;
export type BillingPlansSnapshot = BillingPlansPayload;
export type AdminBillingPlansSnapshot = BillingAdminPlansPayload;
export type AdminExtensionFleetStateSnapshot = AdminExtensionFleetSnapshot;
export type BillingInvoicesSnapshot = BillingInvoicesPayload;
export type BillingCheckoutSnapshot = BillingCheckoutResult;
export type BillingPortalSnapshot = BillingPortalResult;
export type BillingSubscriptionMutationSnapshot = BillingSubscriptionMutationResult;
export type UsageSummarySnapshot = WorkspaceUsageSnapshot;
export type UsageHistorySnapshot = WorkspaceUsageHistorySnapshot;
export type UsageEventIngestSnapshot = UsageEventIngestResult;
export type RemoteConfigStateSnapshot = RemoteConfigSnapshot;
export type RemoteConfigPublishStateSnapshot = RemoteConfigPublishResponse;
export type ExtensionBootstrapSnapshot = ExtensionBootstrapPayload;
export type ExtensionInstallationInventoryStateSnapshot = ExtensionInstallationInventorySnapshot;
export type ProviderCatalogSnapshot = ProviderCatalogPayload;
export type ProviderCredentialInventorySnapshot = ProviderCredentialInventory;
export type AdminProviderGovernanceStateSnapshot = AdminProviderGovernanceSnapshot;
export type UserProfileSnapshot = UserProfilePayload;
export type AdminUserCreateMutationSnapshot = AdminUserMutationResult;
export type AdminUserAccessUpdateMutationSnapshot = AdminUserMutationResult;

function resolveApiUrl(): string {
  const internalApiUrl = process.env.API_INTERNAL_URL?.trim();

  if (!internalApiUrl) {
    return WEB_ENV.apiUrl;
  }

  try {
    const parsedUrl = new URL(internalApiUrl);
    return parsedUrl.origin;
  } catch {
    throw new Error('Invalid web environment: API_INTERNAL_URL must be a valid absolute URL.');
  }
}

export const API_URL = resolveApiUrl();

function withQuery(path: string, query?: Record<string, string | number | undefined | null>) {
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    params.set(key, String(value));
  }

  if (params.size === 0) {
    return path;
  }

  return `${path}${path.includes('?') ? '&' : '?'}${params.toString()}`;
}

async function readApiData<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiEnvelope<T>;

    return payload.ok ? payload.data : null;
  } catch {
    return null;
  }
}

async function writeApiData<T>(path: string, body: unknown, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      ...init,
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiEnvelope<T>;

    return payload.ok ? payload.data : null;
  } catch {
    return null;
  }
}

export async function getHealth() {
  return readApiData<HealthSnapshot>('/health');
}

export async function getFoundation() {
  return readApiData<FoundationSnapshot>('/foundation');
}

function withAccessToken(init: RequestInit | undefined, accessToken?: string | null): RequestInit | undefined {
  if (!accessToken) {
    return init;
  }

  return {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${accessToken}`,
    },
  };
}

export async function getSession(_persona: string, accessToken?: string | null) {
  return readApiData<SessionSnapshot>('/auth/me', withAccessToken(undefined, accessToken));
}

export async function getUserProfile(accessToken?: string | null) {
  if (!accessToken) {
    return null;
  }

  return readApiData<UserProfileSnapshot>('/user/profile', withAccessToken(undefined, accessToken));
}

export async function updateUserProfile(
  request: Partial<UserProfileUpdateRequest>,
  accessToken?: string | null,
) {
  if (!accessToken) {
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/user/profile`, {
      method: 'PATCH',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiEnvelope<UserProfileSnapshot>;

    return payload.ok ? payload.data : null;
  } catch {
    return null;
  }
}

export async function getAuthSessions(accessToken?: string | null) {
  if (!accessToken) {
    return null;
  }

  return readApiData<AuthSessionsSnapshot>('/auth/sessions', withAccessToken(undefined, accessToken));
}

export async function getWorkspaces(_persona: string, accessToken?: string | null) {
  return readApiData<WorkspaceListSnapshot>('/workspaces', withAccessToken(undefined, accessToken));
}

export async function getSubscription(_persona: string, workspaceId?: string, accessToken?: string | null) {
  const basePath = '/billing/subscription';
  const path = workspaceId
    ? `${basePath}${basePath.includes('?') ? '&' : '?'}workspaceId=${workspaceId}`
    : basePath;

  return readApiData<WorkspaceSubscriptionSnapshot>(
    path,
    withAccessToken(undefined, accessToken),
  );
}

export async function getBillingPlans() {
  return readApiData<BillingPlansSnapshot>('/billing/plans');
}

export async function getProviderCatalog() {
  return readApiData<ProviderCatalogSnapshot>('/providers/catalog');
}

export async function getProviderCredentialInventory(
  workspaceId?: string,
  accessToken?: string | null,
) {
  if (!accessToken) {
    return null;
  }

  const path = withQuery('/providers/credentials', {
    workspaceId,
  });

  return readApiData<ProviderCredentialInventorySnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getAdminProviderGovernance(
  workspaceId?: string,
  accessToken?: string | null,
) {
  if (!accessToken) {
    return null;
  }

  const path = withQuery('/admin/providers', {
    workspaceId,
  });

  return readApiData<AdminProviderGovernanceStateSnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getAdminPlans(accessToken?: string | null) {
  if (!accessToken) {
    return null;
  }

  return readApiData<AdminBillingPlansSnapshot>('/admin/plans', withAccessToken(undefined, accessToken));
}

export async function getAdminExtensionFleet(
  _persona: string,
  filters?: Partial<AdminExtensionFleetFilters>,
  accessToken?: string | null,
) {
  const basePath = '/admin/installations';
  const path = withQuery(basePath, {
    workspaceId: filters?.workspaceId,
    installationId: filters?.installationId,
    compatibility: filters?.compatibility,
    connection: filters?.connection,
    search: filters?.search,
    limit: filters?.limit,
  });

  return readApiData<AdminExtensionFleetStateSnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getCompatibilityRules(_persona: string, accessToken?: string | null) {
  return readApiData<CompatibilityRulesStateSnapshot>(
    '/admin/compatibility',
    withAccessToken(undefined, accessToken),
  );
}

export async function getBillingInvoices(workspaceId: string, accessToken?: string | null) {
  const path = withQuery('/billing/invoices', {
    workspaceId,
  });

  return readApiData<BillingInvoicesSnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getUsageSummary(
  _persona: string,
  workspaceId?: string,
  accessToken?: string | null,
) {
  const basePath = '/usage/summary';
  const path = withQuery(basePath, {
    workspaceId,
  });

  return readApiData<UsageSummarySnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getUsageHistory(
  _persona: string,
  request?: Partial<UsageHistoryRequest>,
  accessToken?: string | null,
) {
  const basePath = '/usage/history';
  const path = withQuery(basePath, {
    workspaceId: request?.workspaceId,
    source: request?.source,
    eventType: request?.eventType,
    installationId: request?.installationId,
    actorId: request?.actorId,
    limit: request?.limit,
  });

  return readApiData<UsageHistorySnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getExtensionInstallationInventory(
  workspaceId?: string,
  accessToken?: string | null,
) {
  if (!accessToken) {
    return null;
  }

  const path = withQuery('/extension/installations', {
    workspaceId,
  });

  return readApiData<ExtensionInstallationInventoryStateSnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getFeatureFlags(_persona: string, accessToken?: string | null) {
  return readApiData<FeatureFlagsSnapshot>(
    '/admin/feature-flags',
    withAccessToken(undefined, accessToken),
  );
}

export async function getRemoteConfigState(
  _persona: string,
  workspaceId?: string,
  accessToken?: string | null,
) {
  const basePath = '/admin/remote-config';
  const path = withQuery(basePath, {
    workspaceId,
  });

  return readApiData<RemoteConfigStateSnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function simulateExtensionBootstrap(
  request: ExtensionBootstrapRequest,
  accessToken?: string | null,
) {
  return writeApiData<ExtensionBootstrapSnapshot>(
    '/extension/bootstrap',
    request,
    withAccessToken(undefined, accessToken),
  );
}

export async function ingestUsageEvent(
  request: UsageEventPayload,
  accessToken?: string | null,
) {
  return writeApiData<UsageEventIngestSnapshot>(
    '/extension/usage-events',
    request,
    withAccessToken(undefined, accessToken),
  );
}

export async function getAdminUsers(_persona: string, accessToken?: string | null) {
  return readApiData<AdminUsersSnapshot>('/admin/users', withAccessToken(undefined, accessToken));
}

export async function createAdminUser(
  request: AdminUserCreateRequest,
  accessToken?: string | null,
) {
  if (!accessToken) {
    return null;
  }

  return writeApiData<AdminUserCreateMutationSnapshot>(
    '/admin/users/create',
    request,
    withAccessToken(undefined, accessToken),
  );
}

export async function updateAdminUserAccess(
  request: AdminUserAccessUpdateRequest,
  accessToken?: string | null,
) {
  if (!accessToken) {
    return null;
  }

  return writeApiData<AdminUserAccessUpdateMutationSnapshot>(
    '/admin/users/update-access',
    request,
    withAccessToken(undefined, accessToken),
  );
}

export async function getAdminLogs(
  _persona: string,
  filters?: Partial<AdminLogFilters>,
  accessToken?: string | null,
) {
  const basePath = '/admin/logs';
  const path = withQuery(basePath, {
    workspaceId: filters?.workspaceId,
    stream: filters?.stream,
    severity: filters?.severity,
    search: filters?.search,
    limit: filters?.limit,
  });

  return readApiData<AdminLogsStateSnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getAdminSecurity(
  _persona: string,
  filters?: Partial<AdminLogFilters>,
  accessToken?: string | null,
) {
  const basePath = '/admin/security';
  const path = withQuery(basePath, {
    workspaceId: filters?.workspaceId,
    severity: filters?.severity,
    search: filters?.search,
    limit: filters?.limit,
  });

  return readApiData<AdminSecurityStateSnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getAdminWebhooks(
  _persona: string,
  filters?: Partial<AdminWebhookFilters>,
  accessToken?: string | null,
) {
  const basePath = '/admin/webhooks';
  const path = withQuery(basePath, {
    provider: filters?.provider,
    status: filters?.status,
    search: filters?.search,
    limit: filters?.limit,
  });

  return readApiData<AdminWebhooksStateSnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getSupportImpersonationSessions(_persona: string, accessToken?: string | null) {
  return readApiData<SupportImpersonationSnapshot>(
    '/support/impersonation-sessions',
    withAccessToken(undefined, accessToken),
  );
}

export async function getSupportTickets(
  _persona: string,
  accessToken?: string | null,
  filters?: Partial<SupportTicketQueueFilters>,
) {
  const basePath = '/support/tickets';
  const path = withQuery(basePath, {
    preset: filters?.preset,
    status: filters?.status,
    ownership: filters?.ownership,
    search: filters?.search,
    limit: filters?.limit,
    timelineLimit: filters?.timelineLimit,
  });

  return readApiData<SupportTicketsSnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getWalletBalance(workspaceId: string, accessToken: string): Promise<WalletBalanceSnapshot | null> {
  const path = withQuery('/wallet/balance', { workspaceId });

  return readApiData<WalletBalanceSnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getWalletTopUps(workspaceId: string, accessToken: string): Promise<WalletTopUpsPayload | null> {
  const path = withQuery('/wallet/topups', { workspaceId });

  return readApiData<WalletTopUpsPayload>(path, withAccessToken(undefined, accessToken));
}

export function personaHref(pathname: string, persona: string) {
  return withPersona(pathname, persona);
}

export function resolvePersona(
  _searchParams?: Record<string, string | string[] | undefined>,
  fallback = 'connected-user',
) {
  return fallback;
}
