import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PlatformService } from '../src/platform.service';
import { type CurrentSessionSnapshot } from '../src/auth/auth.types';
import { type UserRepository } from '../src/auth/repositories/user.repository';
import { type BillingWebhookRepository } from '../src/billing/billing-webhook.repository';
import { type SubscriptionRepository } from '../src/billing/subscription.repository';
import { type ExtensionCompatibilityRepository } from '../src/extension/extension-compatibility.repository';
import { type ExtensionInstallationRepository } from '../src/extension/extension-installation.repository';
import { type ExtensionInstallationSessionRepository } from '../src/extension/extension-installation-session.repository';
import { type FeatureFlagRepository } from '../src/feature-flags/feature-flag.repository';
import { type AdminLogRepository } from '../src/logs/admin-log.repository';
import { type QueueDispatchService } from '../src/queue/queue-dispatch.service';
import { type RemoteConfigRepository } from '../src/remote-config/remote-config.repository';
import { type InfrastructureHealthService } from '../src/services/infrastructure-health-service';
import { type SupportImpersonationRepository } from '../src/support/support-impersonation.repository';
import { type SupportTicketPresetFavoriteRepository } from '../src/support/support-ticket-preset-favorite.repository';
import { type SupportTicketRepository } from '../src/support/support-ticket.repository';
import { type UsageRepository } from '../src/usage/usage.repository';
import { type WorkspaceRepository } from '../src/workspaces/workspace.repository';
import { type AiHistoryService } from '../src/history/ai-history.service';
import { type RetentionSettingsService } from '../src/settings/retention-settings.service';

function createPlatformService() {
  const infrastructureHealthService = {} as InfrastructureHealthService;
  const subscriptionRepository = {} as SubscriptionRepository;
  const extensionCompatibilityRepository = {} as ExtensionCompatibilityRepository;
  const extensionInstallationRepository = {} as ExtensionInstallationRepository;
  const extensionInstallationSessionRepository = {} as ExtensionInstallationSessionRepository;
  const featureFlagRepository = {} as FeatureFlagRepository;
  const adminLogRepository = {} as AdminLogRepository;
  const billingWebhookRepository = {} as BillingWebhookRepository;
  const remoteConfigRepository = {} as RemoteConfigRepository;
  const workspaceRepository = {} as WorkspaceRepository;
  const userRepository = {} as UserRepository;
  const supportTicketRepository = {} as SupportTicketRepository;
  const supportTicketPresetFavoriteRepository = {} as SupportTicketPresetFavoriteRepository;
  const supportImpersonationRepository = {} as SupportImpersonationRepository;
  const usageRepository: Partial<UsageRepository> = {
    listInstallationsByWorkspaceId: async () => [] as any,
    listQuotaCountersByWorkspaceId: async () => [] as any,
    listRecentTelemetryByWorkspaceId: async () => [] as any,
    listTelemetryHistoryByWorkspaceId: async () => [] as any,
    listRecentActivityByWorkspaceId: async () => [] as any,
    listActivityHistoryByWorkspaceId: async () => [] as any,
    listRecentAiRequestsByWorkspaceId: async () => [] as any,
    listAiRequestHistoryByWorkspaceId: async () => [] as any,
  };
  const queueDispatchService = {
    dispatch: async (request: any) => ({
      id: request.jobId ?? `${request.queue}:${request.dedupeKey ?? 'test'}`,
      queue: request.queue,
      payload: request.payload,
      dedupeKey: request.dedupeKey,
      createdAt: request.createdAt ?? '2026-03-23T12:30:00.000Z',
      attempts: request.attempts ?? 1,
    }),
  } as QueueDispatchService;
  const aiHistoryService = {} as AiHistoryService;
  const retentionSettingsService = {
    getRetentionPolicy: async () => ({ policy: {} }),
    updateRetentionPolicy: async () => ({ policy: {} }),
  } as unknown as RetentionSettingsService;
  const service = new PlatformService(
    infrastructureHealthService,
    subscriptionRepository,
    extensionCompatibilityRepository,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
    featureFlagRepository,
    adminLogRepository,
    billingWebhookRepository,
    remoteConfigRepository,
    workspaceRepository,
    userRepository,
    supportTicketRepository,
    supportTicketPresetFavoriteRepository,
    supportImpersonationRepository,
    usageRepository as UsageRepository,
    queueDispatchService,
    aiHistoryService,
    retentionSettingsService,
  );

  return {
    service,
    subscriptionRepository,
    extensionCompatibilityRepository,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
    featureFlagRepository,
    adminLogRepository,
    billingWebhookRepository,
    remoteConfigRepository,
    workspaceRepository,
    userRepository,
    supportTicketRepository,
    supportTicketPresetFavoriteRepository,
    supportImpersonationRepository,
    usageRepository: usageRepository as UsageRepository,
    queueDispatchService,
  };
}

test('PlatformService.getReady returns ready when connected runtime has healthy dependencies', async () => {
  const { service } = createPlatformService();
  const platformService = service as any;

  platformService.env.runtimeMode = 'connected';
  platformService.getHealth = async () => ({
    timestamp: '2026-03-27T12:00:00.000Z',
    configuration: {
      validationIssues: [],
    },
    infrastructure: [
      {
        service: 'postgres',
        status: 'reachable',
      },
      {
        service: 'redis',
        status: 'reachable',
      },
      {
        service: 'postgres_schema',
        status: 'reachable',
      },
    ],
  });

  const readiness = await service.getReady();

  assert.equal(readiness.status, 'ready');
  assert.deepEqual(readiness.checks, {
    runtimeConnected: true,
    validationIssues: true,
    postgresReachable: true,
    postgresSchemaReady: true,
    redisReachable: true,
  });
  assert.deepEqual(readiness.validationIssues, []);
  assert.deepEqual(readiness.failures, []);
});

test('PlatformService.getReady surfaces all failing checks when runtime is not ready', async () => {
  const { service } = createPlatformService();
  const platformService = service as any;

  platformService.env.runtimeMode = 'mock';
  platformService.getHealth = async () => ({
    timestamp: '2026-03-27T12:00:00.000Z',
    configuration: {
      validationIssues: [{ key: 'JWT_SECRET', message: 'JWT_SECRET must be set.' }],
    },
    infrastructure: [
      {
        service: 'postgres',
        status: 'unreachable',
        error: 'connect ECONNREFUSED',
      },
      {
        service: 'redis',
        status: 'unreachable',
      },
      {
        service: 'postgres_schema',
        status: 'unreachable',
        error: 'Required tables are missing: _prisma_migrations, User, Workspace.',
      },
    ],
  });

  const readiness = await service.getReady();

  assert.equal(readiness.status, 'not_ready');
  assert.deepEqual(readiness.checks, {
    runtimeConnected: false,
    validationIssues: false,
    postgresReachable: false,
    postgresSchemaReady: false,
    redisReachable: false,
  });
  assert.equal(readiness.failures.length, 5);
  assert.deepEqual(
    readiness.failures.map((failure) => failure.key),
    ['runtime_mode', 'configuration', 'postgres', 'postgres_schema', 'redis'],
  );
  assert.equal(readiness.failures[2]?.message, 'connect ECONNREFUSED');
  assert.equal(
    readiness.failures[3]?.message,
    'Required tables are missing: _prisma_migrations, User, Workspace.',
  );
  assert.equal(readiness.failures[4]?.message, 'Redis is not reachable.');
});

function createInstallationAdminSessionSnapshot(): CurrentSessionSnapshot {
  const session = createConnectedSessionSnapshot();

  return {
    ...session,
    permissions: ['installations:read', 'installations:write', 'workspaces:read'],
  };
}

function createInstallationReadOnlySessionSnapshot(): CurrentSessionSnapshot {
  const session = createConnectedSessionSnapshot();

  return {
    ...session,
    principal: {
      ...session.principal,
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_viewer' }],
    },
    workspaces: [
      {
        ...session.workspaces[0],
        role: 'workspace_viewer',
      },
    ],
    permissions: ['installations:read', 'workspaces:read'],
  };
}

function createInstallationRestrictedSessionSnapshot(): CurrentSessionSnapshot {
  const session = createConnectedSessionSnapshot();

  return {
    ...session,
    principal: {
      ...session.principal,
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_member' }],
    },
    workspaces: [
      {
        ...session.workspaces[0],
        role: 'workspace_member',
      },
    ],
    permissions: ['workspaces:read'],
  };
}

function createConnectedSessionSnapshot(): CurrentSessionSnapshot {
  return {
    personaKey: 'connected-user',
    personaLabel: 'Connected User',
    notes: ['Resolved from a Prisma-backed session in connected runtime mode.'],
    user: {
      id: 'user_1',
      email: 'owner@quizmind.dev',
      displayName: 'Workspace Owner',
      emailVerifiedAt: '2026-03-23T08:00:00.000Z',
    },
    principal: {
      userId: 'user_1',
      email: 'owner@quizmind.dev',
      systemRoles: [],
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_owner' }],
      entitlements: [],
      featureFlags: [],
    },
    workspaces: [
      {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
        role: 'workspace_owner',
      },
    ],
    permissions: ['workspaces:read', 'subscriptions:read'],
  };
}

function createAuditLogsSessionSnapshot(): CurrentSessionSnapshot {
  const session = createConnectedSessionSnapshot();

  return {
    ...session,
    principal: {
      ...session.principal,
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_analyst' }],
    },
    workspaces: [
      {
        ...session.workspaces[0],
        role: 'workspace_analyst',
      },
    ],
    permissions: ['audit_logs:read'],
  };
}

function createAuditLogExportSessionSnapshot(): CurrentSessionSnapshot {
  const session = createConnectedSessionSnapshot();

  return {
    ...session,
    principal: {
      ...session.principal,
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_security_manager' }],
    },
    workspaces: [
      {
        ...session.workspaces[0],
        role: 'workspace_security_manager',
      },
    ],
    permissions: ['audit_logs:read', 'audit_logs:export'],
  };
}

function createWebhookJobsSessionSnapshot(): CurrentSessionSnapshot {
  const session = createConnectedSessionSnapshot();

  return {
    ...session,
    principal: {
      ...session.principal,
      systemRoles: ['admin'],
    },
    permissions: ['jobs:read', 'jobs:retry'],
  };
}

function createUsageRestrictedSessionSnapshot(): CurrentSessionSnapshot {
  const session = createConnectedSessionSnapshot();

  return {
    ...session,
    principal: {
      ...session.principal,
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_viewer' }],
    },
    workspaces: [
      {
        ...session.workspaces[0],
        role: 'workspace_viewer',
      },
    ],
    permissions: ['workspaces:read'],
  };
}

function createUsageExportSessionSnapshot(): CurrentSessionSnapshot {
  const session = createConnectedSessionSnapshot();

  return {
    ...session,
    principal: {
      ...session.principal,
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_analyst' }],
    },
    workspaces: [
      {
        ...session.workspaces[0],
        role: 'workspace_analyst',
      },
    ],
    permissions: ['usage:read', 'usage:export', 'subscriptions:read'],
  };
}

function createUsageSubscriptionRecord() {
  return {
    planId: 'plan_pro',
    status: 'active',
    billingInterval: 'monthly',
    cancelAtPeriodEnd: false,
    seatCount: 5,
    currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
    plan: {
      id: 'plan_pro',
      code: 'pro',
      name: 'Pro',
      description: 'Production tier',
      entitlements: [
        { key: 'feature.text_answering', enabled: true, limitValue: null },
        { key: 'limit.requests_per_day', enabled: true, limitValue: 500 },
      ],
    },
    workspace: {
      entitlementOverrides: [],
    },
  } as any;
}

function createConnectedUserRecord(overrides?: Record<string, unknown>) {
  return {
    id: 'user_1',
    email: 'owner@quizmind.dev',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    emailVerifiedAt: new Date('2026-03-23T08:00:00.000Z'),
    displayName: 'Workspace Owner',
    avatarUrl: 'https://cdn.quizmind.dev/avatar.png',
    locale: 'en-US',
    timezone: 'UTC',
    suspendedAt: null,
    suspendReason: null,
    lastLoginAt: new Date('2026-03-24T08:00:00.000Z'),
    createdAt: new Date('2026-03-20T08:00:00.000Z'),
    updatedAt: new Date('2026-03-24T08:00:00.000Z'),
    systemRoleAssignments: [],
    memberships: [
      {
        workspaceId: 'ws_1',
        role: 'workspace_owner',
        workspace: {
          id: 'ws_1',
          slug: 'demo-workspace',
          name: 'Demo Workspace',
        },
      },
    ],
    ...(overrides ?? {}),
  } as any;
}

test('PlatformService.listWorkspacesForCurrentSession maps Prisma records into workspace summaries', async () => {
  const { service, workspaceRepository } = createPlatformService();

  workspaceRepository.findByUserId = async () =>
    [
      {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
        memberships: [{ role: 'workspace_owner' }],
      },
      {
        id: 'ws_2',
        slug: 'analytics-lab',
        name: 'Analytics Lab',
        memberships: [{ role: 'workspace_viewer' }],
      },
    ] as any;

  const result = await service.listWorkspacesForCurrentSession(createConnectedSessionSnapshot());

  assert.equal(result.personaKey, 'connected-user');
  assert.deepEqual(result.items, [
    {
      id: 'ws_1',
      slug: 'demo-workspace',
      name: 'Demo Workspace',
      role: 'workspace_owner',
    },
    {
      id: 'ws_2',
      slug: 'analytics-lab',
      name: 'Analytics Lab',
      role: 'workspace_viewer',
    },
  ]);
});

