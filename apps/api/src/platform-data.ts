import { type SessionPrincipal } from '@quizmind/auth';
import { databaseSchemas } from '@quizmind/database';
import { listQueueDefinitions } from '@quizmind/queue';
import {
  type AdminUserDirectoryEntry,
  type AuthLoginRequest,
  type AuthSessionPayload,
  type SupportTicketQueueEntry,
  type WorkspaceSummary,
} from '@quizmind/contracts';
import { allSystemRoles, allWorkspaceRoles, permissionRegistry } from '@quizmind/permissions';

import { starterFlags, starterPlans, starterRemoteConfig } from './bootstrap/platform-blueprint';
import { apiModules } from './modules';
import { apiRoutes } from './routes';

export type PersonaKey = 'platform-admin' | 'support-admin' | 'workspace-viewer';

interface DemoUser {
  id: string;
  email: string;
  displayName: string;
}

export interface DemoPersona {
  key: PersonaKey;
  label: string;
  notes: string[];
  user: DemoUser;
  principal: SessionPrincipal;
  preferredWorkspaceId: string;
}

export const demoWorkspaces: WorkspaceSummary[] = [
  {
    id: 'ws_alpha',
    slug: 'acme-learning',
    name: 'Acme Learning',
    role: 'workspace_owner',
  },
  {
    id: 'ws_beta',
    slug: 'northwind-education',
    name: 'Northwind Education',
    role: 'workspace_admin',
  },
];

const personaCatalog: Record<PersonaKey, DemoPersona> = {
  'platform-admin': {
    key: 'platform-admin',
    label: 'Platform Admin',
    notes: [
      'Owns product rollout, billing visibility, and control-plane publishing.',
      'Sees both /app and /admin sections.',
    ],
    user: {
      id: 'user_platform_admin',
      email: 'admin@quizmind.dev',
      displayName: 'Amina Platform',
    },
    principal: {
      userId: 'user_platform_admin',
      email: 'admin@quizmind.dev',
      systemRoles: ['platform_admin'],
      workspaceMemberships: [
        { workspaceId: 'ws_alpha', role: 'workspace_owner' },
        { workspaceId: 'ws_beta', role: 'workspace_admin' },
      ],
      entitlements: [
        'feature.text_answering',
        'feature.screenshot_answering',
        'feature.remote_sync',
        'limit.requests_per_day',
      ],
      featureFlags: ['beta.remote-config-v2', 'ops.force-upgrade-banner'],
    },
    preferredWorkspaceId: 'ws_alpha',
  },
  'support-admin': {
    key: 'support-admin',
    label: 'Support Admin',
    notes: [
      'Can read users, workspaces, and audit history, plus start impersonation.',
      'Does not get publish rights for remote config.',
    ],
    user: {
      id: 'user_support_admin',
      email: 'support@quizmind.dev',
      displayName: 'Mila Support',
    },
    principal: {
      userId: 'user_support_admin',
      email: 'support@quizmind.dev',
      systemRoles: ['support_admin'],
      workspaceMemberships: [{ workspaceId: 'ws_alpha', role: 'workspace_viewer' }],
      entitlements: ['feature.text_answering', 'feature.remote_sync'],
      featureFlags: ['ops.force-upgrade-banner'],
    },
    preferredWorkspaceId: 'ws_alpha',
  },
  'workspace-viewer': {
    key: 'workspace-viewer',
    label: 'Workspace Viewer',
    notes: [
      'Can access overview-only dashboard data for a workspace.',
      'Used to demonstrate route gating on /admin and limited billing access.',
    ],
    user: {
      id: 'user_workspace_viewer',
      email: 'viewer@quizmind.dev',
      displayName: 'Noah Viewer',
    },
    principal: {
      userId: 'user_workspace_viewer',
      email: 'viewer@quizmind.dev',
      systemRoles: [],
      workspaceMemberships: [{ workspaceId: 'ws_alpha', role: 'workspace_viewer' }],
      entitlements: ['feature.text_answering'],
      featureFlags: [],
    },
    preferredWorkspaceId: 'ws_alpha',
  },
};

export const foundationTracks = [
  {
    id: 'monorepo',
    title: 'Monorepo Foundation',
    status: 'done',
    description: 'Workspace wiring for web, api, worker, contracts, permissions, auth, billing, config, logger, database, and ui.',
  },
  {
    id: 'backend',
    title: 'Backend Foundation',
    status: 'done',
    description: 'NestJS API surface for auth, workspaces, billing, extension bootstrap, support tooling, and health.',
  },
  {
    id: 'database',
    title: 'Data Model',
    status: 'done',
    description: 'Prisma schema centered on users, workspaces, subscriptions, entitlements, compatibility, and logs.',
  },
  {
    id: 'access',
    title: 'RBAC + ABAC',
    status: 'done',
    description: 'Permission registry plus workspace-aware access evaluation and entitlement checks.',
  },
  {
    id: 'billing',
    title: 'Billing Engine',
    status: 'done',
    description: 'Plan and entitlement resolution for free and pro workspace states.',
  },
  {
    id: 'control-plane',
    title: 'Remote Config',
    status: 'done',
    description: 'Compatibility policy, feature flags, remote config layers, and publish preview flow.',
  },
  {
    id: 'web',
    title: 'Unified Web App',
    status: 'done',
    description: 'Single Next.js frontend for landing, dashboard, and admin routes with persona-based gating.',
  },
  {
    id: 'logging',
    title: 'Total Logging',
    status: 'done',
    description: 'Global HTTP request logging plus audit and security events for sensitive flows.',
  },
] as const;

