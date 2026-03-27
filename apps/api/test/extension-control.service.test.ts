import assert from 'node:assert/strict';
import test from 'node:test';

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { buildDefaultAiAccessPolicy } from '@quizmind/providers';

import { ExtensionControlService } from '../src/extension/extension-control.service';
import { type CurrentSessionSnapshot } from '../src/auth/auth.types';
import { type ExtensionCompatibilityRepository } from '../src/extension/extension-compatibility.repository';
import { type ExtensionEventRepository } from '../src/extension/extension-event.repository';
import { type ExtensionInstallationRepository } from '../src/extension/extension-installation.repository';
import { type ExtensionInstallationSessionRepository } from '../src/extension/extension-installation-session.repository';
import { type FeatureFlagRepository } from '../src/feature-flags/feature-flag.repository';
import { type AiProviderPolicyService } from '../src/providers/ai-provider-policy.service';
import { type RemoteConfigRepository } from '../src/remote-config/remote-config.repository';
import { type SubscriptionRepository } from '../src/billing/subscription.repository';
import { type UsageRepository } from '../src/usage/usage.repository';
import { type QueueDispatchService } from '../src/queue/queue-dispatch.service';

function createConnectedSession(): CurrentSessionSnapshot {
  return {
    personaKey: 'connected-user',
    personaLabel: 'Connected User',
    notes: [],
    user: {
      id: 'user_1',
      email: 'owner@quizmind.dev',
      displayName: 'Workspace Owner',
      emailVerifiedAt: '2026-03-24T12:00:00.000Z',
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
    permissions: ['workspaces:read', 'subscriptions:read', 'subscriptions:update'],
  };
}

function createInstallationManagerSession(): CurrentSessionSnapshot {
  return {
    ...createConnectedSession(),
    permissions: ['installations:read', 'installations:write', 'workspaces:read'],
  };
}

function createInstallationViewerSession(): CurrentSessionSnapshot {
  const session = createConnectedSession();

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

function createService() {
  const extensionInstallationRepository = {} as ExtensionInstallationRepository;
  const extensionInstallationSessionRepository = {} as ExtensionInstallationSessionRepository;
  const extensionCompatibilityRepository = {} as ExtensionCompatibilityRepository;
  const extensionEventRepository = {
    recordLifecycleEvent: async () => undefined,
  } as ExtensionEventRepository;
  const featureFlagRepository = {} as FeatureFlagRepository;
  const remoteConfigRepository = {} as RemoteConfigRepository;
  const aiProviderPolicyService = {
    resolvePolicyForWorkspace: async () => ({
      scopeType: 'global',
      scopeKey: 'global',
      workspaceId: null,
      updatedById: null,
      createdAt: '2026-03-24T12:00:00.000Z',
      updatedAt: '2026-03-24T12:00:00.000Z',
      ...buildDefaultAiAccessPolicy({
        defaultModel: 'openrouter/auto',
      }),
    }),
  } as AiProviderPolicyService;
  const subscriptionRepository = {} as SubscriptionRepository;
  const usageRepository = {} as UsageRepository;
  const queueDispatchService = {} as QueueDispatchService;
  const service = new ExtensionControlService(
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
    extensionCompatibilityRepository,
    extensionEventRepository,
    featureFlagRepository,
    remoteConfigRepository,
    aiProviderPolicyService,
    subscriptionRepository,
    usageRepository,
    queueDispatchService,
  );

  service['env'] = {
    nodeEnv: 'test',
    appUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:4000',
    databaseUrl: 'postgresql://postgres:postgres@localhost:5432/quizmind',
    redisUrl: 'redis://localhost:6379',
    runtimeMode: 'connected',
    port: 4000,
    corsAllowedOrigins: ['http://localhost:3000'],
    jwtSecret: 'jwt-secret',
    jwtRefreshSecret: 'refresh-secret',
    extensionTokenSecret: 'extension-secret',
    extensionSessionTtlMinutes: 30,
    providerCredentialSecret: 'provider-secret',
    jwtIssuer: 'http://localhost:4000',
    jwtAudience: 'http://localhost:3000',
    emailProvider: 'noop',
    emailFrom: 'noreply@quizmind.local',
    billingProvider: 'stripe',
    stripeSecretKey: 'sk_test_secret',
    stripeWebhookSecret: 'whsec_test_secret',
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 120,
    authRateLimitWindowMs: 900000,
    authRateLimitMaxRequests: 10,
  };

  return {
    service,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
    extensionCompatibilityRepository,
    extensionEventRepository,
    featureFlagRepository,
    remoteConfigRepository,
    aiProviderPolicyService,
    subscriptionRepository,
    usageRepository,
    queueDispatchService,
  };
}

test('ExtensionControlService.bindInstallationForCurrentSession issues an installation session and bootstrap v2 payload', async () => {
  const {
    service,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
    extensionCompatibilityRepository,
    featureFlagRepository,
    remoteConfigRepository,
    subscriptionRepository,
    usageRepository,
  } = createService();

  extensionInstallationRepository.findByInstallationId = async () => null as any;
  extensionInstallationRepository.upsertBoundInstallation = async (input) =>
    ({
      id: 'inst_record_1',
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      installationId: input.installationId,
      browser: input.browser,
      extensionVersion: input.extensionVersion,
      schemaVersion: input.schemaVersion,
      capabilitiesJson: input.capabilities,
      createdAt: new Date('2026-03-24T12:00:00.000Z'),
      updatedAt: new Date('2026-03-24T12:00:00.000Z'),
      lastSeenAt: input.lastSeenAt,
    }) as any;
  extensionInstallationSessionRepository.create = async (input) =>
    ({
      id: 'inst_session_1',
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date('2026-03-24T12:00:00.000Z'),
      installation: {
        id: 'inst_record_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        installationId: 'inst_local_browser',
        browser: 'chrome',
        extensionVersion: '1.6.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync'],
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T12:00:00.000Z'),
      },
    }) as any;
  extensionCompatibilityRepository.findLatest = async () => null;
  featureFlagRepository.findAll = async () => [{ key: 'alpha', status: 'active', description: 'alpha', enabled: true }] as any;
  remoteConfigRepository.findActiveLayers = async () => [] as any;
  subscriptionRepository.findCurrentByWorkspaceId = async () =>
    ({
      workspaceId: 'ws_1',
      planId: 'plan_pro',
      status: 'active',
      billingInterval: 'monthly',
      cancelAtPeriodEnd: false,
      seatCount: 3,
      currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
      plan: {
        id: 'plan_pro',
        code: 'pro',
        name: 'Pro',
        description: 'Expanded limits',
        entitlements: [
          { key: 'feature.text_answering', enabled: true, limitValue: null },
          { key: 'limit.requests_per_day', enabled: true, limitValue: 100 },
        ],
      },
      workspace: {
        entitlementOverrides: [],
      },
    }) as any;
  usageRepository.listQuotaCountersByWorkspaceId = async () => [] as any;

  const result = await service.bindInstallationForCurrentSession(createConnectedSession(), {
    installationId: 'inst_local_browser',
    workspaceId: 'ws_1',
    environment: 'development',
    handshake: {
      extensionVersion: '1.6.0',
      buildId: 'build_123',
      schemaVersion: '2',
      capabilities: ['quiz-capture', 'history-sync'],
      browser: 'chrome',
    },
  });

  assert.equal(result.installation.installationId, 'inst_local_browser');
  assert.equal(result.installation.buildId, 'build_123');
  assert.ok(result.session.token.length > 20);
  assert.equal(result.bootstrap.installationId, 'inst_local_browser');
  assert.equal(result.bootstrap.featureFlags[0], 'alpha');
  assert.equal(result.bootstrap.entitlements[1]?.key, 'limit.requests_per_day');
  assert.equal(result.bootstrap.quotaHints[0]?.key, 'limit.requests_per_day');
  assert.equal(result.bootstrap.aiAccessPolicy.mode, 'platform_only');
});

test('ExtensionControlService.bindInstallationForCurrentSession records reconnect lifecycle events when installation already exists', async () => {
  const {
    service,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
    extensionCompatibilityRepository,
    extensionEventRepository,
    featureFlagRepository,
    remoteConfigRepository,
    subscriptionRepository,
    usageRepository,
  } = createService();
  let capturedEventType: string | null = null;
  let capturedSecurityEventType: string | null = null;

  extensionInstallationRepository.findByInstallationId = async () =>
    ({
      id: 'inst_record_1',
      userId: 'user_1',
      workspaceId: 'ws_1',
      installationId: 'inst_local_browser',
      browser: 'chrome',
      extensionVersion: '1.6.0',
      schemaVersion: '2',
      capabilitiesJson: ['quiz-capture', 'history-sync'],
      createdAt: new Date('2026-03-24T11:00:00.000Z'),
      updatedAt: new Date('2026-03-24T11:00:00.000Z'),
      lastSeenAt: new Date('2026-03-24T11:00:00.000Z'),
    }) as any;
  extensionInstallationRepository.upsertBoundInstallation = async (input) =>
    ({
      id: 'inst_record_1',
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      installationId: input.installationId,
      browser: input.browser,
      extensionVersion: input.extensionVersion,
      schemaVersion: input.schemaVersion,
      capabilitiesJson: input.capabilities,
      createdAt: new Date('2026-03-24T12:00:00.000Z'),
      updatedAt: new Date('2026-03-24T12:00:00.000Z'),
      lastSeenAt: input.lastSeenAt,
    }) as any;
  extensionInstallationSessionRepository.create = async (input) =>
    ({
      id: 'inst_session_1',
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date('2026-03-24T12:00:00.000Z'),
      installation: {
        id: 'inst_record_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        installationId: 'inst_local_browser',
        browser: 'chrome',
        extensionVersion: '1.6.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync'],
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T12:00:00.000Z'),
      },
    }) as any;
  extensionEventRepository.recordLifecycleEvent = async (input) => {
    capturedEventType = input.auditLog.eventType;
    capturedSecurityEventType = input.securityLog.eventType;
  };
  extensionCompatibilityRepository.findLatest = async () => null;
  featureFlagRepository.findAll = async () => [] as any;
  remoteConfigRepository.findActiveLayers = async () => [] as any;
  subscriptionRepository.findCurrentByWorkspaceId = async () => null as any;
  usageRepository.listQuotaCountersByWorkspaceId = async () => [] as any;

  await service.bindInstallationForCurrentSession(createConnectedSession(), {
    installationId: 'inst_local_browser',
    workspaceId: 'ws_1',
    environment: 'development',
    handshake: {
      extensionVersion: '1.6.1',
      schemaVersion: '2',
      capabilities: ['quiz-capture', 'history-sync'],
      browser: 'chrome',
    },
  });

  assert.equal(capturedEventType, 'extension.installation_reconnected');
  assert.equal(capturedSecurityEventType, 'extension.installation_session_reissued');
});