test('PlatformService.getWorkspaceForCurrentSession returns connected workspace details', async () => {
  const { service, workspaceRepository } = createPlatformService();
  let capturedWorkspaceId: string | undefined;

  workspaceRepository.findById = async (workspaceId: string) => {
    capturedWorkspaceId = workspaceId;

    return {
      id: 'ws_1',
      slug: 'demo-workspace',
      name: 'Demo Workspace',
      memberships: [
        {
          userId: 'user_1',
          role: 'workspace_owner',
        },
      ],
    } as any;
  };

  const result = await service.getWorkspaceForCurrentSession(createConnectedSessionSnapshot(), 'ws_1');

  assert.equal(capturedWorkspaceId, 'ws_1');
  assert.equal(result.workspace.id, 'ws_1');
  assert.equal(result.workspace.slug, 'demo-workspace');
  assert.equal(result.workspace.name, 'Demo Workspace');
  assert.equal(result.workspace.role, 'workspace_owner');
  assert.equal(result.accessDecision.allowed, true);
  assert.deepEqual(result.permissions, ['workspaces:read', 'subscriptions:read']);
});

test('PlatformService.getWorkspaceForCurrentSession hides workspaces that are not in the current session', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () => service.getWorkspaceForCurrentSession(createConnectedSessionSnapshot(), 'ws_2'),
    (error: unknown) => {
      assert.ok(error instanceof NotFoundException);
      assert.match((error as Error).message, /Workspace not found or not accessible/);
      return true;
    },
  );
});

test('PlatformService.getWorkspaceForCurrentSession returns not found when the workspace no longer exists', async () => {
  const { service, workspaceRepository } = createPlatformService();

  workspaceRepository.findById = async () => null;

  await assert.rejects(
    () => service.getWorkspaceForCurrentSession(createConnectedSessionSnapshot(), 'ws_1'),
    (error: unknown) => {
      assert.ok(error instanceof NotFoundException);
      assert.match((error as Error).message, /Workspace not found or not accessible/);
      return true;
    },
  );
});

test('PlatformService.getUserProfileForCurrentSession returns the persisted user profile', async () => {
  const { service, userRepository } = createPlatformService();

  userRepository.findById = async () => createConnectedUserRecord();

  const result = await service.getUserProfileForCurrentSession(createConnectedSessionSnapshot());

  assert.equal(result.id, 'user_1');
  assert.equal(result.email, 'owner@quizmind.dev');
  assert.equal(result.displayName, 'Workspace Owner');
  assert.equal(result.avatarUrl, 'https://cdn.quizmind.dev/avatar.png');
  assert.equal(result.locale, 'en-US');
  assert.equal(result.timezone, 'UTC');
  assert.equal(result.createdAt, '2026-03-20T08:00:00.000Z');
});

test('PlatformService.updateUserProfileForCurrentSession normalizes and persists profile fields', async () => {
  const { service, userRepository } = createPlatformService();
  let capturedUserId: string | undefined;
  let capturedData: unknown;

  userRepository.findById = async () => createConnectedUserRecord();
  userRepository.update = async (userId: string, data: any) => {
    capturedUserId = userId;
    capturedData = data;

    return createConnectedUserRecord({
      displayName: data.displayName ?? null,
      avatarUrl: data.avatarUrl ?? null,
      locale: data.locale ?? null,
      timezone: data.timezone ?? null,
      updatedAt: new Date('2026-03-25T10:00:00.000Z'),
    });
  };

  const result = await service.updateUserProfileForCurrentSession(createConnectedSessionSnapshot(), {
    displayName: '  New Owner Name  ',
    avatarUrl: 'https://cdn.quizmind.dev/new-avatar.png',
    locale: 'en-us',
    timezone: 'Asia/Tashkent',
  });

  assert.equal(capturedUserId, 'user_1');
  assert.deepEqual(capturedData, {
    displayName: 'New Owner Name',
    avatarUrl: 'https://cdn.quizmind.dev/new-avatar.png',
    locale: 'en-US',
    timezone: 'Asia/Tashkent',
  });
  assert.equal(result.displayName, 'New Owner Name');
  assert.equal(result.locale, 'en-US');
  assert.equal(result.timezone, 'Asia/Tashkent');
  assert.equal(result.updatedAt, '2026-03-25T10:00:00.000Z');
});

test('PlatformService.updateUserProfileForCurrentSession validates timezone values', async () => {
  const { service, userRepository } = createPlatformService();
  userRepository.findById = async () => createConnectedUserRecord();

  await assert.rejects(
    () =>
      service.updateUserProfileForCurrentSession(createConnectedSessionSnapshot(), {
        timezone: 'Mars/Olympus',
      }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match((error as Error).message, /timezone must be a valid IANA timezone name/);
      return true;
    },
  );
});

test('PlatformService.listUsersForCurrentSession maps Prisma-backed users into admin directory entries', async () => {
  const { service, userRepository } = createPlatformService();

  userRepository.listWithFilters = async () => ({
    items: [
      {
        id: 'user_1',
        email: 'admin@quizmind.dev',
        displayName: 'QuizMind Admin',
        emailVerifiedAt: new Date('2026-03-23T08:00:00.000Z'),
        suspendedAt: null,
        lastLoginAt: new Date('2026-03-23T12:00:00.000Z'),
        systemRoleAssignments: [{ role: 'admin' }],
        memberships: [
          {
            workspaceId: 'ws_1',
            role: 'workspace_owner',
            workspace: {
              id: 'ws_1',
              slug: 'demo-workspace',
              name: 'Demo Workspace',
            },
          },
        ],
      },
      {
        id: 'user_2',
        email: 'support@quizmind.dev',
        displayName: 'Mila Support',
        emailVerifiedAt: new Date('2026-03-23T08:30:00.000Z'),
        suspendedAt: null,
        lastLoginAt: null,
        systemRoleAssignments: [{ role: 'admin' }],
        memberships: [],
      },
    ] as any,
    hasNext: true,
    nextCursor: 'cursor_2',
  });

  const result = await service.listUsersForCurrentSession({
    ...createConnectedSessionSnapshot(),
    principal: {
      ...createConnectedSessionSnapshot().principal,
      systemRoles: ['admin'],
    },
    permissions: ['users:read', 'workspaces:read'],
  });

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.writeDecision.allowed, true);
  assert.deepEqual(result.items, [
    {
      id: 'user_1',
      email: 'admin@quizmind.dev',
      displayName: 'QuizMind Admin',
      emailVerifiedAt: '2026-03-23T08:00:00.000Z',
      suspendedAt: null,
      lastLoginAt: '2026-03-23T12:00:00.000Z',
      systemRoles: ['admin'],
      workspaces: [
        {
          workspaceId: 'ws_1',
          workspaceSlug: 'demo-workspace',
          workspaceName: 'Demo Workspace',
          role: 'workspace_owner',
        },
      ],
    },
    {
      id: 'user_2',
      email: 'support@quizmind.dev',
      displayName: 'Mila Support',
      emailVerifiedAt: '2026-03-23T08:30:00.000Z',
      suspendedAt: null,
      lastLoginAt: null,
      systemRoles: ['admin'],
      workspaces: [],
    },
  ]);
  assert.equal(result.hasNext, true);
  assert.equal(result.nextCursor, 'cursor_2');
  assert.equal(result.total, undefined);
});

test('PlatformService.listUsersForCurrentSession forwards cursor filters to repository', async () => {
  const { service, userRepository } = createPlatformService();
  let capturedFilters: any;
  userRepository.listWithFilters = async (filters: any) => {
    capturedFilters = filters;
    return { items: [], hasNext: false, nextCursor: null };
  };

  await service.listUsersForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      principal: {
        ...createConnectedSessionSnapshot().principal,
        systemRoles: ['admin'],
      },
      permissions: ['users:read', 'workspaces:read'],
    },
    { query: 'john', sort: 'created-desc', cursor: 'cursor_a', limit: '50' },
  );

  assert.equal(capturedFilters.cursor, 'cursor_a');
  assert.equal(capturedFilters.limit, 50);
  assert.equal(capturedFilters.sort, 'created-desc');
});

test('PlatformService.listUsersForCurrentSession denies principals without users:read', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () => service.listUsersForCurrentSession(createConnectedSessionSnapshot()),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: users:read/);
      return true;
    },
  );
});

test('PlatformService.createUserForCurrentSession creates a user with requested roles and memberships', async () => {
  const { service, userRepository, workspaceRepository } = createPlatformService();
  let capturedCreateData: any = null;

  workspaceRepository.findById = async (workspaceId: string) =>
    ({
      id: workspaceId,
      slug: workspaceId === 'ws_1' ? 'demo-workspace' : 'analytics-lab',
      name: workspaceId === 'ws_1' ? 'Demo Workspace' : 'Analytics Lab',
      memberships: [],
    }) as any;
  userRepository.create = async (data: any) => {
    capturedCreateData = data;

    return createConnectedUserRecord({
      id: 'user_created',
      email: 'new.admin@quizmind.dev',
      displayName: 'New Admin',
      systemRoleAssignments: [{ role: 'admin' }],
      memberships: [
        {
          workspaceId: 'ws_1',
          role: 'workspace_admin',
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
      ],
      updatedAt: new Date('2026-03-29T10:00:00.000Z'),
    });
  };

  const result = await service.createUserForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      principal: {
        ...createConnectedSessionSnapshot().principal,
        systemRoles: ['admin'],
      },
      permissions: ['users:read', 'users:update', 'workspaces:read'],
    },
    {
      email: '  NEW.ADMIN@quizmind.dev ',
      password: 'correct-horse-battery-staple',
      displayName: '  New Admin  ',
      systemRoles: ['admin'],
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_admin' }],
      emailVerified: true,
    },
  );

  assert.equal(capturedCreateData.email, 'new.admin@quizmind.dev');
  assert.equal(typeof capturedCreateData.passwordHash, 'string');
  assert.notEqual(capturedCreateData.passwordHash, 'correct-horse-battery-staple');
  assert.equal(capturedCreateData.displayName, 'New Admin');
  assert.deepEqual(capturedCreateData.systemRoleAssignments.create, [{ role: 'admin' }]);
  assert.deepEqual(capturedCreateData.memberships.create, [
    {
      role: 'workspace_admin',
      workspace: {
        connect: {
          id: 'ws_1',
        },
      },
    },
  ]);
  assert.equal(result.user.id, 'user_created');
  assert.deepEqual(result.user.systemRoles, ['admin']);
  assert.equal(result.updatedAt, '2026-03-29T10:00:00.000Z');
});

test('PlatformService.updateUserAccessForCurrentSession updates role assignments and suspension state', async () => {
  const { service, userRepository, workspaceRepository } = createPlatformService();
  let capturedUpdateData: any = null;

  workspaceRepository.findById = async (workspaceId: string) =>
    ({
      id: workspaceId,
      slug: workspaceId === 'ws_1' ? 'demo-workspace' : 'analytics-lab',
      name: workspaceId === 'ws_1' ? 'Demo Workspace' : 'Analytics Lab',
      memberships: [],
    }) as any;
  userRepository.findById = async (userId: string) =>
    createConnectedUserRecord({
      id: userId,
      email: 'editor@quizmind.dev',
      displayName: 'Editor User',
      systemRoleAssignments: [],
      memberships: [],
    });
  userRepository.update = async (_userId: string, data: any) => {
    capturedUpdateData = data;

    return createConnectedUserRecord({
      id: 'user_editor',
      email: 'editor@quizmind.dev',
      displayName: 'Editor User Updated',
      systemRoleAssignments: [{ role: 'admin' }],
      memberships: [
        {
          workspaceId: 'ws_1',
          role: 'workspace_billing_manager',
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
      ],
      suspendedAt: new Date('2026-03-29T10:30:00.000Z'),
      suspendReason: 'Role migration freeze.',
      updatedAt: new Date('2026-03-29T10:30:00.000Z'),
    });
  };

  const result = await service.updateUserAccessForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      principal: {
        ...createConnectedSessionSnapshot().principal,
        systemRoles: ['admin'],
      },
      permissions: ['users:read', 'users:update', 'workspaces:read'],
    },
    {
      userId: 'user_editor',
      displayName: 'Editor User Updated',
      systemRoles: ['admin'],
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_billing_manager' }],
      suspend: true,
      suspendReason: 'Role migration freeze.',
    },
  );

  assert.equal(capturedUpdateData.displayName, 'Editor User Updated');
  assert.deepEqual(capturedUpdateData.systemRoleAssignments, {
    deleteMany: {},
    create: [{ role: 'admin' }],
  });
  assert.deepEqual(capturedUpdateData.memberships, {
    deleteMany: {},
    create: [
      {
        role: 'workspace_billing_manager',
        workspace: {
          connect: {
            id: 'ws_1',
          },
        },
      },
    ],
  });
  assert.equal(capturedUpdateData.suspendReason, 'Role migration freeze.');
  assert.ok(capturedUpdateData.suspendedAt instanceof Date);
  assert.equal(result.user.id, 'user_editor');
  assert.equal(result.user.suspendedAt, '2026-03-29T10:30:00.000Z');
  assert.equal(result.updatedAt, '2026-03-29T10:30:00.000Z');
});

