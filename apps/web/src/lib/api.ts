import { type SessionPrincipal } from '@quizmind/auth';
import {
  type AccessDecision,
  type ApiRouteDefinition,
  type FeatureFlagDefinition,
  type PlanDefinition,
  type RemoteConfigLayer,
  type SubscriptionSummary,
  type WorkspaceSummary,
} from '@quizmind/contracts';

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
    displayName: string;
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
  publishDecision: AccessDecision;
  permissions: string[];
}

const API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

export const demoPersonas = [
  { key: 'platform-admin', label: 'Platform Admin' },
  { key: 'support-admin', label: 'Support Admin' },
  { key: 'workspace-viewer', label: 'Workspace Viewer' },
] as const;

function withPersona(path: string, persona?: string) {
  if (!persona) {
    return path;
  }

  return `${path}${path.includes('?') ? '&' : '?'}persona=${persona}`;
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

export async function getHealth() {
  return readApiData<HealthSnapshot>('/health');
}

export async function getFoundation() {
  return readApiData<FoundationSnapshot>('/foundation');
}

export async function getSession(persona: string) {
  return readApiData<SessionSnapshot>(withPersona('/auth/me', persona));
}

export async function getWorkspaces(persona: string) {
  return readApiData<WorkspaceListSnapshot>(withPersona('/workspaces', persona));
}

export async function getSubscription(persona: string, workspaceId?: string) {
  const basePath = withPersona('/billing/subscription', persona);
  const path = workspaceId ? `${basePath}&workspaceId=${workspaceId}` : basePath;

  return readApiData<WorkspaceSubscriptionSnapshot>(path);
}

export async function getFeatureFlags(persona: string) {
  return readApiData<FeatureFlagsSnapshot>(withPersona('/admin/feature-flags', persona));
}

export function personaHref(pathname: string, persona: string) {
  return withPersona(pathname, persona);
}

export function resolvePersona(
  searchParams?: Record<string, string | string[] | undefined>,
  fallback = 'platform-admin',
) {
  const rawValue = searchParams?.persona;

  if (Array.isArray(rawValue)) {
    return rawValue[0] ?? fallback;
  }

  return rawValue ?? fallback;
}