test('ExtensionControlService.bootstrapInstallationSession refreshes bootstrap for a valid installation session', async () => {
  const {
    service,
    extensionInstallationRepository,
    extensionCompatibilityRepository,
    featureFlagRepository,
    remoteConfigRepository,
    subscriptionRepository,
    usageRepository,
  } = createService();

  extensionInstallationRepository.upsertBoundInstallation = async (input) =>
    ({
      id: 'inst_record_1',
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      installationId: input.installationId,
      browser: input.browser,
      extensionVersion: input.extensionVersion,
      schemaVersion: input.schemaVersion,
      capabilitiesJson: input.capabilities,
      createdAt: new Date('2026-03-24T12:00:00.000Z'),
      updatedAt: new Date('2026-03-24T12:05:00.000Z'),
      lastSeenAt: input.lastSeenAt,
    }) as any;
  extensionCompatibilityRepository.findLatest = async () => null;
  featureFlagRepository.findAll = async () => [] as any;
  remoteConfigRepository.findActiveLayers = async () => [] as any;
  subscriptionRepository.findCurrentByWorkspaceId = async () => null as any;
  usageRepository.listQuotaCountersByWorkspaceId = async () => [] as any;

  const result = await service.bootstrapInstallationSession(
    {
      installation: {
        id: 'inst_record_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        installationId: 'inst_local_browser',
        browser: 'chrome',
        extensionVersion: '1.6.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture'],
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T12:00:00.000Z'),
      },
    } as any,
    {
      installationId: 'inst_local_browser',
      environment: 'production',
      handshake: {
        extensionVersion: '1.6.1',
        schemaVersion: '2',
        capabilities: ['quiz-capture'],
        browser: 'chrome',
      },
    },
  );

  assert.equal(result.installationId, 'inst_local_browser');
  assert.equal(result.compatibility.status, 'supported');
  assert.equal(result.refreshAfterSeconds, 900);
});