test('PlatformService.listAdminLogsForCurrentSession maps persisted audit, security, activity, and domain events', async () => {
  const { service, adminLogRepository } = createPlatformService();

  adminLogRepository.listRecent = async () =>
    ({
      audit: [
        {
          id: 'audit_1',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          action: 'support.ticket_workflow_updated',
          targetType: 'support_ticket',
          targetId: 'ticket_1',
          metadataJson: {
            summary: 'Moved the ticket into progress and assigned it to support.',
            severity: 'info',
            status: 'success',
          },
          createdAt: new Date('2026-03-24T12:00:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
      ],
      activity: [
        {
          id: 'activity_1',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          eventType: 'usage.dashboard_opened',
          metadataJson: {
            route: '/app/usage',
            source: 'dashboard',
          },
          createdAt: new Date('2026-03-24T11:45:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
      ],
      security: [
        {
          id: 'security_1',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          eventType: 'auth.login_failed',
          severity: 'warn',
          metadataJson: {
            reason: 'invalid_password',
            status: 'failure',
          },
          createdAt: new Date('2026-03-24T11:50:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
      ],
      domain: [
        {
          id: 'domain_1',
          workspaceId: 'ws_1',
          eventType: 'billing.subscription_changed',
          payloadJson: {
            status: 'active',
            provider: 'stripe',
          },
          createdAt: new Date('2026-03-24T11:55:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
      ],
      actors: [
        {
          id: 'user_1',
          email: 'owner@quizmind.dev',
          displayName: 'Workspace Owner',
        },
      ],
    }) as any;

  const result = await service.listAdminLogsForCurrentSession(createAuditLogsSessionSnapshot(), {
    workspaceId: 'ws_1',
    limit: 10,
    stream: 'all',
    severity: 'all',
    search: 'ticket',
  });

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.exportDecision.allowed, false);
  assert.match(result.exportDecision.reasons.join('; '), /Missing permission: audit_logs:export/);
  assert.equal(result.workspace?.id, 'ws_1');
  assert.deepEqual(result.streamCounts, {
    audit: 1,
    activity: 0,
    security: 0,
    domain: 0,
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.stream, 'audit');
  assert.equal(result.items[0]?.eventType, 'support.ticket_workflow_updated');
  assert.equal(result.items[0]?.actor?.displayName, 'Workspace Owner');
  assert.equal(result.items[0]?.targetType, 'support_ticket');
  assert.equal(result.items[0]?.targetId, 'ticket_1');
});

test('PlatformService.listAdminLogsForCurrentSession denies principals without audit_logs:read', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () => service.listAdminLogsForCurrentSession(createConnectedSessionSnapshot(), { workspaceId: 'ws_1' }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: audit_logs:read/);
      return true;
    },
  );
});

test('PlatformService.listAdminSecurityForCurrentSession returns security findings and hardening controls', async () => {
  const { service, adminLogRepository } = createPlatformService();

  adminLogRepository.listRecent = async () =>
    ({
      audit: [],
      activity: [],
      security: [
        {
          id: 'security_1',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          eventType: 'auth.login_failed',
          severity: 'warn',
          metadataJson: {
            summary: 'Failed login attempt with an invalid password.',
            status: 'failure',
            reason: 'invalid_password',
          },
          createdAt: new Date('2026-03-24T11:50:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
        {
          id: 'security_2',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          eventType: 'support.impersonation_started',
          severity: 'info',
          metadataJson: {
            summary: 'Support impersonation started by an operator.',
            status: 'success',
          },
          createdAt: new Date('2026-03-24T11:45:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
        {
          id: 'security_3',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          eventType: 'provider.credential_rotated',
          severity: 'error',
          metadataJson: {
            summary: 'Rotated provider api_key credential for OpenAI.',
            status: 'success',
          },
          createdAt: new Date('2026-03-24T11:40:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
        {
          id: 'security_4',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          eventType: 'extension.bootstrap_refresh_failed',
          severity: 'warn',
          metadataJson: {
            summary: 'Extension bootstrap refresh failed because the installation token expired.',
            status: 'failure',
            reason: 'token_expired',
          },
          createdAt: new Date('2026-03-24T11:35:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
        {
          id: 'security_5',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          eventType: 'extension.installation_reconnect_requested',
          severity: 'info',
          metadataJson: {
            summary: 'Extension requested reconnect flow after receiving an unauthorized bootstrap response.',
            status: 'success',
          },
          createdAt: new Date('2026-03-24T11:34:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
        {
          id: 'security_6',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          eventType: 'extension.runtime_error',
          severity: 'warn',
          metadataJson: {
            summary: 'Extension runtime emitted a managed client error while handling a quiz event.',
            status: 'failure',
          },
          createdAt: new Date('2026-03-24T11:33:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
        {
          id: 'security_7',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          eventType: 'extension.installation_reconnected',
          severity: 'info',
          metadataJson: {
            summary: 'Extension reconnected after the user completed the bind bridge flow.',
            status: 'success',
          },
          createdAt: new Date('2026-03-24T11:32:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
        {
          id: 'security_8',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          eventType: 'extension.installation_session_revoked',
          severity: 'info',
          metadataJson: {
            summary: 'Operator disconnected an extension installation and revoked active sessions.',
            status: 'success',
          },
          createdAt: new Date('2026-03-24T11:31:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
        {
          id: 'security_9',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          eventType: 'extension.installation_session_rotated',
          severity: 'info',
          metadataJson: {
            summary: 'Operator rotated installation session token after support review.',
            status: 'success',
          },
          createdAt: new Date('2026-03-24T11:30:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
      ],
      domain: [],
      actors: [
        {
          id: 'user_1',
          email: 'owner@quizmind.dev',
          displayName: 'Workspace Owner',
        },
      ],
    }) as any;

  const result = await service.listAdminSecurityForCurrentSession(createAuditLogsSessionSnapshot(), {
    workspaceId: 'ws_1',
    stream: 'all',
    severity: 'all',
    limit: 10,
  });

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.exportDecision.allowed, false);
  assert.match(result.exportDecision.reasons.join('; '), /Missing permission: audit_logs:export/);
  assert.equal(result.filters.stream, 'security');
  assert.deepEqual(result.streamCounts, {
    audit: 0,
    activity: 0,
    security: 9,
    domain: 0,
  });
  assert.equal(result.items.length, 9);
  assert.ok(result.items.every((entry) => entry.stream === 'security'));
  assert.deepEqual(result.findings, {
    suspiciousAuthFailures: 1,
    impersonationEvents: 1,
    providerCredentialEvents: 1,
    privilegedActionEvents: 2,
    extensionBootstrapRefreshFailures: 1,
    extensionReconnectRequests: 1,
    extensionReconnectRecoveries: 1,
    extensionReconnectOutstanding: 0,
    extensionSessionRevocations: 1,
    extensionSessionRotations: 1,
    extensionRuntimeErrors: 1,
    totalFailures: 4,
  });
  assert.equal(result.lifecycleTrend.windowHours, 24);
  assert.equal(result.lifecycleTrend.bucketHours, 6);
  assert.equal(result.lifecycleTrend.buckets.length, 4);

  const trendTotals = result.lifecycleTrend.buckets.reduce(
    (accumulator, bucket) => ({
      extensionBootstrapRefreshFailures:
        accumulator.extensionBootstrapRefreshFailures + bucket.extensionBootstrapRefreshFailures,
      extensionReconnectRequests: accumulator.extensionReconnectRequests + bucket.extensionReconnectRequests,
      extensionReconnectRecoveries: accumulator.extensionReconnectRecoveries + bucket.extensionReconnectRecoveries,
      extensionSessionRevocations: accumulator.extensionSessionRevocations + bucket.extensionSessionRevocations,
      extensionSessionRotations: accumulator.extensionSessionRotations + bucket.extensionSessionRotations,
      extensionRuntimeErrors: accumulator.extensionRuntimeErrors + bucket.extensionRuntimeErrors,
    }),
    {
      extensionBootstrapRefreshFailures: 0,
      extensionReconnectRequests: 0,
      extensionReconnectRecoveries: 0,
      extensionSessionRevocations: 0,
      extensionSessionRotations: 0,
      extensionRuntimeErrors: 0,
    },
  );

  assert.deepEqual(trendTotals, {
    extensionBootstrapRefreshFailures: 1,
    extensionReconnectRequests: 1,
    extensionReconnectRecoveries: 1,
    extensionSessionRevocations: 1,
    extensionSessionRotations: 1,
    extensionRuntimeErrors: 1,
  });
  assert.ok(
    result.lifecycleTrend.buckets.some(
      (bucket) =>
        bucket.extensionBootstrapRefreshFailures === 1 &&
        bucket.extensionReconnectRequests === 1 &&
        bucket.extensionReconnectRecoveries === 1 &&
        bucket.extensionSessionRevocations === 1 &&
        bucket.extensionSessionRotations === 1 &&
        bucket.extensionRuntimeErrors === 1,
    ),
  );
  assert.deepEqual(
    result.controls.map((control) => control.id),
    ['admin_mfa', 'step_up_auth', 'secret_access_audit', 'risk_scoring'],
  );
});

test('PlatformService.listAdminSecurityForCurrentSession denies principals without audit_logs:read', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () => service.listAdminSecurityForCurrentSession(createConnectedSessionSnapshot(), { workspaceId: 'ws_1' }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: audit_logs:read/);
      return true;
    },
  );
});

test('PlatformService.listAdminLogsForCurrentSession exposes exportDecision for export-capable sessions', async () => {
  const { service, adminLogRepository } = createPlatformService();

  adminLogRepository.listRecent = async () =>
    ({
      audit: [],
      activity: [],
      security: [],
      domain: [],
      actors: [],
    }) as any;

  const result = await service.listAdminLogsForCurrentSession(createAuditLogExportSessionSnapshot(), {
    workspaceId: 'ws_1',
    stream: 'all',
    severity: 'all',
    limit: 12,
  });

  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.exportDecision.allowed, true);
  assert.deepEqual(result.exportDecision.reasons, []);
});

test('PlatformService.exportAdminLogsForCurrentSession exports filtered admin logs as JSON', async () => {
  const { service, adminLogRepository, queueDispatchService } = createPlatformService();
  let capturedQueueRequest: any = null;

  adminLogRepository.listRecent = async () =>
    ({
      audit: [
        {
          id: 'audit_1',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          action: 'support.ticket_workflow_updated',
          targetType: 'support_ticket',
          targetId: 'ticket_1',
          metadataJson: {
            summary: 'Moved the ticket into progress and assigned it to support.',
            severity: 'info',
            status: 'success',
          },
          createdAt: new Date('2026-03-24T12:00:00.000Z'),
          workspace: {
            id: 'ws_1',
            slug: 'demo-workspace',
            name: 'Demo Workspace',
          },
        },
      ],
      activity: [],
      security: [],
      domain: [],
      actors: [
        {
          id: 'user_1',
          email: 'owner@quizmind.dev',
          displayName: 'Workspace Owner',
        },
      ],
    }) as any;
  queueDispatchService.dispatch = async (request: any) => {
    capturedQueueRequest = request;

    return {
      id: 'audit-exports:test-job',
      queue: request.queue,
      payload: request.payload,
      createdAt: request.createdAt ?? '2026-03-24T12:01:00.000Z',
      attempts: request.attempts ?? 2,
    } as any;
  };

  const result = await service.exportAdminLogsForCurrentSession(createAuditLogExportSessionSnapshot(), {
    workspaceId: 'ws_1',
    stream: 'all',
    severity: 'all',
    search: 'ticket',
    limit: 10,
    format: 'json',
  });

  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.format, 'json');
  assert.match(result.fileName, /^audit-logs-demo-workspace-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(result.itemCount, 1);
  assert.match(result.content, /support\.ticket_workflow_updated/);
  assert.deepEqual(capturedQueueRequest, {
    queue: 'audit-exports',
    payload: {
      exportType: 'admin_logs',
      workspaceId: 'ws_1',
      format: 'json',
      fileName: result.fileName,
      contentType: result.contentType,
      exportedAt: result.exportedAt,
      itemCount: 1,
      requestedByUserId: 'user_1',
    },
    attempts: 2,
  });
});

test('PlatformService.exportAdminLogsForCurrentSession denies principals without audit_logs:export', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () =>
      service.exportAdminLogsForCurrentSession(createAuditLogsSessionSnapshot(), {
        workspaceId: 'ws_1',
        format: 'csv',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: audit_logs:export/);
      return true;
    },
  );
});

test('PlatformService.listAdminExtensionFleetForCurrentSession maps installation auth health and compatibility drift', async () => {
  const {
    service,
    extensionCompatibilityRepository,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
  } = createPlatformService();

  extensionCompatibilityRepository.findLatest = async () =>
    ({
      id: 'compat_rule_1',
      minimumVersion: '1.6.0',
      recommendedVersion: '1.7.0',
      supportedSchemaVersions: ['2'],
      requiredCapabilities: ['quiz-capture'],
      resultStatus: 'supported_with_warnings',
      reason: 'Upgrade is recommended during staged rollout.',
      createdAt: new Date('2026-03-24T12:00:00.000Z'),
    }) as any;
  extensionInstallationRepository.listByWorkspaceId = async () =>
    [
      {
        id: 'ext_installation_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        installationId: 'inst_chrome_primary',
        browser: 'chrome',
        extensionVersion: '1.7.1',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync'],
        createdAt: new Date('2026-03-24T10:00:00.000Z'),
        updatedAt: new Date('2026-03-24T10:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T12:20:00.000Z'),
      },
      {
        id: 'ext_installation_2',
        userId: 'user_2',
        workspaceId: 'ws_1',
        installationId: 'inst_edge_legacy',
        browser: 'edge',
        extensionVersion: '1.5.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture'],
        createdAt: new Date('2026-03-23T10:00:00.000Z'),
        updatedAt: new Date('2026-03-23T10:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T11:00:00.000Z'),
      },
    ] as any;
  extensionInstallationSessionRepository.listActiveByInstallationIds = async () =>
    [
      {
        id: 'installation_session_1',
        extensionInstallationId: 'ext_installation_1',
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        expiresAt: new Date('2026-03-24T13:00:00.000Z'),
      },
    ] as any;

  const result = await service.listAdminExtensionFleetForCurrentSession(createInstallationAdminSessionSnapshot(), {
    workspaceId: 'ws_1',
    connection: 'all',
    compatibility: 'all',
    limit: 20,
  });

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.manageDecision.allowed, true);
  assert.equal(result.workspace.id, 'ws_1');
  assert.deepEqual(result.counts, {
    total: 2,
    connected: 1,
    reconnectRequired: 1,
    supported: 0,
    supportedWithWarnings: 1,
    deprecated: 0,
    unsupported: 1,
  });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.installationId, 'inst_chrome_primary');
  assert.equal(result.items[0]?.compatibility.status, 'supported_with_warnings');
  assert.equal(result.items[0]?.activeSessionCount, 1);
  assert.equal(result.items[0]?.requiresReconnect, false);
  assert.equal(result.items[1]?.installationId, 'inst_edge_legacy');
  assert.equal(result.items[1]?.compatibility.status, 'unsupported');
  assert.equal(result.items[1]?.activeSessionCount, 0);
  assert.equal(result.items[1]?.requiresReconnect, true);
});

test('PlatformService.listAdminExtensionFleetForCurrentSession filters reconnect-required installations', async () => {
  const {
    service,
    extensionCompatibilityRepository,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
  } = createPlatformService();

  extensionCompatibilityRepository.findLatest = async () =>
    ({
      id: 'compat_rule_1',
      minimumVersion: '1.6.0',
      recommendedVersion: '1.7.0',
      supportedSchemaVersions: ['2'],
      requiredCapabilities: ['quiz-capture'],
      resultStatus: 'supported_with_warnings',
      reason: 'Upgrade is recommended during staged rollout.',
      createdAt: new Date('2026-03-24T12:00:00.000Z'),
    }) as any;
  extensionInstallationRepository.listByWorkspaceId = async () =>
    [
      {
        id: 'ext_installation_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        installationId: 'inst_chrome_primary',
        browser: 'chrome',
        extensionVersion: '1.7.1',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync'],
        createdAt: new Date('2026-03-24T10:00:00.000Z'),
        updatedAt: new Date('2026-03-24T10:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T12:20:00.000Z'),
      },
      {
        id: 'ext_installation_2',
        userId: 'user_2',
        workspaceId: 'ws_1',
        installationId: 'inst_edge_legacy',
        browser: 'edge',
        extensionVersion: '1.5.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture'],
        createdAt: new Date('2026-03-23T10:00:00.000Z'),
        updatedAt: new Date('2026-03-23T10:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T11:00:00.000Z'),
      },
    ] as any;
  extensionInstallationSessionRepository.listActiveByInstallationIds = async () =>
    [
      {
        id: 'installation_session_1',
        extensionInstallationId: 'ext_installation_1',
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        expiresAt: new Date('2026-03-24T13:00:00.000Z'),
      },
    ] as any;

  const result = await service.listAdminExtensionFleetForCurrentSession(createInstallationAdminSessionSnapshot(), {
    workspaceId: 'ws_1',
    connection: 'reconnect_required',
    compatibility: 'all',
    limit: 20,
  });

  assert.equal(result.counts.total, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.installationId, 'inst_edge_legacy');
  assert.equal(result.items[0]?.requiresReconnect, true);
});

test('PlatformService.listAdminExtensionFleetForCurrentSession includes selected installation session history', async () => {
  const {
    service,
    extensionCompatibilityRepository,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
  } = createPlatformService();
  const now = Date.now();

  extensionCompatibilityRepository.findLatest = async () =>
    ({
      id: 'compat_rule_detail_1',
      minimumVersion: '1.6.0',
      recommendedVersion: '1.7.0',
      supportedSchemaVersions: ['2'],
      requiredCapabilities: ['quiz-capture'],
      resultStatus: 'supported_with_warnings',
      reason: 'Upgrade is recommended during staged rollout.',
      createdAt: new Date('2026-03-24T12:00:00.000Z'),
    }) as any;
  extensionInstallationRepository.listByWorkspaceId = async () =>
    [
      {
        id: 'ext_installation_detail_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        installationId: 'inst_chrome_primary',
        browser: 'chrome',
        extensionVersion: '1.7.1',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync'],
        createdAt: new Date('2026-03-24T10:00:00.000Z'),
        updatedAt: new Date('2026-03-24T10:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T12:20:00.000Z'),
      },
    ] as any;
  extensionInstallationSessionRepository.listActiveByInstallationIds = async () =>
    [
      {
        id: 'installation_session_active_1',
        extensionInstallationId: 'ext_installation_detail_1',
        createdAt: new Date(now - 15 * 60 * 1000),
        expiresAt: new Date(now + 45 * 60 * 1000),
      },
    ] as any;
  extensionInstallationSessionRepository.listRecentByInstallationRecordId = async () =>
    [
      {
        id: 'installation_session_active_1',
        extensionInstallationId: 'ext_installation_detail_1',
        userId: 'user_1',
        createdAt: new Date(now - 15 * 60 * 1000),
        expiresAt: new Date(now + 45 * 60 * 1000),
        revokedAt: null,
      },
      {
        id: 'installation_session_revoked_1',
        extensionInstallationId: 'ext_installation_detail_1',
        userId: 'user_1',
        createdAt: new Date(now - 3 * 60 * 60 * 1000),
        expiresAt: new Date(now - 2 * 60 * 60 * 1000),
        revokedAt: new Date(now - 150 * 60 * 1000),
      },
      {
        id: 'installation_session_expired_1',
        extensionInstallationId: 'ext_installation_detail_1',
        userId: 'user_1',
        createdAt: new Date(now - 6 * 60 * 60 * 1000),
        expiresAt: new Date(now - 5 * 60 * 60 * 1000),
        revokedAt: null,
      },
    ] as any;

  const result = await service.listAdminExtensionFleetForCurrentSession(createInstallationAdminSessionSnapshot(), {
    workspaceId: 'ws_1',
    installationId: 'inst_chrome_primary',
    connection: 'all',
    compatibility: 'all',
    limit: 20,
  });

  assert.equal(result.selectedInstallationId, 'inst_chrome_primary');
  assert.equal(result.selectedInstallation?.installation.installationId, 'inst_chrome_primary');
  assert.deepEqual(result.selectedInstallation?.counts, {
    total: 3,
    active: 1,
    expired: 1,
    revoked: 1,
  });
  assert.equal(result.selectedInstallation?.sessions[0]?.installationId, 'inst_chrome_primary');
  assert.equal(result.selectedInstallation?.sessions[0]?.status, 'active');
  assert.equal(result.selectedInstallation?.sessions[1]?.status, 'revoked');
  assert.equal(result.selectedInstallation?.sessions[2]?.status, 'expired');
});

test('PlatformService.listAdminExtensionFleetForCurrentSession denies principals without installations:read', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () =>
      service.listAdminExtensionFleetForCurrentSession(createInstallationRestrictedSessionSnapshot(), {
        workspaceId: 'ws_1',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: installations:read/);
      return true;
    },
  );
});

test('PlatformService.listAdminExtensionFleetForCurrentSession returns read-only manageDecision without installations:write', async () => {
  const {
    service,
    extensionCompatibilityRepository,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
  } = createPlatformService();

  extensionCompatibilityRepository.findLatest = async () => null as any;
  extensionInstallationRepository.listByWorkspaceId = async () => [] as any;
  extensionInstallationSessionRepository.listActiveByInstallationIds = async () => [] as any;

  const result = await service.listAdminExtensionFleetForCurrentSession(createInstallationReadOnlySessionSnapshot(), {
    workspaceId: 'ws_1',
  });

  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.manageDecision.allowed, false);
  assert.match(result.manageDecision.reasons.join('; '), /Missing permission: installations:write/);
});

test('PlatformService.listAdminWebhooksForCurrentSession maps persisted webhook deliveries and queue catalog', async () => {
  const { service, billingWebhookRepository } = createPlatformService();

  billingWebhookRepository.listRecentEvents = async () =>
    [
      {
        id: 'wh_1',
        provider: 'stripe',
        externalEventId: 'evt_1',
        eventType: 'invoice.payment_failed',
        status: 'failed',
        providerCreatedAt: new Date('2026-03-24T11:59:40.000Z'),
        processedAt: null,
        lastError: 'Missing workspace customer mapping.',
        receivedAt: new Date('2026-03-24T12:00:00.000Z'),
      },
      {
        id: 'wh_2',
        provider: 'stripe',
        externalEventId: 'evt_2',
        eventType: 'customer.subscription.updated',
        status: 'processed',
        providerCreatedAt: new Date('2026-03-24T11:24:44.000Z'),
        processedAt: new Date('2026-03-24T11:25:04.000Z'),
        lastError: null,
        receivedAt: new Date('2026-03-24T11:25:00.000Z'),
      },
    ] as any;

  const result = await service.listAdminWebhooksForCurrentSession(createWebhookJobsSessionSnapshot(), {
    provider: 'all',
    status: 'all',
    limit: 12,
  });

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.retryDecision.allowed, true);
  assert.deepEqual(result.statusCounts, {
    received: 0,
    processed: 1,
    failed: 1,
  });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.id, 'wh_1');
  assert.equal(result.items[0]?.retryable, true);
  assert.equal(result.items[1]?.status, 'processed');
  assert.equal(result.queues[0]?.name, 'billing-webhooks');
  assert.equal(result.queues[0]?.processorState, 'bound');
  const queueStates = Object.fromEntries(result.queues.map((queue) => [queue.name, queue.processorState]));
  assert.equal(queueStates['emails'], 'bound');
  assert.equal(queueStates['quota-resets'], 'bound');
  assert.equal(queueStates['entitlement-refresh'], 'bound');
  assert.equal(queueStates['audit-exports'], 'bound');
});

test('PlatformService.retryAdminWebhookForCurrentSession requeues a failed Stripe delivery', async () => {
  const { service, billingWebhookRepository, queueDispatchService } = createPlatformService();

  billingWebhookRepository.findEventById = async () =>
    ({
      id: 'wh_1',
      provider: 'stripe',
      externalEventId: 'evt_1',
      eventType: 'invoice.payment_failed',
      status: 'failed',
      receivedAt: new Date('2026-03-24T12:00:00.000Z'),
      processedAt: null,
    }) as any;
  billingWebhookRepository.resetEventForRetry = async () =>
    ({
      id: 'wh_1',
    }) as any;
  queueDispatchService.dispatch = async (request: any) => ({
    id: 'billing-webhooks:retry:wh_1:123',
    queue: request.queue,
    payload: request.payload,
    dedupeKey: request.dedupeKey,
    createdAt: '2026-03-24T12:02:00.000Z',
    attempts: 10,
  });

  const result = await service.retryAdminWebhookForCurrentSession(createWebhookJobsSessionSnapshot(), {
    webhookEventId: 'wh_1',
  });

  assert.equal(result.webhookEventId, 'wh_1');
  assert.equal(result.provider, 'stripe');
  assert.equal(result.queue, 'billing-webhooks');
  assert.equal(result.jobId, 'billing-webhooks:retry:wh_1:123');
  assert.equal(result.status, 'received');
});

test('PlatformService.retryAdminWebhookForCurrentSession denies principals without jobs:retry', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () => service.retryAdminWebhookForCurrentSession(createConnectedSessionSnapshot(), { webhookEventId: 'wh_1' }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: jobs:retry/);
      return true;
    },
  );
});

test('PlatformService.getSubscriptionForCurrentSession reads a persisted subscription snapshot', async () => {
  const { service, subscriptionRepository } = createPlatformService();

  subscriptionRepository.findCurrentByWorkspaceId = async () =>
    ({
      planId: 'plan_free',
      status: 'trialing',
      billingInterval: 'monthly',
      cancelAtPeriodEnd: false,
      seatCount: 3,
      currentPeriodEnd: new Date('2026-04-06T00:00:00.000Z'),
      plan: {
        id: 'plan_free',
        code: 'free',
        name: 'Free',
        description: 'Starter tier',
        entitlements: [
          { key: 'feature.text_answering', enabled: true, limitValue: null },
          { key: 'limit.requests_per_day', enabled: true, limitValue: 25 },
        ],
      },
      workspace: {
        entitlementOverrides: [{ key: 'limit.requests_per_day', enabled: true, limitValue: 50 }],
      },
    }) as any;

  const result = await service.getSubscriptionForCurrentSession(
    createConnectedSessionSnapshot(),
    'ws_1',
  );

  assert.equal(result.workspace.id, 'ws_1');
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.summary.planCode, 'free');
  assert.equal(result.summary.status, 'trialing');
  assert.equal(result.summary.seatCount, 3);
  assert.equal(result.summary.currentPeriodEnd, '2026-04-06T00:00:00.000Z');
  assert.deepEqual(result.summary.entitlements, [
    { key: 'feature.text_answering', enabled: true, limit: undefined },
    { key: 'limit.requests_per_day', enabled: true, limit: 50 },
  ]);
});

test('PlatformService.getUsageForCurrentSession maps persisted usage counters and telemetry snapshots', async () => {
  const { service, subscriptionRepository, usageRepository, queueDispatchService } = createPlatformService();
  const queueDispatchRequests: any[] = [];

  subscriptionRepository.findCurrentByWorkspaceId = async () => createUsageSubscriptionRecord();
  usageRepository.listInstallationsByWorkspaceId = async () =>
    [
      {
        installationId: 'inst_chrome_1',
        browser: 'chrome',
        extensionVersion: '1.7.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync'],
        lastSeenAt: new Date('2026-03-24T11:58:00.000Z'),
      },
    ] as any;
  usageRepository.listQuotaCountersByWorkspaceId = async () =>
    [
      {
        key: 'limit.requests_per_day',
        consumed: 126,
        periodStart: new Date('2026-03-24T00:00:00.000Z'),
        periodEnd: new Date('2026-03-25T00:00:00.000Z'),
        updatedAt: new Date('2026-03-24T11:59:00.000Z'),
      },
    ] as any;
  usageRepository.listRecentTelemetryByWorkspaceId = async () =>
    [
      {
        id: 'telemetry_1',
        eventType: 'extension.quiz_answer_requested',
        severity: 'info',
        payloadJson: {
          questionType: 'multiple_choice',
          surface: 'content_script',
        },
        createdAt: new Date('2026-03-24T11:59:00.000Z'),
        installation: {
          installationId: 'inst_chrome_1',
        },
      },
    ] as any;
  usageRepository.listRecentActivityByWorkspaceId = async () =>
    [
      {
        id: 'activity_1',
        actorId: 'user_1',
        eventType: 'usage.dashboard_opened',
        metadataJson: {
          route: '/app/usage',
          workspaceId: 'ws_1',
        },
        createdAt: new Date('2026-03-24T11:50:00.000Z'),
      },
    ] as any;
  usageRepository.listRecentAiRequestsByWorkspaceId = async () =>
    [
      {
        id: 'airq_1',
        userId: 'user_1',
        installationId: null,
        provider: 'openrouter',
        model: 'openrouter/auto',
        promptTokens: 12,
        completionTokens: 18,
        totalTokens: 30,
        keySource: 'platform',
        status: 'success',
        errorCode: null,
        durationMs: 432,
        requestMetadata: {
          requestId: 'req_1',
          messageCount: 2,
        },
        occurredAt: new Date('2026-03-24T12:00:00.000Z'),
      },
    ] as any;
  queueDispatchService.dispatch = async (request: any) => {
    queueDispatchRequests.push(request);

    return {
      id: request.jobId ?? `${request.queue}:${request.dedupeKey ?? 'test'}`,
      queue: request.queue,
      payload: request.payload,
      dedupeKey: request.dedupeKey,
      createdAt: request.createdAt ?? '2026-03-24T12:30:00.000Z',
      attempts: request.attempts ?? 1,
    } as any;
  };

  const result = await service.getUsageForCurrentSession(createConnectedSessionSnapshot(), 'ws_1');

  assert.equal(result.workspace.id, 'ws_1');
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.exportDecision.allowed, false);
  assert.match(result.exportDecision.reasons.join('; '), /Missing permission: usage:export/);
  assert.equal(result.planCode, 'pro');
  assert.equal(result.subscriptionStatus, 'active');
  assert.equal(result.quotas[0]?.key, 'limit.requests_per_day');
  assert.equal(result.quotas[0]?.consumed, 126);
  assert.equal(result.installations[0]?.installationId, 'inst_chrome_1');
  assert.equal(result.recentEvents.length, 3);
  assert.equal(result.recentEvents[0]?.eventType, 'ai.proxy.completed');
  assert.equal(result.recentEvents[0]?.source, 'ai');
  assert.equal(result.recentEvents[0]?.actorId, 'user_1');
  assert.equal(queueDispatchRequests.length, 1);
  assert.deepEqual(queueDispatchRequests[0], {
    queue: 'quota-resets',
    payload: {
      workspaceId: 'ws_1',
      key: 'limit.requests_per_day',
      consumed: 126,
      periodStart: '2026-03-24T00:00:00.000Z',
      periodEnd: '2026-03-25T00:00:00.000Z',
      nextPeriodStart: '2026-03-25T00:00:00.000Z',
      nextPeriodEnd: '2026-03-26T00:00:00.000Z',
      requestedAt: (queueDispatchRequests[0]?.payload as Record<string, unknown>)?.requestedAt,
    },
    dedupeKey: 'ws_1:limit.requests_per_day:2026-03-25T00:00:00.000Z',
    attempts: 3,
  });
});

test('PlatformService.getUsageForCurrentSession exposes exportDecision for usage exporters', async () => {
  const { service, subscriptionRepository, usageRepository } = createPlatformService();

  subscriptionRepository.findCurrentByWorkspaceId = async () => createUsageSubscriptionRecord();
  usageRepository.listInstallationsByWorkspaceId = async () => [] as any;
  usageRepository.listQuotaCountersByWorkspaceId = async () => [] as any;
  usageRepository.listRecentTelemetryByWorkspaceId = async () => [] as any;
  usageRepository.listRecentActivityByWorkspaceId = async () => [] as any;
  usageRepository.listRecentAiRequestsByWorkspaceId = async () => [] as any;

  const result = await service.getUsageForCurrentSession(createUsageExportSessionSnapshot(), 'ws_1');

  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.exportDecision.allowed, true);
  assert.deepEqual(result.exportDecision.reasons, []);
});