export function resolvePersonaKey(input?: string): PersonaKey {
  if (input === 'support-admin' || input === 'workspace-viewer' || input === 'platform-admin') {
    return input;
  }

  return 'platform-admin';
}

export function getPersona(input?: string): DemoPersona {
  return personaCatalog[resolvePersonaKey(input)];
}

export function getAccessibleWorkspaces(persona: DemoPersona): WorkspaceSummary[] {
  const roleByWorkspaceId = new Map(
    persona.principal.workspaceMemberships.map((membership) => [membership.workspaceId, membership.role]),
  );

  return demoWorkspaces
    .filter((workspace) => roleByWorkspaceId.has(workspace.id))
    .map((workspace) => ({
      ...workspace,
      role: roleByWorkspaceId.get(workspace.id) ?? workspace.role,
    }));
}

export function getWorkspaceSummary(workspaceId?: string): WorkspaceSummary {
  return (
    demoWorkspaces.find((workspace) => workspace.id === workspaceId) ??
    demoWorkspaces[0]
  );
}

export function getPlanForWorkspace(workspaceId: string) {
  return workspaceId === 'ws_beta' ? starterPlans[0] : starterPlans[1];
}

export function buildAuthSession(persona: DemoPersona): AuthSessionPayload {
  return {
    accessToken: `access_${persona.key}`,
    refreshToken: `refresh_${persona.key}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    user: {
      id: persona.user.id,
      email: persona.user.email,
      displayName: persona.user.displayName,
      systemRoles: persona.principal.systemRoles,
    },
  };
}

export function listFoundationUsers(): AdminUserDirectoryEntry[] {
  return Object.values(personaCatalog).map((persona, index) => ({
    id: persona.user.id,
    email: persona.user.email,
    displayName: persona.user.displayName,
    emailVerifiedAt: '2026-03-23T08:00:00.000Z',
    suspendedAt: null,
    lastLoginAt: new Date(Date.UTC(2026, 2, 23, 10 + index, 0, 0)).toISOString(),
    systemRoles: persona.principal.systemRoles,
    workspaces: getAccessibleWorkspaces(persona).map((workspace) => ({
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      workspaceName: workspace.name,
      role: workspace.role,
    })),
  }));
}

export function listFoundationSupportTickets(): SupportTicketQueueEntry[] {
  const viewerPersona = getPersona('workspace-viewer');
  const platformPersona = getPersona('platform-admin');
  const workspace = getWorkspaceSummary('ws_alpha');

  return [
    {
      id: 'support-ticket-demo-1',
      subject: 'Viewer cannot access billing settings',
      body: 'The workspace viewer can open the product but lands on a denial state in billing settings.',
      status: 'open',
      createdAt: '2026-03-23T10:15:00.000Z',
      updatedAt: '2026-03-23T10:20:00.000Z',
      requester: {
        id: viewerPersona.user.id,
        email: viewerPersona.user.email,
        displayName: viewerPersona.user.displayName,
      },
      workspace: {
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
      },
    },
    {
      id: 'support-ticket-demo-2',
      subject: 'Need help planning a workspace upgrade',
      body: 'The admin wants support to verify workspace impact before upgrading the subscription plan.',
      status: 'in_progress',
      createdAt: '2026-03-23T09:30:00.000Z',
      updatedAt: '2026-03-23T09:55:00.000Z',
      requester: {
        id: platformPersona.user.id,
        email: platformPersona.user.email,
        displayName: platformPersona.user.displayName,
      },
      workspace: {
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
      },
    },
  ];
}

export function matchPersonaFromLogin(request: AuthLoginRequest): PersonaKey {
  const normalizedEmail = request.email.toLowerCase();

  if (normalizedEmail.includes('support')) {
    return 'support-admin';
  }

  if (normalizedEmail.includes('viewer')) {
    return 'workspace-viewer';
  }

  return 'platform-admin';
}

export function getFoundationOverview() {
  return {
    name: 'QuizMind Platform',
    summary: 'Control-plane foundation for auth, billing, access, remote config, compatibility, and support operations.',
    frameworks: {
      api: 'NestJS',
      web: 'Next.js App Router',
      worker: 'BullMQ-ready worker runtime',
    },
    modules: apiModules,
    routes: apiRoutes,
    queues: listQueueDefinitions(),
    schemas: databaseSchemas,
    roles: {
      system: allSystemRoles,
      workspace: allWorkspaceRoles,
    },
    permissions: [...permissionRegistry],
    plans: starterPlans,
    featureFlags: starterFlags,
    remoteConfigLayers: starterRemoteConfig,
    foundationTracks,
    personas: Object.values(personaCatalog).map((persona) => ({
      key: persona.key,
      label: persona.label,
      email: persona.user.email,
      systemRoles: persona.principal.systemRoles,
      workspaceMemberships: persona.principal.workspaceMemberships,
      notes: persona.notes,
    })),
  };
}