test('ExtensionControlService.ingestUsageEventForInstallationSession queues workspace-derived telemetry', async () => {
  const { service, queueDispatchService } = createService();
  let capturedPayload: any = null;

  queueDispatchService.dispatch = async (input) => {
    capturedPayload = input.payload;

    return {
      id: 'usage-events:job_1',
      queue: 'usage-events',
      dedupeKey: input.dedupeKey,
      createdAt: '2026-03-24T12:00:00.000Z',
      attempts: 5,
      payload: input.payload,
    };
  };

  const result = await service.ingestUsageEventForInstallationSession(
    {
      installation: {
        id: 'inst_record_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        installationId: 'inst_local_browser',
        browser: 'chrome',
        extensionVersion: '1.6.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync'],
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T12:00:00.000Z'),
      },
    } as any,
    {
      eventType: 'extension.quiz_answer_requested',
      occurredAt: '2026-03-24T12:15:00.000Z',
      payload: {
        questionType: 'multiple_choice',
      },
    },
  );

  assert.equal(result.queue, 'usage-events');
  assert.equal(capturedPayload.workspaceId, 'ws_1');
  assert.equal(capturedPayload.payload.browser, 'chrome');
  assert.equal(capturedPayload.payload.questionType, 'multiple_choice');
});

test('ExtensionControlService.ingestUsageEventForInstallationSession persists lifecycle logs for bootstrap refresh failures', async () => {
  const { service, queueDispatchService, extensionEventRepository } = createService();
  let capturedLifecycleEvent: any = null;

  queueDispatchService.dispatch = async (input) => ({
    id: 'usage-events:job_1',
    queue: 'usage-events',
    dedupeKey: input.dedupeKey,
    createdAt: '2026-03-24T12:00:00.000Z',
    attempts: 5,
    payload: input.payload,
  });
  extensionEventRepository.recordLifecycleEvent = async (input) => {
    capturedLifecycleEvent = input;
  };

  await service.ingestUsageEventForInstallationSession(
    {
      installation: {
        id: 'inst_record_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        installationId: 'inst_local_browser',
        browser: 'chrome',
        extensionVersion: '1.6.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync'],
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T12:00:00.000Z'),
      },
    } as any,
    {
      eventType: 'extension.bootstrap_refresh_failed',
      occurredAt: '2026-03-24T12:25:00.000Z',
      payload: {
        reason: 'token_expired',
      },
    },
  );

  assert.equal(capturedLifecycleEvent?.auditLog.eventType, 'extension.bootstrap_refresh_failed');
  assert.equal(capturedLifecycleEvent?.securityLog.eventType, 'extension.bootstrap_refresh_failed');
  assert.equal(capturedLifecycleEvent?.securityLog.severity, 'warn');
  assert.equal(capturedLifecycleEvent?.domainEventType, 'extension.bootstrap_refresh_failed');
  assert.equal((capturedLifecycleEvent?.domainPayload as any)?.sourceEventType, 'extension.bootstrap_refresh_failed');
});