test('PlatformService.getUsageForCurrentSession denies principals without usage:read', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () => service.getUsageForCurrentSession(createUsageRestrictedSessionSnapshot(), 'ws_1'),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: usage:read/);
      return true;
    },
  );
});

test('PlatformService.listUsageHistoryForCurrentSession returns filtered usage events', async () => {
  const { service, usageRepository } = createPlatformService();

  usageRepository.listTelemetryHistoryByWorkspaceId = async () =>
    [
      {
        id: 'telemetry_1',
        eventType: 'extension.quiz_answer_requested',
        severity: 'info',
        payloadJson: {
          questionType: 'multiple_choice',
          surface: 'content_script',
        },
        createdAt: new Date('2026-03-24T11:59:00.000Z'),
        installation: {
          installationId: 'inst_chrome_1',
        },
      },
      {
        id: 'telemetry_2',
        eventType: 'extension.quiz_answer_requested',
        severity: 'warn',
        payloadJson: {
          questionType: 'multiple_choice',
          surface: 'popup',
        },
        createdAt: new Date('2026-03-24T11:50:00.000Z'),
        installation: {
          installationId: 'inst_chrome_2',
        },
      },
    ] as any;
  usageRepository.listActivityHistoryByWorkspaceId = async () =>
    [
      {
        id: 'activity_1',
        actorId: 'user_1',
        eventType: 'usage.dashboard_opened',
        metadataJson: {
          route: '/app/usage',
          workspaceId: 'ws_1',
        },
        createdAt: new Date('2026-03-24T11:55:00.000Z'),
      },
    ] as any;

  const result = await service.listUsageHistoryForCurrentSession(createConnectedSessionSnapshot(), {
    workspaceId: 'ws_1',
    source: 'telemetry',
    installationId: 'inst_chrome_1',
    eventType: 'extension.quiz_answer_requested',
    limit: 20,
  });

  assert.equal(result.workspace.id, 'ws_1');
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.exportDecision.allowed, false);
  assert.match(result.exportDecision.reasons.join('; '), /Missing permission: usage:export/);
  assert.equal(result.filters.source, 'telemetry');
  assert.equal(result.filters.installationId, 'inst_chrome_1');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.source, 'telemetry');
  assert.equal(result.items[0]?.installationId, 'inst_chrome_1');
});

