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
  type ApiRouteDefinition,
  type AdminProviderGovernanceSnapshot,
  type ExtensionBootstrapPayload,
  type ExtensionBootstrapRequest,
  type ExtensionInstallationInventorySnapshot,
  type ProviderCatalogPayload,
  type ProviderCredentialInventory,
  type FeatureFlagDefinition,
  type RemoteConfigLayer,
  type RemoteConfigPublishResponse,
  type RemoteConfigSnapshot,
  type SupportImpersonationHistorySnapshot,
  type SupportTicketQueueFilters,
  type SupportTicketQueueSnapshot,
  type UsageHistoryRequest,
  type UsageEventIngestResult,
  type UsageEventPayload,
  type WorkspaceUsageHistorySnapshot,
  type WorkspaceUsageSnapshot,
  type UserProfilePayload,
  type UserProfileUpdateRequest,
  type WalletBalanceSnapshot,
  type WalletTopUpsPayload,
  type AiHistoryListResponse,
  type AiHistoryDetail,
  type AiAnalyticsSnapshot,
  type AiHistoryListFilters,
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
  permissions: string[];
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
export type AdminExtensionFleetStateSnapshot = AdminExtensionFleetSnapshot;
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
    // In production the public API_URL may include a path prefix (e.g. https://ods.uz/api).
    // Server-side fetch calls append their own paths, so we keep the full URL as-is.
    return WEB_ENV.apiUrl;
  }

  try {
    // Validate it is a well-formed URL. Use the full URL (including any path) so
    // that a value like "http://api:4000" works unchanged as the internal base URL.
    new URL(internalApiUrl);
    return internalApiUrl;
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

export async function getProviderCatalog() {
  return readApiData<ProviderCatalogSnapshot>('/providers/catalog');
}

export async function getProviderCredentialInventory(
  accessToken?: string | null,
) {
  if (!accessToken) {
    return null;
  }

  return readApiData<ProviderCredentialInventorySnapshot>('/providers/credentials', withAccessToken(undefined, accessToken));
}

export async function getAdminProviderGovernance(
  accessToken?: string | null,
) {
  if (!accessToken) {
    return null;
  }

  return readApiData<AdminProviderGovernanceStateSnapshot>('/admin/providers', withAccessToken(undefined, accessToken));
}

export async function getAdminExtensionFleet(
  _persona: string,
  filters?: Partial<AdminExtensionFleetFilters>,
  accessToken?: string | null,
) {
  const basePath = '/admin/installations';
  const path = withQuery(basePath, {
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

export async function getUsageSummary(
  _persona: string,
  accessToken?: string | null,
) {
  return readApiData<UsageSummarySnapshot>('/usage/summary', withAccessToken(undefined, accessToken));
}

export async function getUsageHistory(
  _persona: string,
  request?: Partial<UsageHistoryRequest>,
  accessToken?: string | null,
) {
  const basePath = '/usage/history';
  const path = withQuery(basePath, {
    source: request?.source,
    eventType: request?.eventType,
    installationId: request?.installationId,
    actorId: request?.actorId,
    limit: request?.limit,
  });

  return readApiData<UsageHistorySnapshot>(path, withAccessToken(undefined, accessToken));
}

export async function getExtensionInstallationInventory(
  accessToken?: string | null,
) {
  if (!accessToken) {
    return null;
  }

  return readApiData<ExtensionInstallationInventoryStateSnapshot>('/extension/installations', withAccessToken(undefined, accessToken));
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

export async function getWalletBalance(accessToken: string): Promise<WalletBalanceSnapshot | null> {
  return readApiData<WalletBalanceSnapshot>('/wallet/balance', withAccessToken(undefined, accessToken));
}

export async function getWalletTopUps(accessToken: string): Promise<WalletTopUpsPayload | null> {
  return readApiData<WalletTopUpsPayload>('/wallet/topups', withAccessToken(undefined, accessToken));
}

export async function getAiHistory(
  filters: Partial<AiHistoryListFilters>,
  accessToken?: string | null,
): Promise<AiHistoryListResponse | null> {
  const path = withQuery('/history', {
    limit: filters.limit,
    offset: filters.offset,
    requestType: filters.requestType,
    status: filters.status,
    model: filters.model,
    provider: filters.provider,
    from: filters.from,
    to: filters.to,
  });
  return readApiData<AiHistoryListResponse>(path, withAccessToken(undefined, accessToken));
}

export async function getAiHistoryDetail(
  id: string,
  accessToken?: string | null,
): Promise<AiHistoryDetail | null> {
  return readApiData<AiHistoryDetail>(`/history/${encodeURIComponent(id)}`, withAccessToken(undefined, accessToken));
}

export async function getAiAnalytics(
  filters: { from?: string; to?: string },
  accessToken?: string | null,
): Promise<AiAnalyticsSnapshot | null> {
  const path = withQuery('/analytics/ai', {
    from: filters.from,
    to: filters.to,
  });
  return readApiData<AiAnalyticsSnapshot>(path, withAccessToken(undefined, accessToken));
}

export function personaHref(pathname: string, _persona: string) {
  return pathname;
}

export function resolvePersona(
  _searchParams?: Record<string, string | string[] | undefined>,
  fallback = 'connected-user',
) {
  return fallback;
}