test('ExtensionControlService.ingestUsageEventForInstallationSession skips lifecycle persistence for routine usage events', async () => {
  const { service, queueDispatchService, extensionEventRepository } = createService();
  let lifecycleEventCount = 0;

  queueDispatchService.dispatch = async (input) => ({
    id: 'usage-events:job_1',
    queue: 'usage-events',
    dedupeKey: input.dedupeKey,
    createdAt: '2026-03-24T12:00:00.000Z',
    attempts: 5,
    payload: input.payload,
  });
  extensionEventRepository.recordLifecycleEvent = async () => {
    lifecycleEventCount += 1;
  };

  await service.ingestUsageEventForInstallationSession(
    {
      installation: {
        id: 'inst_record_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        installationId: 'inst_local_browser',
        browser: 'chrome',
        extensionVersion: '1.6.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync'],
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T12:00:00.000Z'),
      },
    } as any,
    {
      eventType: 'extension.quiz_answer_requested',
      occurredAt: '2026-03-24T12:15:00.000Z',
      payload: {
        questionType: 'multiple_choice',
      },
    },
  );

  assert.equal(lifecycleEventCount, 0);
});

test('ExtensionControlService.resolveInstallationSession records refresh failure lifecycle events for invalid tokens', async () => {
  const {
    service,
    extensionInstallationSessionRepository,
    extensionEventRepository,
  } = createService();
  let capturedEventType: string | null = null;

  extensionInstallationSessionRepository.findActiveByTokenHash = async () => null as any;
  extensionEventRepository.recordLifecycleEvent = async (input) => {
    capturedEventType = input.securityLog.eventType;
  };

  await assert.rejects(
    () => service.resolveInstallationSession('invalid_installation_token'),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      return true;
    },
  );

  assert.equal(capturedEventType, 'extension.installation_session_refresh_failed');
});

