import assert from 'node:assert/strict';
import test from 'node:test';

import { ExtensionControlService } from '../src/extension/extension-control.service';
import { type CurrentSessionSnapshot } from '../src/auth/auth.types';
import { type ExtensionCompatibilityRepository } from '../src/extension/extension-compatibility.repository';
import { type ExtensionInstallationRepository } from '../src/extension/extension-installation.repository';
import { type ExtensionInstallationSessionRepository } from '../src/extension/extension-installation-session.repository';
import { type FeatureFlagRepository } from '../src/feature-flags/feature-flag.repository';
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

function createService() {
  const extensionInstallationRepository = {} as ExtensionInstallationRepository;
  const extensionInstallationSessionRepository = {} as ExtensionInstallationSessionRepository;
  const extensionCompatibilityRepository = {} as ExtensionCompatibilityRepository;
  const featureFlagRepository = {} as FeatureFlagRepository;
  const remoteConfigRepository = {} as RemoteConfigRepository;
  const subscriptionRepository = {} as SubscriptionRepository;
  const usageRepository = {} as UsageRepository;
  const queueDispatchService = {} as QueueDispatchService;
  const service = new ExtensionControlService(
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
    extensionCompatibilityRepository,
    featureFlagRepository,
    remoteConfigRepository,
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
    featureFlagRepository,
    remoteConfigRepository,
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