test('PlatformService.listUsageHistoryForCurrentSession returns filtered ai proxy events', async () => {
  let historyInput: unknown;
  const { service, usageRepository } = createPlatformService();

  usageRepository.listAiRequestHistoryByWorkspaceId = async (input: any) => {
    historyInput = input;

    return [
      {
        id: 'airq_1',
        userId: 'user_1',
        installationId: null,
        provider: 'openrouter',
        model: 'openrouter/auto',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        keySource: 'platform',
        status: 'error',
        errorCode: 'upstream_bad_gateway',
        durationMs: 780,
        requestMetadata: {
          requestId: 'req_error_1',
          messageCount: 1,
        },
        occurredAt: new Date('2026-03-24T12:10:00.000Z'),
      },
      {
        id: 'airq_2',
        userId: 'user_2',
        installationId: null,
        provider: 'openrouter',
        model: 'openrouter/auto',
        promptTokens: 10,
        completionTokens: 15,
        totalTokens: 25,
        keySource: 'platform',
        status: 'success',
        errorCode: null,
        durationMs: 240,
        requestMetadata: {
          requestId: 'req_success_1',
          messageCount: 2,
        },
        occurredAt: new Date('2026-03-24T12:05:00.000Z'),
      },
    ] as any;
  };

  const result = await service.listUsageHistoryForCurrentSession(createConnectedSessionSnapshot(), {
    workspaceId: 'ws_1',
    source: 'ai',
    actorId: 'user_1',
    eventType: 'ai.proxy.failed',
    limit: 20,
  });

  assert.equal(result.workspace.id, 'ws_1');
  assert.equal(result.exportDecision.allowed, false);
  assert.match(result.exportDecision.reasons.join('; '), /Missing permission: usage:export/);
  assert.equal(result.filters.source, 'ai');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.source, 'ai');
  assert.equal(result.items[0]?.eventType, 'ai.proxy.failed');
  assert.equal(result.items[0]?.actorId, 'user_1');
  assert.equal((historyInput as any).actorId, 'user_1');
});

test('PlatformService.listUsageHistoryForCurrentSession exposes exportDecision for usage exporters', async () => {
  const { service, usageRepository } = createPlatformService();

  usageRepository.listTelemetryHistoryByWorkspaceId = async () => [] as any;
  usageRepository.listActivityHistoryByWorkspaceId = async () => [] as any;
  usageRepository.listAiRequestHistoryByWorkspaceId = async () => [] as any;

  const result = await service.listUsageHistoryForCurrentSession(createUsageExportSessionSnapshot(), {
    workspaceId: 'ws_1',
    source: 'all',
    limit: 10,
  });

  assert.equal(result.workspace.id, 'ws_1');
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.exportDecision.allowed, true);
  assert.deepEqual(result.exportDecision.reasons, []);
});

test('PlatformService.listUsageHistoryForCurrentSession denies principals without usage:read', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () =>
      service.listUsageHistoryForCurrentSession(createUsageRestrictedSessionSnapshot(), {
        workspaceId: 'ws_1',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: usage:read/);
      return true;
    },
  );
});

test('PlatformService.listUsageHistoryForCurrentSession rejects incompatible source filters', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () =>
      service.listUsageHistoryForCurrentSession(createConnectedSessionSnapshot(), {
        workspaceId: 'ws_1',
        source: 'telemetry',
        actorId: 'user_1',
      }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match((error as Error).message, /actorId filter is only supported for activity or ai sources/);
      return true;
    },
  );
});

test('PlatformService.exportUsageForCurrentSession exports scoped usage data for principals with usage:export', async () => {
  const { service, subscriptionRepository, usageRepository, queueDispatchService } = createPlatformService();
  const queueDispatchRequests: any[] = [];

  subscriptionRepository.findCurrentByWorkspaceId = async () => createUsageSubscriptionRecord();
  usageRepository.listInstallationsByWorkspaceId = async () =>
    [
      {
        installationId: 'inst_chrome_1',
        browser: 'chrome',
        extensionVersion: '1.7.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync'],
        lastSeenAt: new Date('2026-03-24T11:58:00.000Z'),
      },
    ] as any;
  usageRepository.listQuotaCountersByWorkspaceId = async () =>
    [
      {
        key: 'limit.requests_per_day',
        consumed: 126,
        periodStart: new Date('2026-03-24T00:00:00.000Z'),
        periodEnd: new Date('2026-03-25T00:00:00.000Z'),
        updatedAt: new Date('2026-03-24T11:59:00.000Z'),
      },
    ] as any;
  usageRepository.listRecentTelemetryByWorkspaceId = async () =>
    [
      {
        id: 'telemetry_1',
        eventType: 'extension.quiz_answer_requested',
        severity: 'info',
        payloadJson: {
          questionType: 'multiple_choice',
          surface: 'content_script',
        },
        createdAt: new Date('2026-03-24T11:59:00.000Z'),
        installation: {
          installationId: 'inst_chrome_1',
        },
      },
    ] as any;
  usageRepository.listRecentActivityByWorkspaceId = async () =>
    [
      {
        id: 'activity_1',
        actorId: 'user_1',
        eventType: 'usage.dashboard_opened',
        metadataJson: {
          route: '/app/usage',
          workspaceId: 'ws_1',
        },
        createdAt: new Date('2026-03-24T11:50:00.000Z'),
      },
    ] as any;
  queueDispatchService.dispatch = async (request: any) => {
    queueDispatchRequests.push(request);

    return {
      id: 'audit-exports:test-job',
      queue: request.queue,
      payload: request.payload,
      createdAt: request.createdAt ?? '2026-03-24T12:00:00.000Z',
      attempts: request.attempts ?? 2,
    } as any;
  };

  const result = await service.exportUsageForCurrentSession(createUsageExportSessionSnapshot(), {
    workspaceId: 'ws_1',
    format: 'json',
    scope: 'events',
  });

  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.format, 'json');
  assert.equal(result.scope, 'events');
  assert.match(result.fileName, /^usage-demo-workspace-events-/);
  assert.match(result.content, /extension\.quiz_answer_requested/);
  assert.equal(queueDispatchRequests.length, 2);
  const auditExportQueueRequest = queueDispatchRequests.find((request) => request.queue === 'audit-exports');
  const quotaResetQueueRequest = queueDispatchRequests.find((request) => request.queue === 'quota-resets');

  assert.deepEqual(auditExportQueueRequest, {
    queue: 'audit-exports',
    payload: {
      exportType: 'usage',
      workspaceId: 'ws_1',
      format: 'json',
      scope: 'events',
      fileName: result.fileName,
      contentType: result.contentType,
      exportedAt: result.exportedAt,
      requestedByUserId: 'user_1',
    },
    attempts: 2,
  });
  assert.deepEqual(quotaResetQueueRequest, {
    queue: 'quota-resets',
    payload: {
      workspaceId: 'ws_1',
      key: 'limit.requests_per_day',
      consumed: 126,
      periodStart: '2026-03-24T00:00:00.000Z',
      periodEnd: '2026-03-25T00:00:00.000Z',
      nextPeriodStart: '2026-03-25T00:00:00.000Z',
      nextPeriodEnd: '2026-03-26T00:00:00.000Z',
      requestedAt: (quotaResetQueueRequest?.payload as Record<string, unknown>)?.requestedAt,
    },
    dedupeKey: 'ws_1:limit.requests_per_day:2026-03-25T00:00:00.000Z',
    attempts: 3,
  });
});

test('PlatformService.exportUsageForCurrentSession denies principals without usage:export', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () =>
      service.exportUsageForCurrentSession(createConnectedSessionSnapshot(), {
        workspaceId: 'ws_1',
        format: 'json',
        scope: 'full',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: usage:export/);
      return true;
    },
  );
});

test('PlatformService.exportUsageForCurrentSession rejects csv full exports', async () => {
  const { service, subscriptionRepository, usageRepository } = createPlatformService();

  subscriptionRepository.findCurrentByWorkspaceId = async () => createUsageSubscriptionRecord();
  usageRepository.listInstallationsByWorkspaceId = async () => [] as any;
  usageRepository.listQuotaCountersByWorkspaceId = async () => [] as any;
  usageRepository.listRecentTelemetryByWorkspaceId = async () => [] as any;
  usageRepository.listRecentActivityByWorkspaceId = async () => [] as any;

  await assert.rejects(
    () =>
      service.exportUsageForCurrentSession(createUsageExportSessionSnapshot(), {
        workspaceId: 'ws_1',
        format: 'csv',
        scope: 'full',
      }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match((error as Error).message, /CSV export requires a specific scope/);
      return true;
    },
  );
});