test('ExtensionControlService.listInstallationsForCurrentSession returns compatibility and active session inventory', async () => {
  const {
    service,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
    extensionCompatibilityRepository,
  } = createService();

  extensionInstallationRepository.listByWorkspaceId = async () =>
    [
      {
        id: 'inst_record_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        installationId: 'inst_primary',
        browser: 'chrome',
        extensionVersion: '1.7.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync', 'remote-sync'],
        createdAt: new Date('2026-03-24T10:00:00.000Z'),
        updatedAt: new Date('2026-03-24T10:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T12:00:00.000Z'),
      },
      {
        id: 'inst_record_2',
        userId: 'user_2',
        workspaceId: 'ws_1',
        installationId: 'inst_stale',
        browser: 'edge',
        extensionVersion: '1.5.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture'],
        createdAt: new Date('2026-03-23T10:00:00.000Z'),
        updatedAt: new Date('2026-03-23T10:00:00.000Z'),
        lastSeenAt: new Date('2026-03-23T11:00:00.000Z'),
      },
    ] as any;
  extensionInstallationSessionRepository.listActiveByInstallationIds = async () =>
    [
      {
        id: 'inst_session_1',
        extensionInstallationId: 'inst_record_1',
        createdAt: new Date('2026-03-24T12:05:00.000Z'),
        expiresAt: new Date('2026-03-24T12:35:00.000Z'),
      },
    ] as any;
  extensionCompatibilityRepository.findLatest = async () =>
    ({
      id: 'rule_1',
      minimumVersion: '1.6.0',
      recommendedVersion: '1.7.0',
      supportedSchemaVersions: ['2'],
      requiredCapabilities: ['quiz-capture'],
      resultStatus: 'supported',
      reason: null,
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
    }) as any;

  const result = await service.listInstallationsForCurrentSession(createInstallationManagerSession(), 'ws_1');

  assert.equal(result.workspace.id, 'ws_1');
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.disconnectDecision.allowed, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.installationId, 'inst_primary');
  assert.equal(result.items[0]?.activeSessionCount, 1);
  assert.equal(result.items[0]?.requiresReconnect, false);
  assert.equal(result.items[0]?.compatibility.status, 'supported');
  assert.equal(result.items[1]?.installationId, 'inst_stale');
  assert.equal(result.items[1]?.activeSessionCount, 0);
  assert.equal(result.items[1]?.requiresReconnect, true);
  assert.equal(result.items[1]?.compatibility.status, 'unsupported');
});

