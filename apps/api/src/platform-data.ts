import { type SessionPrincipal } from '@quizmind/auth';
import { databaseSchemas } from '@quizmind/database';
import { listQueueDefinitions } from '@quizmind/queue';
import {
  type AdminUserDirectoryEntry,
  type AuthLoginRequest,
  type AuthSessionPayload,
  type SupportTicketQueueEntry,
} from '@quizmind/contracts';
import { allSystemRoles, permissionRegistry } from '@quizmind/permissions';

import { starterFlags, starterRemoteConfig } from './bootstrap/platform-blueprint';
import { apiModules } from './modules';
import { apiRoutes } from './routes';

export type PersonaKey = 'admin' | 'user';

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
}

const personaCatalog: Record<PersonaKey, DemoPersona> = {
  admin: {
    key: 'admin',
    label: 'Admin',
    notes: [
      'Full platform operator. Access to all admin sections.',
      'Cannot access the user dashboard or product area.',
    ],
    user: {
      id: 'user_admin',
      email: 'admin@quizmind.dev',
      displayName: 'Amina Admin',
    },
    principal: {
      userId: 'user_admin',
      email: 'admin@quizmind.dev',
      systemRoles: ['admin'],
      entitlements: [],
      featureFlags: [],
    },
  },
  user: {
    key: 'user',
    label: 'User',
    notes: [
      'Regular product user. Access to dashboard, billing, usage, and settings.',
      'Cannot access admin sections.',
    ],
    user: {
      id: 'user_regular',
      email: 'owner@quizmind.dev',
      displayName: 'Noah User',
    },
    principal: {
      userId: 'user_regular',
      email: 'owner@quizmind.dev',
      systemRoles: [],
      entitlements: ['feature.text_answering', 'feature.remote_sync'],
      featureFlags: [],
    },
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
    title: 'Wallet & Payments',
    status: 'done',
    description: 'Wallet top-up and YooKassa payment processing for user balance.',
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
    description: 'Single Next.js frontend for user dashboard and admin routes with clean role-based separation.',
  },
  {
    id: 'logging',
    title: 'Total Logging',
    status: 'done',
    description: 'Global HTTP request logging plus audit and security events for sensitive flows.',
  },
] as const;

export function resolvePersonaKey(input?: string): PersonaKey {
  if (input === 'user') {
    return 'user';
  }
  return 'admin';
}

export function getPersona(input?: string): DemoPersona {
  return personaCatalog[resolvePersonaKey(input)];
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
    workspaces: [],
  }));
}

export function listFoundationSupportTickets(): SupportTicketQueueEntry[] {
  const userPersona = getPersona('user');
  const adminPersona = getPersona('admin');

  return [
    {
      id: 'support-ticket-demo-1',
      subject: 'User cannot access billing settings',
      body: 'The account cannot access billing settings and lands on a denial state.',
      status: 'open',
      createdAt: '2026-03-23T10:15:00.000Z',
      updatedAt: '2026-03-23T10:20:00.000Z',
      requester: {
        id: userPersona.user.id,
        email: userPersona.user.email,
        displayName: userPersona.user.displayName,
      },
      timeline: [
        {
          id: 'support-ticket-demo-1:event-1',
          eventType: 'support.ticket_workflow_updated',
          summary: 'assigned the ticket; changed status from open to in progress',
          occurredAt: '2026-03-23T10:22:00.000Z',
          actor: {
            id: adminPersona.user.id,
            email: adminPersona.user.email,
            displayName: adminPersona.user.displayName,
          },
          previousStatus: 'open',
          nextStatus: 'in_progress',
          nextAssignee: {
            id: adminPersona.user.id,
            email: adminPersona.user.email,
            displayName: adminPersona.user.displayName,
          },
          handoffNote: 'Reproducing the billing denial before replying to the requester.',
        },
      ],
    },
    {
      id: 'support-ticket-demo-2',
      subject: 'Need help planning an account upgrade',
      body: 'The user wants support to verify account impact before upgrading the subscription plan.',
      status: 'in_progress',
      createdAt: '2026-03-23T09:30:00.000Z',
      updatedAt: '2026-03-23T09:55:00.000Z',
      requester: {
        id: adminPersona.user.id,
        email: adminPersona.user.email,
        displayName: adminPersona.user.displayName,
      },
      assignedTo: {
        id: adminPersona.user.id,
        email: adminPersona.user.email,
        displayName: adminPersona.user.displayName,
      },
      handoffNote: 'Waiting on final plan-comparison notes before resolving.',
      timeline: [
        {
          id: 'support-ticket-demo-2:event-1',
          eventType: 'support.ticket_workflow_updated',
          summary: 'changed status from open to in progress; updated the handoff note',
          occurredAt: '2026-03-23T09:36:00.000Z',
          actor: {
            id: adminPersona.user.id,
            email: adminPersona.user.email,
            displayName: adminPersona.user.displayName,
          },
          previousStatus: 'open',
          nextStatus: 'in_progress',
          nextAssignee: {
            id: adminPersona.user.id,
            email: adminPersona.user.email,
            displayName: adminPersona.user.displayName,
          },
          handoffNote: 'Waiting on final plan-comparison notes before resolving.',
        },
      ],
    },
  ];
}

export function matchPersonaFromLogin(request: AuthLoginRequest): PersonaKey {
  const normalizedEmail = request.email.toLowerCase();
  // Any non-admin email → user persona; admin email → admin persona
  if (normalizedEmail.includes('admin')) {
    return 'admin';
  }
  return 'user';
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
    },
    permissions: [...permissionRegistry],
    featureFlags: starterFlags,
    remoteConfigLayers: starterRemoteConfig,
    foundationTracks,
    personas: Object.values(personaCatalog).map((persona) => ({
      key: persona.key,
      label: persona.label,
      email: persona.user.email,
      systemRoles: persona.principal.systemRoles,
      notes: persona.notes,
    })),
  };
}
