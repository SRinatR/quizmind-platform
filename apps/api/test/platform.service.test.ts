import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PlatformService } from '../src/platform.service';
import { type CurrentSessionSnapshot } from '../src/auth/auth.types';
import { type UserRepository } from '../src/auth/repositories/user.repository';
import { type SubscriptionRepository } from '../src/billing/subscription.repository';
import { type ExtensionCompatibilityRepository } from '../src/extension/extension-compatibility.repository';
import { type FeatureFlagRepository } from '../src/feature-flags/feature-flag.repository';
import { type QueueDispatchService } from '../src/queue/queue-dispatch.service';
import { type RemoteConfigRepository } from '../src/remote-config/remote-config.repository';
import { type InfrastructureHealthService } from '../src/services/infrastructure-health-service';
import { type SupportImpersonationRepository } from '../src/support/support-impersonation.repository';
import { type SupportTicketPresetFavoriteRepository } from '../src/support/support-ticket-preset-favorite.repository';
import { type SupportTicketRepository } from '../src/support/support-ticket.repository';
import { type UsageRepository } from '../src/usage/usage.repository';
import { type WorkspaceRepository } from '../src/workspaces/workspace.repository';

function createPlatformService() {
  const infrastructureHealthService = {} as InfrastructureHealthService;
  const subscriptionRepository = {} as SubscriptionRepository;
  const extensionCompatibilityRepository = {} as ExtensionCompatibilityRepository;
  const featureFlagRepository = {} as FeatureFlagRepository;
  const remoteConfigRepository = {} as RemoteConfigRepository;
  const workspaceRepository = {} as WorkspaceRepository;
  const userRepository = {} as UserRepository;
  const supportTicketRepository = {} as SupportTicketRepository;
  const supportTicketPresetFavoriteRepository = {} as SupportTicketPresetFavoriteRepository;
  const supportImpersonationRepository = {} as SupportImpersonationRepository;
  const usageRepository = {} as UsageRepository;
  const queueDispatchService = {} as QueueDispatchService;
  const service = new PlatformService(
    infrastructureHealthService,
    subscriptionRepository,
    extensionCompatibilityRepository,
    featureFlagRepository,
    remoteConfigRepository,
    workspaceRepository,
    userRepository,
    supportTicketRepository,
    supportTicketPresetFavoriteRepository,
    supportImpersonationRepository,
    usageRepository,
    queueDispatchService,
  );

  return {
    service,
    subscriptionRepository,
    extensionCompatibilityRepository,
    featureFlagRepository,
    remoteConfigRepository,
    workspaceRepository,
    userRepository,
    supportTicketRepository,
    supportTicketPresetFavoriteRepository,
    supportImpersonationRepository,
    usageRepository,
    queueDispatchService,
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

test('PlatformService.listUsersForCurrentSession maps Prisma-backed users into admin directory entries', async () => {
  const { service, userRepository } = createPlatformService();

  userRepository.listAll = async () =>
    [
      {
        id: 'user_1',
        email: 'admin@quizmind.dev',
        displayName: 'QuizMind Admin',
        emailVerifiedAt: new Date('2026-03-23T08:00:00.000Z'),
        suspendedAt: null,
        lastLoginAt: new Date('2026-03-23T12:00:00.000Z'),
        systemRoleAssignments: [{ role: 'platform_admin' }],
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
        systemRoleAssignments: [{ role: 'support_admin' }],
        memberships: [],
      },
    ] as any;

  const result = await service.listUsersForCurrentSession({
    ...createConnectedSessionSnapshot(),
    principal: {
      ...createConnectedSessionSnapshot().principal,
      systemRoles: ['platform_admin'],
    },
    permissions: ['users:read', 'workspaces:read'],
  });

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.accessDecision.allowed, true);
  assert.deepEqual(result.items, [
    {
      id: 'user_1',
      email: 'admin@quizmind.dev',
      displayName: 'QuizMind Admin',
      emailVerifiedAt: '2026-03-23T08:00:00.000Z',
      suspendedAt: null,
      lastLoginAt: '2026-03-23T12:00:00.000Z',
      systemRoles: ['platform_admin'],
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
      systemRoles: ['support_admin'],
      workspaces: [],
    },
  ]);
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
      systemRoles: ['platform_admin'],
    },
    permissions: ['feature_flags:read', 'remote_config:publish'],
  });

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.publishDecision.allowed, true);
  assert.deepEqual(result.permissions, ['feature_flags:read', 'remote_config:publish']);
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
        systemRoles: ['platform_admin'],
      },
      permissions: ['feature_flags:read', 'feature_flags:write'],
    },
    {
      key: 'beta.remote-config-v2',
      description: 'Enable the second-generation remote config payload.',
      status: 'paused',
      enabled: false,
      rolloutPercentage: 75,
      allowRoles: ['platform_admin', 'workspace_owner'],
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
    allowRoles: ['platform_admin', 'workspace_owner'],
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
      allowRoles: ['platform_admin', 'workspace_owner'],
      allowPlans: ['business'],
      allowUsers: ['user_2'],
      allowWorkspaces: ['ws_2'],
      minimumExtensionVersion: undefined,
    },
    updatedAt: '2026-03-24T10:15:00.000Z',
  });
});

test('PlatformService.publishRemoteConfigForCurrentSession persists a connected publish for admins', async () => {
  const { service, remoteConfigRepository } = createPlatformService();

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

  const result = await service.publishRemoteConfigForCurrentSession(
    {
      ...createConnectedSessionSnapshot(),
      principal: {
        ...createConnectedSessionSnapshot().principal,
        systemRoles: ['platform_admin'],
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
        systemRoles: ['platform_admin'],
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
            systemRoles: ['platform_admin'],
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

  assert.equal(result.compatibility.status, 'supported_with_warnings');
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
        systemRoles: ['support_admin'],
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
        systemRoles: ['support_admin'],
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
        systemRoles: ['support_admin'],
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
      systemRoles: ['support_admin'],
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
        systemRoles: ['support_admin'],
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
        systemRoles: ['support_admin'],
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
        systemRoles: ['support_admin'],
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
        systemRoles: ['support_admin'],
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
      systemRoles: ['support_admin'],
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
            systemRoles: ['support_admin'],
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
            systemRoles: ['support_admin'],
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
            systemRoles: ['support_admin'],
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