test('ExtensionControlService.disconnectInstallationForCurrentSession revokes active installation sessions', async () => {
  const {
    service,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
  } = createService();
  let capturedInstallationRecordId: string | null = null;

  extensionInstallationRepository.findByInstallationId = async () =>
    ({
      id: 'inst_record_1',
      userId: 'user_1',
      workspaceId: 'ws_1',
      installationId: 'inst_primary',
      browser: 'chrome',
      extensionVersion: '1.7.0',
      schemaVersion: '2',
      capabilitiesJson: ['quiz-capture', 'history-sync'],
      createdAt: new Date('2026-03-24T10:00:00.000Z'),
      updatedAt: new Date('2026-03-24T10:00:00.000Z'),
      lastSeenAt: new Date('2026-03-24T12:00:00.000Z'),
    }) as any;
  extensionInstallationSessionRepository.revokeActiveByInstallationId = async (installationRecordId) => {
    capturedInstallationRecordId = installationRecordId;

    return 2;
  };

  const result = await service.disconnectInstallationForCurrentSession(createInstallationManagerSession(), {
    installationId: 'inst_primary',
    workspaceId: 'ws_1',
  });

  assert.equal(capturedInstallationRecordId, 'inst_record_1');
  assert.equal(result.installationId, 'inst_primary');
  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.revokedSessionCount, 2);
  assert.equal(result.requiresReconnect, true);
});

test('ExtensionControlService.rotateInstallationSessionForCurrentSession revokes active sessions and issues a fresh token', async () => {
  const {
    service,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
  } = createService();
  let capturedInstallationRecordId: string | null = null;

  extensionInstallationRepository.findByInstallationId = async () =>
    ({
      id: 'inst_record_1',
      userId: 'user_1',
      workspaceId: 'ws_1',
      installationId: 'inst_primary',
      browser: 'chrome',
      extensionVersion: '1.7.0',
      schemaVersion: '2',
      capabilitiesJson: ['quiz-capture', 'history-sync'],
      createdAt: new Date('2026-03-24T10:00:00.000Z'),
      updatedAt: new Date('2026-03-24T10:00:00.000Z'),
      lastSeenAt: new Date('2026-03-24T12:00:00.000Z'),
    }) as any;
  extensionInstallationSessionRepository.revokeActiveByInstallationId = async (installationRecordId) => {
    capturedInstallationRecordId = installationRecordId;

    return 2;
  };
  extensionInstallationSessionRepository.create = async (input) =>
    ({
      id: 'inst_session_rotated_1',
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date('2026-03-24T12:15:00.000Z'),
      installation: {
        id: 'inst_record_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        installationId: 'inst_primary',
        browser: 'chrome',
        extensionVersion: '1.7.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync'],
        createdAt: new Date('2026-03-24T10:00:00.000Z'),
        updatedAt: new Date('2026-03-24T10:00:00.000Z'),
        lastSeenAt: new Date('2026-03-24T12:00:00.000Z'),
      },
    }) as any;

  const result = await service.rotateInstallationSessionForCurrentSession(createInstallationManagerSession(), {
    installationId: 'inst_primary',
    workspaceId: 'ws_1',
  });

  assert.equal(capturedInstallationRecordId, 'inst_record_1');
  assert.equal(result.installationId, 'inst_primary');
  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.revokedSessionCount, 2);
  assert.ok(result.session.token.length > 20);
  assert.equal(result.session.refreshAfterSeconds, 900);
});

test('ExtensionControlService.disconnectInstallationForCurrentSession denies users without installation write permission', async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.disconnectInstallationForCurrentSession(createInstallationViewerSession(), {
        installationId: 'inst_primary',
        workspaceId: 'ws_1',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: installations:write/);
      return true;
    },
  );
});

test('ExtensionControlService.rotateInstallationSessionForCurrentSession denies users without installation write permission', async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.rotateInstallationSessionForCurrentSession(createInstallationViewerSession(), {
        installationId: 'inst_primary',
        workspaceId: 'ws_1',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: installations:write/);
      return true;
    },
  );
});