test('PlatformService.listFeatureFlagsForCurrentSession maps persisted feature flags for connected admins', async () => {
  const { service, featureFlagRepository } = createPlatformService();

  featureFlagRepository.findAll = async () =>
    [
      {
        key: 'beta.remote-config-v2',
        status: 'active',
        description: 'Enable v2 config payload.',
        enabled: true,
        rolloutPercentage: 50,
        minimumExtensionVersion: '1.5.0',
      },
      {
        key: 'ops.force-upgrade-banner',
        status: 'draft',
        description: 'Show force upgrade banner.',
        enabled: false,
        rolloutPercentage: null,
        minimumExtensionVersion: null,
      },
    ] as any;

  const result = await service.listFeatureFlagsForCurrentSession({
    ...createConnectedSessionSnapshot(),
    principal: {
      ...createConnectedSessionSnapshot().principal,
      systemRoles: ['admin'],
    },
    permissions: ['feature_flags:read', 'feature_flags:write'],
  });

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.writeDecision.allowed, true);
  assert.deepEqual(result.permissions, ['feature_flags:read', 'feature_flags:write']);
  assert.deepEqual(result.flags, [
    {
      key: 'beta.remote-config-v2',
      status: 'active',
      description: 'Enable v2 config payload.',
      enabled: true,
      rolloutPercentage: 50,
      minimumExtensionVersion: '1.5.0',
    },
    {
      key: 'ops.force-upgrade-banner',
      status: 'draft',
      description: 'Show force upgrade banner.',
      enabled: false,
      rolloutPercentage: undefined,
      minimumExtensionVersion: undefined,
    },
  ]);
});

test('PlatformService.updateFeatureFlagForCurrentSession persists rollout targeting updates for connected admins', async () => {
  const { service, featureFlagRepository } = createPlatformService();
  let capturedInput: any = null;

  featureFlagRepository.findByKey = async () =>
    ({
      id: 'flag_1',
      key: 'beta.remote-config-v2',
      status: 'active',
      description: 'Enable v2 config payload.',
      enabled: true,
      rolloutPercentage: 50,
      allowRolesJson: ['workspace_owner'],
      allowPlansJson: ['pro'],
      minimumExtensionVersion: '1.5.0',
      updatedAt: new Date('2026-03-23T12:00:00.000Z'),
      overrides: [],
    }) as any;
  featureFlagRepository.replaceDefinition = async (input) => {
    capturedInput = input;

    return {
      id: 'flag_1',
      key: input.key,
      status: input.status,
      description: input.description,
      enabled: input.enabled,
      rolloutPercentage: input.rolloutPercentage,
      allowRolesJson: input.allowRoles,
      allowPlansJson: input.allowPlans,
      minimumExtensionVersion: input.minimumExtensionVersion,
      updatedAt: new Date('2026-03-24T10:15:00.000Z'),
      overrides: [
        {
          id: 'override_user',
          featureFlagId: 'flag_1',
          userId: 'user_2',
          workspaceId: null,
          enabled: true,
          createdAt: new Date('2026-03-24T10:15:00.000Z'),
        },
        {
          id: 'override_workspace',
          featureFlagId: 'flag_1',
          userId: null,
          workspaceId: 'ws_2',
          enabled: true,
          createdAt: new Date('2026-03-24T10:15:00.000Z'),
        },
      ],
    } as any;
  };

  const result = await service.updateFeatureFlagForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      principal: {
        ...createConnectedSessionSnapshot().principal,
        systemRoles: ['admin'],
      },
      permissions: ['feature_flags:read', 'feature_flags:write'],
    },
    {
      key: 'beta.remote-config-v2',
      description: 'Enable the second-generation remote config payload.',
      status: 'paused',
      enabled: false,
      rolloutPercentage: 75,
      allowRoles: ['admin', 'workspace_owner'],
      allowPlans: ['business'],
      allowUsers: ['user_2'],
      allowWorkspaces: ['ws_2'],
      minimumExtensionVersion: null,
    },
  );

  assert.deepEqual(capturedInput, {
    key: 'beta.remote-config-v2',
    description: 'Enable the second-generation remote config payload.',
    status: 'paused',
    enabled: false,
    rolloutPercentage: 75,
    minimumExtensionVersion: null,
    allowRoles: ['admin', 'workspace_owner'],
    allowPlans: ['business'],
    allowUsers: ['user_2'],
    allowWorkspaces: ['ws_2'],
  });
  assert.deepEqual(result, {
    flag: {
      key: 'beta.remote-config-v2',
      status: 'paused',
      description: 'Enable the second-generation remote config payload.',
      enabled: false,
      rolloutPercentage: 75,
      allowRoles: ['admin', 'workspace_owner'],
      allowPlans: ['business'],
      allowUsers: ['user_2'],
      allowWorkspaces: ['ws_2'],
      minimumExtensionVersion: undefined,
    },
    updatedAt: '2026-03-24T10:15:00.000Z',
  });
});

test('PlatformService.listCompatibilityRulesForCurrentSession returns recent persisted compatibility rules', async () => {
  const { service, extensionCompatibilityRepository } = createPlatformService();

  extensionCompatibilityRepository.findRecent = async () =>
    [
      {
        id: 'compat_2',
        minimumVersion: '1.5.0',
        recommendedVersion: '1.7.0',
        supportedSchemaVersions: ['2', '3'],
        requiredCapabilities: ['quiz-capture', 'history-sync'],
        resultStatus: 'supported_with_warnings',
        reason: 'Prompt users to upgrade during phased rollout.',
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
      },
      {
        id: 'compat_1',
        minimumVersion: '1.4.0',
        recommendedVersion: '1.6.0',
        supportedSchemaVersions: ['2'],
        requiredCapabilities: ['quiz-capture'],
        resultStatus: 'supported',
        reason: null,
        createdAt: new Date('2026-03-23T12:00:00.000Z'),
      },
    ] as any;

  const result = await service.listCompatibilityRulesForCurrentSession({
    ...createConnectedSessionSnapshot(),
    principal: {
      ...createConnectedSessionSnapshot().principal,
      systemRoles: ['admin'],
    },
    permissions: ['compatibility_rules:manage'],
  });

  assert.equal(result.publishDecision.allowed, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.id, 'compat_2');
  assert.equal(result.items[0]?.resultStatus, 'supported_with_warnings');
  assert.equal(result.items[0]?.reason, 'Prompt users to upgrade during phased rollout.');
});

test('PlatformService.publishCompatibilityRuleForCurrentSession persists a new compatibility rule for admins', async () => {
  const { service, extensionCompatibilityRepository } = createPlatformService();
  let capturedInput: any = null;

  extensionCompatibilityRepository.create = async (input) => {
    capturedInput = input;

    return {
      id: 'compat_3',
      minimumVersion: input.minimumVersion,
      recommendedVersion: input.recommendedVersion,
      supportedSchemaVersions: input.supportedSchemaVersions,
      requiredCapabilities: input.requiredCapabilities,
      resultStatus: input.resultStatus,
      reason: input.reason ?? null,
      createdAt: new Date('2026-03-24T13:45:00.000Z'),
    } as any;
  };

  const result = await service.publishCompatibilityRuleForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      principal: {
        ...createConnectedSessionSnapshot().principal,
        systemRoles: ['admin'],
      },
      permissions: ['compatibility_rules:manage'],
    },
    {
      minimumVersion: '1.5.0',
      recommendedVersion: '1.7.0',
      supportedSchemaVersions: ['2', '3'],
      requiredCapabilities: ['quiz-capture', 'history-sync'],
      resultStatus: 'deprecated',
      reason: 'Schema v2 stays available, but upgrade prompts should remain visible.',
    },
  );

  assert.deepEqual(capturedInput, {
    minimumVersion: '1.5.0',
    recommendedVersion: '1.7.0',
    supportedSchemaVersions: ['2', '3'],
    requiredCapabilities: ['quiz-capture', 'history-sync'],
    resultStatus: 'deprecated',
    reason: 'Schema v2 stays available, but upgrade prompts should remain visible.',
  });
  assert.equal(result.rule.id, 'compat_3');
  assert.equal(result.rule.resultStatus, 'deprecated');
  assert.equal(result.rule.reason, 'Schema v2 stays available, but upgrade prompts should remain visible.');
  assert.equal(result.publishedAt, '2026-03-24T13:45:00.000Z');
});

test('PlatformService.publishRemoteConfigForCurrentSession persists a connected publish for admins', async () => {
  const { service, remoteConfigRepository, queueDispatchService } = createPlatformService();
  let capturedQueueRequest: any = null;

  remoteConfigRepository.publishVersion = async (input) =>
    ({
      id: 'rcv_1',
      workspaceId: input.workspaceId ?? null,
      publishedById: input.actorId,
      versionLabel: input.versionLabel,
      isActive: true,
      createdAt: new Date('2026-03-23T12:30:00.000Z'),
      layers: input.layers.map((layer, index) => ({
        id: `layer_${index + 1}`,
        remoteConfigVersionId: 'rcv_1',
        scope: layer.scope,
        priority: layer.priority,
        conditionsJson: layer.conditions ?? null,
        valuesJson: layer.values,
        createdAt: new Date('2026-03-23T12:30:00.000Z'),
      })),
    }) as any;
  queueDispatchService.dispatch = async (request: any) => {
    capturedQueueRequest = request;

    return {
      id: 'config-publish:test-job',
      queue: request.queue,
      payload: request.payload,
      dedupeKey: request.dedupeKey,
      createdAt: '2026-03-23T12:30:00.000Z',
      attempts: request.attempts ?? 1,
    } as any;
  };

  const result = await service.publishRemoteConfigForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      principal: {
        ...createConnectedSessionSnapshot().principal,
        systemRoles: ['admin'],
      },
      permissions: ['remote_config:publish'],
    },
    {
      versionLabel: 'integration-publish',
      workspaceId: 'ws_1',
      layers: [
        {
          id: 'global-core',
          scope: 'global',
          priority: 10,
          values: {
            aiProvider: 'openai',
          },
        },
        {
          id: 'workspace-hotfix',
          scope: 'workspace',
          priority: 90,
          conditions: {
            workspaceId: 'ws_1',
          },
          values: {
            answerStyle: 'detailed',
          },
        },
      ],
    },
  );

  assert.equal(result.publishResult.versionLabel, 'integration-publish');
  assert.equal(result.publishResult.appliedLayerCount, 2);
  assert.equal(result.publishResult.actorId, 'user_1');
  assert.equal(result.publishResult.workspaceId, 'ws_1');
  assert.equal(result.publishResult.publishedAt, '2026-03-23T12:30:00.000Z');
  assert.equal(result.auditLog.eventType, 'remote_config.published');
  assert.deepEqual(capturedQueueRequest, {
    queue: 'config-publish',
    payload: result.publishResult,
    dedupeKey: 'ws_1:integration-publish:2026-03-23T12:30:00.000Z',
    attempts: 5,
  });
  assert.deepEqual(result.preview.values, {
    aiProvider: 'openai',
    answerStyle: 'detailed',
  });
});

test('PlatformService.activateRemoteConfigVersionForCurrentSession reactivates a persisted version for admins', async () => {
  const { service, remoteConfigRepository } = createPlatformService();

  remoteConfigRepository.activateVersion = async (versionId) =>
    ({
      id: versionId,
      workspaceId: 'ws_1',
      publishedById: 'user_1',
      versionLabel: 'rollback-target',
      isActive: true,
      createdAt: new Date('2026-03-23T10:15:00.000Z'),
      publishedBy: {
        id: 'user_1',
        email: 'owner@quizmind.dev',
        displayName: 'Workspace Owner',
      },
      layers: [
        {
          id: 'layer_1',
          remoteConfigVersionId: versionId,
          scope: 'global',
          priority: 10,
          conditionsJson: null,
          valuesJson: {
            aiProvider: 'openai',
          },
          createdAt: new Date('2026-03-23T10:15:00.000Z'),
        },
      ],
    }) as any;

  const result = await service.activateRemoteConfigVersionForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      principal: {
        ...createConnectedSessionSnapshot().principal,
        systemRoles: ['admin'],
      },
      permissions: ['remote_config:publish'],
    },
    {
      versionId: 'rcv_rollback',
    },
  );

  assert.equal(result.version.id, 'rcv_rollback');
  assert.equal(result.version.versionLabel, 'rollback-target');
  assert.equal(result.version.workspaceId, 'ws_1');
  assert.equal(result.version.isActive, true);
  assert.equal(result.version.layers.length, 1);
  assert.ok(Number.isFinite(Date.parse(result.activatedAt)));
});

test('PlatformService.activateRemoteConfigVersionForCurrentSession rejects missing versions', async () => {
  const { service, remoteConfigRepository } = createPlatformService();

  remoteConfigRepository.activateVersion = async () => null;

  await assert.rejects(
    () =>
      service.activateRemoteConfigVersionForCurrentSession(
        {
          ...createConnectedSessionSnapshot(),
          principal: {
            ...createConnectedSessionSnapshot().principal,
            systemRoles: ['admin'],
          },
          permissions: ['remote_config:publish'],
        },
        {
          versionId: 'missing-version',
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof NotFoundException);
      assert.match((error as Error).message, /Remote config version not found/i);
      return true;
    },
  );
});

test('PlatformService.bootstrapExtensionForConnectedRuntime uses persisted flags, active config layers, and subscription plan', async () => {
  const {
    service,
    extensionCompatibilityRepository,
    featureFlagRepository,
    remoteConfigRepository,
    subscriptionRepository,
  } = createPlatformService();

  extensionCompatibilityRepository.findLatest = async () =>
    ({
      minimumVersion: '1.4.0',
      recommendedVersion: '1.6.0',
      supportedSchemaVersions: ['2'],
      requiredCapabilities: ['quiz-capture'],
      resultStatus: 'deprecated',
      reason: 'This rule keeps older builds in a deprecation state during staged rollout.',
    }) as any;

  featureFlagRepository.findAll = async () =>
    [
      {
        key: 'beta.remote-config-v2',
        status: 'active',
        description: 'Enable v2 payload.',
        enabled: true,
        rolloutPercentage: 100,
        minimumExtensionVersion: '1.5.0',
      },
      {
        key: 'ops.force-upgrade-banner',
        status: 'active',
        description: 'Show upgrade banner.',
        enabled: true,
        rolloutPercentage: null,
        minimumExtensionVersion: null,
      },
    ] as any;

  remoteConfigRepository.findActiveLayers = async () =>
    [
      {
        id: 'base',
        scope: 'global',
        priority: 5,
        conditionsJson: null,
        valuesJson: {
          bootstrapTheme: 'compact',
        },
        remoteConfigVersion: {
          workspaceId: null,
        },
      },
      {
        id: 'plan-pro',
        scope: 'plan',
        priority: 10,
        conditionsJson: {
          planCode: 'pro',
        },
        valuesJson: {
          bootstrapTheme: 'detailed',
        },
        remoteConfigVersion: {
          workspaceId: null,
        },
      },
      {
        id: 'workspace-layer',
        scope: 'workspace',
        priority: 20,
        conditionsJson: {
          workspaceId: 'ws_1',
        },
        valuesJson: {
          workspaceBootstrapEnabled: true,
        },
        remoteConfigVersion: {
          workspaceId: 'ws_1',
        },
      },
    ] as any;

  subscriptionRepository.findCurrentByWorkspaceId = async () =>
    ({
      plan: {
        code: 'pro',
      },
    }) as any;

  const result = await service.bootstrapExtensionForConnectedRuntime({
    installationId: 'inst_local_browser',
    userId: 'user_1',
    workspaceId: 'ws_1',
    environment: 'development',
    handshake: {
      extensionVersion: '1.5.0',
      schemaVersion: '2',
      capabilities: ['quiz-capture', 'history-sync'],
      browser: 'chrome',
    },
  });

  assert.equal(result.compatibility.status, 'deprecated');
  assert.equal(result.compatibility.reason, 'This rule keeps older builds in a deprecation state during staged rollout.');
  assert.equal(result.compatibility.minimumVersion, '1.4.0');
  assert.equal(result.compatibility.recommendedVersion, '1.6.0');
  assert.deepEqual(result.featureFlags, ['beta.remote-config-v2', 'ops.force-upgrade-banner']);
  assert.deepEqual(result.remoteConfig.values, {
    bootstrapTheme: 'detailed',
    workspaceBootstrapEnabled: true,
  });
  assert.deepEqual(result.remoteConfig.appliedLayerIds, ['base', 'plan-pro', 'workspace-layer']);
});

test('PlatformService.startSupportImpersonationForCurrentSession persists a connected impersonation session for support admins', async () => {
  const { service, supportImpersonationRepository } = createPlatformService();
  let capturedInput: any = null;

  supportImpersonationRepository.createSessionWithLogs = async (input) => {
    capturedInput = input;

    return {
      id: input.impersonationSessionId,
      supportActorId: input.supportActorId,
      targetUserId: input.targetUserId,
      workspaceId: input.workspaceId ?? null,
      reason: input.reason,
      createdAt: input.createdAt,
      endedAt: null,
    } as any;
  };

  const result = await service.startSupportImpersonationForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      user: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Support Admin',
        emailVerifiedAt: '2026-03-23T08:00:00.000Z',
      },
      principal: {
        ...createConnectedSessionSnapshot().principal,
        userId: 'support_1',
        email: 'support@quizmind.dev',
        systemRoles: ['admin'],
      },
      permissions: ['support:impersonate', 'workspaces:read'],
    },
    {
      targetUserId: 'user_2',
      workspaceId: 'ws_1',
      reason: 'Debugging workspace access drift.',
      supportTicketId: 'ticket-1',
      operatorNote: 'Requester reported the issue through the support queue.',
    },
  );

  assert.equal(result.result.supportActorId, 'support_1');
  assert.equal(result.result.targetUserId, 'user_2');
  assert.equal(result.result.workspaceId, 'ws_1');
  assert.equal(result.result.reason, 'Debugging workspace access drift.');
  assert.equal(result.result.supportTicket?.id, 'ticket-1');
  assert.equal(result.result.operatorNote, 'Requester reported the issue through the support queue.');
  assert.equal(result.auditLog.eventType, 'support.impersonation_started');
  assert.equal(result.securityLog.eventType, 'security.impersonation_started');
  assert.equal(capturedInput.supportActorId, 'support_1');
  assert.equal(capturedInput.targetUserId, 'user_2');
  assert.equal(capturedInput.workspaceId, 'ws_1');
  assert.equal(capturedInput.supportTicketId, 'ticket-1');
  assert.equal(capturedInput.reason, 'Debugging workspace access drift.');
  assert.equal(capturedInput.operatorNote, 'Requester reported the issue through the support queue.');
  assert.equal(capturedInput.impersonationSessionId, result.result.impersonationSessionId);
  assert.equal(capturedInput.createdAt.toISOString(), result.result.createdAt);
});

test('PlatformService.endSupportImpersonationForCurrentSession ends an active support session and emits termination logs', async () => {
  const { service, supportImpersonationRepository } = createPlatformService();
  let capturedInput: any = null;

  supportImpersonationRepository.findById = async () =>
    ({
      id: 'support-session-1',
      reason: 'Debugging workspace access drift.',
      closeReason: null,
      createdAt: new Date('2026-03-23T12:30:00.000Z'),
      endedAt: null,
      supportActor: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Support Admin',
      },
      targetUser: {
        id: 'user_2',
        email: 'viewer@quizmind.dev',
        displayName: 'Noah Viewer',
      },
      workspace: {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
      },
    }) as any;

  supportImpersonationRepository.endSessionWithLogs = async (input) => {
    capturedInput = input;

    return {
      id: 'support-session-1',
      reason: 'Debugging workspace access drift.',
      closeReason: input.closeReason ?? null,
      createdAt: new Date('2026-03-23T12:30:00.000Z'),
      endedAt: input.endedAt,
      supportActor: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Support Admin',
      },
      targetUser: {
        id: 'user_2',
        email: 'viewer@quizmind.dev',
        displayName: 'Noah Viewer',
      },
      workspace: {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
      },
    } as any;
  };

  const result = await service.endSupportImpersonationForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      user: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Support Admin',
        emailVerifiedAt: '2026-03-23T08:00:00.000Z',
      },
      principal: {
        ...createConnectedSessionSnapshot().principal,
        userId: 'support_1',
        email: 'support@quizmind.dev',
        systemRoles: ['admin'],
      },
      permissions: ['support:impersonate', 'workspaces:read'],
    },
    {
      impersonationSessionId: 'support-session-1',
      closeReason: 'Resolved after confirming the viewer role and removing stale denial cache.',
    },
  );

  assert.equal(result.impersonationSessionId, 'support-session-1');
  assert.equal(result.targetUserId, 'user_2');
  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.reason, 'Debugging workspace access drift.');
  assert.equal(result.createdAt, '2026-03-23T12:30:00.000Z');
  assert.ok(result.endedAt);
  assert.equal(result.closeReason, 'Resolved after confirming the viewer role and removing stale denial cache.');
  assert.equal(capturedInput.impersonationSessionId, 'support-session-1');
  assert.equal(capturedInput.auditLog.eventType, 'support.impersonation_ended');
  assert.equal(capturedInput.securityLog.eventType, 'security.impersonation_ended');
  assert.equal(capturedInput.auditLog.actorId, 'support_1');
  assert.equal(capturedInput.securityLog.actorId, 'support_1');
  assert.equal(capturedInput.closeReason, 'Resolved after confirming the viewer role and removing stale denial cache.');
  assert.equal(capturedInput.endedAt.toISOString(), result.endedAt);
  assert.equal(capturedInput.auditLog.metadata?.closeReason, 'Resolved after confirming the viewer role and removing stale denial cache.');
  assert.equal(capturedInput.securityLog.metadata?.closeReason, 'Resolved after confirming the viewer role and removing stale denial cache.');
});

test('PlatformService.endSupportImpersonationForCurrentSession is idempotent for already-ended sessions', async () => {
  const { service, supportImpersonationRepository } = createPlatformService();
  let endCalls = 0;

  supportImpersonationRepository.findById = async () =>
    ({
      id: 'support-session-1',
      reason: 'Already closed support session.',
      closeReason: 'Operator wrapped up the follow-up earlier.',
      createdAt: new Date('2026-03-23T12:30:00.000Z'),
      endedAt: new Date('2026-03-23T12:45:00.000Z'),
      supportActor: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Support Admin',
      },
      targetUser: {
        id: 'user_2',
        email: 'viewer@quizmind.dev',
        displayName: 'Noah Viewer',
      },
      workspace: {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
      },
    }) as any;

  supportImpersonationRepository.endSessionWithLogs = async () => {
    endCalls += 1;
    return null as any;
  };

  const result = await service.endSupportImpersonationForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      user: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Support Admin',
        emailVerifiedAt: '2026-03-23T08:00:00.000Z',
      },
      principal: {
        ...createConnectedSessionSnapshot().principal,
        userId: 'support_1',
        email: 'support@quizmind.dev',
        systemRoles: ['admin'],
      },
      permissions: ['support:impersonate', 'workspaces:read'],
    },
    {
      impersonationSessionId: 'support-session-1',
    },
  );

  assert.equal(result.impersonationSessionId, 'support-session-1');
  assert.equal(result.endedAt, '2026-03-23T12:45:00.000Z');
  assert.equal(result.closeReason, 'Operator wrapped up the follow-up earlier.');
  assert.equal(endCalls, 0);
});

test('PlatformService.listSupportTicketsForCurrentSession maps persisted support tickets for support admins', async () => {
  const { service, supportTicketRepository, supportTicketPresetFavoriteRepository } = createPlatformService();
  let capturedTimelineLimit: number | undefined;

  supportTicketRepository.listRecent = async () =>
    [
      {
        id: 'ticket-1',
        subject: 'Viewer cannot access billing settings',
        body: 'The viewer is blocked from the billing settings page.',
        status: 'open',
        createdAt: new Date('2026-03-23T11:30:00.000Z'),
        updatedAt: new Date('2026-03-23T11:45:00.000Z'),
        requester: {
          id: 'user_2',
          email: 'viewer@quizmind.dev',
          displayName: 'Noah Viewer',
        },
        assignedTo: {
          id: 'support_1',
          email: 'support@quizmind.dev',
          displayName: 'Mila Support',
        },
        workspace: {
          id: 'ws_1',
          slug: 'demo-workspace',
          name: 'Demo Workspace',
        },
        handoffNote: 'Support is already verifying the billing access path.',
      },
    ] as any;
  supportTicketRepository.listTimelineEntries = async (_ticketIds, limitPerTicket) => {
    capturedTimelineLimit = limitPerTicket;

    return [
      {
        id: 'audit-ticket-1',
        actorId: 'support_1',
        action: 'support.ticket_workflow_updated',
        targetType: 'support_ticket',
        targetId: 'ticket-1',
        metadataJson: {
          summary: 'assigned the ticket to Mila Support; changed status from open to in progress; updated the handoff note',
          actorEmail: 'support@quizmind.dev',
          actorDisplayName: 'Mila Support',
          previousStatus: 'open',
          nextStatus: 'in_progress',
          nextAssignee: {
            id: 'support_1',
            email: 'support@quizmind.dev',
            displayName: 'Mila Support',
          },
          handoffNote: 'Support is already verifying the billing access path.',
        },
        createdAt: new Date('2026-03-23T11:46:00.000Z'),
      },
    ] as any;
  };
  supportTicketPresetFavoriteRepository.listByUserId = async () => ['shared_queue'];

  const result = await service.listSupportTicketsForCurrentSession({
    ...createConnectedSessionSnapshot(),
    user: {
      id: 'support_1',
      email: 'support@quizmind.dev',
      displayName: 'Support Admin',
      emailVerifiedAt: '2026-03-23T08:00:00.000Z',
    },
    principal: {
      ...createConnectedSessionSnapshot().principal,
      userId: 'support_1',
      email: 'support@quizmind.dev',
      systemRoles: ['admin'],
    },
    permissions: ['support:impersonate', 'workspaces:read'],
  });

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.accessDecision.allowed, true);
  assert.deepEqual(result.filters, {
    status: 'active',
    ownership: 'all',
    limit: 8,
    timelineLimit: 4,
  });
  assert.deepEqual(result.favoritePresets, ['shared_queue']);
  assert.equal(capturedTimelineLimit, 4);
  assert.deepEqual(result.items, [
    {
      id: 'ticket-1',
      subject: 'Viewer cannot access billing settings',
      body: 'The viewer is blocked from the billing settings page.',
      status: 'open',
      createdAt: '2026-03-23T11:30:00.000Z',
      updatedAt: '2026-03-23T11:45:00.000Z',
      requester: {
        id: 'user_2',
        email: 'viewer@quizmind.dev',
        displayName: 'Noah Viewer',
      },
      assignedTo: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Mila Support',
      },
      workspace: {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
      },
      handoffNote: 'Support is already verifying the billing access path.',
      timeline: [
        {
          id: 'audit-ticket-1',
          eventType: 'support.ticket_workflow_updated',
          summary: 'assigned the ticket to Mila Support; changed status from open to in progress; updated the handoff note',
          occurredAt: '2026-03-23T11:46:00.000Z',
          actor: {
            id: 'support_1',
            email: 'support@quizmind.dev',
            displayName: 'Mila Support',
          },
          previousStatus: 'open',
          nextStatus: 'in_progress',
          nextAssignee: {
            id: 'support_1',
            email: 'support@quizmind.dev',
            displayName: 'Mila Support',
          },
          handoffNote: 'Support is already verifying the billing access path.',
        },
      ],
    },
  ]);
});

test('PlatformService.listSupportTicketsForCurrentSession applies queue filters before reading timeline history', async () => {
  const { service, supportTicketRepository, supportTicketPresetFavoriteRepository } = createPlatformService();
  let capturedListRecentInput: any = null;
  let capturedTimelineLimit: number | undefined;

  supportTicketRepository.listRecent = async (input) => {
    capturedListRecentInput = input;

    return [
      {
        id: 'ticket-filtered-1',
        subject: 'Billing follow-up for workspace owner',
        body: 'Need to review a billing workflow handoff.',
        status: 'in_progress',
        createdAt: new Date('2026-03-23T11:30:00.000Z'),
        updatedAt: new Date('2026-03-23T12:10:00.000Z'),
        requester: {
          id: 'user_3',
          email: 'owner@quizmind.dev',
          displayName: 'Owner User',
        },
        assignedTo: {
          id: 'support_1',
          email: 'support@quizmind.dev',
          displayName: 'Mila Support',
        },
        workspace: {
          id: 'ws_1',
          slug: 'demo-workspace',
          name: 'Demo Workspace',
        },
        handoffNote: 'Billing investigation is active.',
      },
    ] as any;
  };
  supportTicketRepository.listTimelineEntries = async (_ticketIds, limitPerTicket) => {
    capturedTimelineLimit = limitPerTicket;

    return [];
  };
  supportTicketPresetFavoriteRepository.listByUserId = async () => ['my_active'];

  const result = await service.listSupportTicketsForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      user: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Mila Support',
        emailVerifiedAt: '2026-03-23T08:00:00.000Z',
      },
      principal: {
        ...createConnectedSessionSnapshot().principal,
        userId: 'support_1',
        email: 'support@quizmind.dev',
        systemRoles: ['admin'],
      },
      permissions: ['support:impersonate', 'workspaces:read'],
    },
    {
      status: 'in_progress',
      ownership: 'mine',
      search: ' billing ',
      limit: 12,
      timelineLimit: 2,
    },
  );

  assert.deepEqual(capturedListRecentInput, {
    statuses: ['in_progress'],
    assignedToUserId: 'support_1',
    search: 'billing',
    limit: 12,
  });
  assert.equal(capturedTimelineLimit, 2);
  assert.deepEqual(result.filters, {
    status: 'in_progress',
    ownership: 'mine',
    search: 'billing',
    limit: 12,
    timelineLimit: 2,
  });
  assert.deepEqual(result.favoritePresets, ['my_active']);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.id, 'ticket-filtered-1');
});

test('PlatformService.listSupportTicketsForCurrentSession expands named queue presets into repository filters', async () => {
  const { service, supportTicketRepository, supportTicketPresetFavoriteRepository } = createPlatformService();
  let capturedListRecentInput: any = null;
  let capturedTimelineLimit: number | undefined;

  supportTicketRepository.listRecent = async (input) => {
    capturedListRecentInput = input;

    return [];
  };
  supportTicketRepository.listTimelineEntries = async (_ticketIds, limitPerTicket) => {
    capturedTimelineLimit = limitPerTicket;

    return [];
  };
  supportTicketPresetFavoriteRepository.listByUserId = async () => ['shared_queue', 'my_active'];

  const result = await service.listSupportTicketsForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      user: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Mila Support',
        emailVerifiedAt: '2026-03-23T08:00:00.000Z',
      },
      principal: {
        ...createConnectedSessionSnapshot().principal,
        userId: 'support_1',
        email: 'support@quizmind.dev',
        systemRoles: ['admin'],
      },
      permissions: ['support:impersonate', 'workspaces:read'],
    },
    {
      preset: 'shared_queue',
    },
  );

  assert.deepEqual(capturedListRecentInput, {
    statuses: ['open'],
    unassignedOnly: true,
    limit: 8,
  });
  assert.equal(capturedTimelineLimit, 4);
  assert.deepEqual(result.filters, {
    preset: 'shared_queue',
    status: 'open',
    ownership: 'unassigned',
    limit: 8,
    timelineLimit: 4,
  });
  assert.deepEqual(result.favoritePresets, ['shared_queue', 'my_active']);
});

test('PlatformService.updateSupportTicketPresetFavoriteForCurrentSession persists a personal queue preset favorite', async () => {
  const { service, supportTicketPresetFavoriteRepository } = createPlatformService();
  let capturedInput: any = null;

  supportTicketPresetFavoriteRepository.setFavorite = async (input) => {
    capturedInput = input;

    return ['shared_queue', 'resolved_review'];
  };

  const result = await service.updateSupportTicketPresetFavoriteForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      user: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Mila Support',
        emailVerifiedAt: '2026-03-23T08:00:00.000Z',
      },
      principal: {
        ...createConnectedSessionSnapshot().principal,
        userId: 'support_1',
        email: 'support@quizmind.dev',
        systemRoles: ['admin'],
      },
      permissions: ['support:impersonate', 'workspaces:read'],
    },
    {
      preset: 'resolved_review',
      favorite: true,
    },
  );

  assert.deepEqual(capturedInput, {
    userId: 'support_1',
    preset: 'resolved_review',
    favorite: true,
  });
  assert.deepEqual(result, {
    preset: 'resolved_review',
    favorite: true,
    favorites: ['shared_queue', 'resolved_review'],
  });
});

test('PlatformService.updateSupportTicketForCurrentSession persists ticket ownership, status, and handoff note', async () => {
  const { service, supportTicketRepository } = createPlatformService();
  let capturedInput: any = null;

  supportTicketRepository.findById = async () =>
    ({
      id: 'ticket-1',
      subject: 'Viewer cannot access billing settings',
      body: 'The viewer is blocked from the billing settings page.',
      status: 'open',
      createdAt: new Date('2026-03-23T11:30:00.000Z'),
      updatedAt: new Date('2026-03-23T11:45:00.000Z'),
      requester: {
        id: 'user_2',
        email: 'viewer@quizmind.dev',
        displayName: 'Noah Viewer',
      },
      assignedTo: null,
      workspace: {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
      },
      handoffNote: null,
    }) as any;

  supportTicketRepository.updateWorkflow = async (input) => {
    capturedInput = input;

    return {
      id: 'ticket-1',
      subject: 'Viewer cannot access billing settings',
      body: 'The viewer is blocked from the billing settings page.',
      status: input.status,
      createdAt: new Date('2026-03-23T11:30:00.000Z'),
      updatedAt: new Date('2026-03-23T12:05:00.000Z'),
      requester: {
        id: 'user_2',
        email: 'viewer@quizmind.dev',
        displayName: 'Noah Viewer',
      },
      assignedTo: {
        id: input.assignedToUserId,
        email: 'support@quizmind.dev',
        displayName: 'Mila Support',
      },
      workspace: {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
      },
      handoffNote: input.handoffNote,
    } as any;
  };
  supportTicketRepository.listTimelineEntries = async () =>
    [
      {
        id: 'audit-ticket-1',
        actorId: 'support_1',
        action: 'support.ticket_workflow_updated',
        targetType: 'support_ticket',
        targetId: 'ticket-1',
        metadataJson: {
          summary: 'assigned the ticket to Mila Support; changed status from open to in progress; updated the handoff note',
          actorEmail: 'support@quizmind.dev',
          actorDisplayName: 'Mila Support',
          previousStatus: 'open',
          nextStatus: 'in_progress',
          nextAssignee: {
            id: 'support_1',
            email: 'support@quizmind.dev',
            displayName: 'Mila Support',
          },
          handoffNote: 'Claimed during unit coverage while validating the billing access complaint.',
        },
        createdAt: new Date('2026-03-23T12:05:00.000Z'),
      },
    ] as any;

  const result = await service.updateSupportTicketForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      user: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Mila Support',
        emailVerifiedAt: '2026-03-23T08:00:00.000Z',
      },
      principal: {
        ...createConnectedSessionSnapshot().principal,
        userId: 'support_1',
        email: 'support@quizmind.dev',
        systemRoles: ['admin'],
      },
      permissions: ['support:impersonate', 'workspaces:read'],
    },
    {
      supportTicketId: 'ticket-1',
      status: 'in_progress',
      assignedToUserId: 'support_1',
      handoffNote: 'Claimed during unit coverage while validating the billing access complaint.',
    },
  );

  assert.equal(result.id, 'ticket-1');
  assert.equal(result.status, 'in_progress');
  assert.equal(result.assignedTo?.id, 'support_1');
  assert.equal(result.handoffNote, 'Claimed during unit coverage while validating the billing access complaint.');
  assert.equal(result.timeline?.[0]?.summary, 'assigned the ticket to Mila Support; changed status from open to in progress; updated the handoff note');
  assert.equal(capturedInput.supportTicketId, 'ticket-1');
  assert.equal(capturedInput.status, 'in_progress');
  assert.equal(capturedInput.assignedToUserId, 'support_1');
  assert.equal(capturedInput.handoffNote, 'Claimed during unit coverage while validating the billing access complaint.');
  assert.equal(capturedInput.auditLog.eventType, 'support.ticket_workflow_updated');
  assert.equal(capturedInput.auditLog.targetId, 'ticket-1');
  assert.equal(
    capturedInput.auditLog.metadata?.summary,
    'assigned the ticket to Mila Support; changed status from open to in progress; updated the handoff note',
  );
});

test('PlatformService.listSupportImpersonationSessionsForCurrentSession maps persisted support sessions for support admins', async () => {
  const { service, supportImpersonationRepository } = createPlatformService();

  supportImpersonationRepository.listRecent = async () =>
    [
      {
        id: 'support-session-1',
        reason: 'Investigating billing access drift.',
        closeReason: null,
        createdAt: new Date('2026-03-23T12:30:00.000Z'),
        endedAt: null,
        supportActor: {
          id: 'support_1',
          email: 'support@quizmind.dev',
          displayName: 'Mila Support',
        },
        targetUser: {
          id: 'user_2',
          email: 'viewer@quizmind.dev',
          displayName: 'Noah Viewer',
        },
        workspace: {
          id: 'ws_1',
          slug: 'demo-workspace',
          name: 'Demo Workspace',
        },
      },
    ] as any;

  const result = await service.listSupportImpersonationSessionsForCurrentSession({
    ...createConnectedSessionSnapshot(),
    user: {
      id: 'support_1',
      email: 'support@quizmind.dev',
      displayName: 'Mila Support',
      emailVerifiedAt: '2026-03-23T08:00:00.000Z',
    },
    principal: {
      ...createConnectedSessionSnapshot().principal,
      userId: 'support_1',
      email: 'support@quizmind.dev',
      systemRoles: ['admin'],
    },
    permissions: ['support:impersonate', 'workspaces:read'],
  });

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.accessDecision.allowed, true);
  assert.deepEqual(result.permissions, ['support:impersonate', 'workspaces:read']);
  assert.deepEqual(result.items, [
    {
      impersonationSessionId: 'support-session-1',
      supportActor: {
        id: 'support_1',
        email: 'support@quizmind.dev',
        displayName: 'Mila Support',
      },
      targetUser: {
        id: 'user_2',
        email: 'viewer@quizmind.dev',
        displayName: 'Noah Viewer',
      },
      workspace: {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
      },
      reason: 'Investigating billing access drift.',
      createdAt: '2026-03-23T12:30:00.000Z',
      endedAt: null,
    },
  ]);
});

test('PlatformService.listSupportImpersonationSessionsForCurrentSession denies principals without support impersonation permission', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () => service.listSupportImpersonationSessionsForCurrentSession(createConnectedSessionSnapshot()),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: support:impersonate/);
      return true;
    },
  );
});

test('PlatformService.listSupportTicketsForCurrentSession denies principals without support impersonation permission', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () => service.listSupportTicketsForCurrentSession(createConnectedSessionSnapshot()),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: support:impersonate/);
      return true;
    },
  );
});

test('PlatformService.updateSupportTicketForCurrentSession denies principals without support impersonation permission', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () =>
      service.updateSupportTicketForCurrentSession(createConnectedSessionSnapshot(), {
        supportTicketId: 'ticket-1',
        status: 'in_progress',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: support:impersonate/);
      return true;
    },
  );
});

test('PlatformService.startSupportImpersonationForCurrentSession denies principals without support impersonation permission', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () =>
      service.startSupportImpersonationForCurrentSession(createConnectedSessionSnapshot(), {
        targetUserId: 'user_2',
        workspaceId: 'ws_1',
        reason: 'Attempted support action without permission.',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: support:impersonate/);
      return true;
    },
  );
});

test('PlatformService.endSupportImpersonationForCurrentSession denies principals without support impersonation permission', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () =>
      service.endSupportImpersonationForCurrentSession(createConnectedSessionSnapshot(), {
        impersonationSessionId: 'support-session-1',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: support:impersonate/);
      return true;
    },
  );
});

test('PlatformService.startSupportImpersonationForCurrentSession requires a target user', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () =>
      service.startSupportImpersonationForCurrentSession(
        {
          ...createConnectedSessionSnapshot(),
          principal: {
            ...createConnectedSessionSnapshot().principal,
            systemRoles: ['admin'],
          },
          permissions: ['support:impersonate'],
        },
        {
          reason: 'Missing target user should fail fast.',
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match((error as Error).message, /Target user is required/);
      return true;
    },
  );
});

test('PlatformService.endSupportImpersonationForCurrentSession requires an impersonation session id', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () =>
      service.endSupportImpersonationForCurrentSession(
        {
          ...createConnectedSessionSnapshot(),
          principal: {
            ...createConnectedSessionSnapshot().principal,
            systemRoles: ['admin'],
          },
          permissions: ['support:impersonate'],
        },
        {},
      ),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match((error as Error).message, /Impersonation session is required/);
      return true;
    },
  );
});

test('PlatformService.updateSupportTicketForCurrentSession requires a support ticket id', async () => {
  const { service } = createPlatformService();

  await assert.rejects(
    () =>
      service.updateSupportTicketForCurrentSession(
        {
          ...createConnectedSessionSnapshot(),
          principal: {
            ...createConnectedSessionSnapshot().principal,
            systemRoles: ['admin'],
          },
          permissions: ['support:impersonate'],
        },
        {
          status: 'in_progress',
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match((error as Error).message, /Support ticket is required/);
      return true;
    },
  );
});
