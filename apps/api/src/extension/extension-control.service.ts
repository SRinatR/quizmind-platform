import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createOpaqueToken, hashOpaqueToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import { buildExtensionBootstrapV2, evaluateCompatibility } from '@quizmind/extension';
import { createAuditLogEvent, createLogEvent, createSecurityLogEvent } from '@quizmind/logger';
import { buildDefaultAiAccessPolicy } from '@quizmind/providers';
import { createQueueDispatchRequest } from '@quizmind/queue';
import {
  type CompatibilityHandshake,
  type ExtensionBootstrapPayloadV2,
  type ExtensionBootstrapRequestV2,
  type ExtensionConnectionStatus,
  type ExtensionDeviceMetadata,
  type ExtensionInstallationDisconnectRequest,
  type ExtensionInstallationDisconnectResult,
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationBindResult,
  type ExtensionInstallationInventoryItem,
  type ExtensionInstallationInventorySnapshot,
  type ExtensionInstallationLabelUpdateResult,
  type ExtensionInstallationRotateSessionRequest,
  type ExtensionInstallationRotateSessionResult,
  type ExtensionInstallationSessionRefreshResult,
  type UsageEventIngestResult,
  type UsageEventPayload,
} from '@quizmind/contracts';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { QueueDispatchService } from '../queue/queue-dispatch.service';
import {
  canReadExtensionInstallations,
  canWriteExtensionInstallations,
} from '../services/access-service';
import {
  defaultCompatibilityPolicy,
  mapExtensionCompatibilityRuleToPolicy,
} from '../services/extension-bootstrap-service';
import { mapFeatureFlagRecordToDefinition } from '../services/feature-flags-service';
import { mapRemoteConfigLayerRecordToDefinition } from '../services/remote-config-service';
import { ExtensionCompatibilityRepository } from './extension-compatibility.repository';
import { ExtensionEventRepository } from './extension-event.repository';
import {
  ExtensionInstallationRepository,
  type ExtensionInstallationRecord,
} from './extension-installation.repository';
import {
  ExtensionInstallationSessionRepository,
  type ExtensionInstallationSessionRecord,
} from './extension-installation-session.repository';
import { FeatureFlagRepository } from '../feature-flags/feature-flag.repository';
import { RemoteConfigRepository } from '../remote-config/remote-config.repository';
import { AiProviderPolicyService } from '../providers/ai-provider-policy.service';
import { RetentionSettingsService } from '../settings/retention-settings.service';

function normalizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function readRequiredString(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new BadRequestException(`${fieldName} is required.`);
  }

  return normalized;
}

const maxEnvironmentLength = 64;
const environmentTokenPattern = /^[A-Za-z0-9._-]+$/;
// Presence heartbeat grace window: bootstrap/usage heartbeats are periodic and may be delayed by tab sleep/network jitter.
// Use 30 minutes to reduce false "offline" while still surfacing truly stale installs after uninstall/inactivity.
const extensionOnlineGraceMs = 30 * 60 * 1000;

const supportedHandshakeBrowsers: CompatibilityHandshake['browser'][] = [
  'chrome',
  'edge',
  'brave',
  'firefox',
  'safari',
  'other',
];

function readRequiredEnvironment(value: string | undefined, fieldName: string): string {
  const environment = readRequiredString(value, fieldName);

  if (environment.length > maxEnvironmentLength || !environmentTokenPattern.test(environment)) {
    throw new BadRequestException(
      `${fieldName} must be 1-${String(maxEnvironmentLength)} characters using A-Z, a-z, 0-9, ".", "_", or "-".`,
    );
  }

  return environment;
}

const maxExtensionActionReasonLength = 500;

function readRequiredActionReason(value: string | undefined): string {
  const reason = readRequiredString(value, 'reason');

  if (reason.length > maxExtensionActionReasonLength) {
    throw new BadRequestException(`reason must be at most ${maxExtensionActionReasonLength} characters.`);
  }

  return reason;
}

function normalizeBrowser(value: string): CompatibilityHandshake['browser'] {
  return supportedHandshakeBrowsers.includes(value as CompatibilityHandshake['browser'])
    ? (value as CompatibilityHandshake['browser'])
    : 'other';
}

type UsageLifecycleEventMapping = {
  auditEventType: string;
  securityEventType: string;
  securitySeverity: 'debug' | 'info' | 'warn' | 'error';
  status: 'success' | 'failure';
  summary: string;
};

const usageLifecycleEventMappings: Record<string, UsageLifecycleEventMapping> = {
  'extension.runtime_error': {
    auditEventType: 'extension.runtime_error',
    securityEventType: 'extension.runtime_error',
    securitySeverity: 'warn',
    status: 'failure',
    summary: 'extension runtime reported an error',
  },
  'extension.bootstrap_refresh_failed': {
    auditEventType: 'extension.bootstrap_refresh_failed',
    securityEventType: 'extension.bootstrap_refresh_failed',
    securitySeverity: 'warn',
    status: 'failure',
    summary: 'extension runtime reported bootstrap refresh failure',
  },
  'extension.installation_reconnect_requested': {
    auditEventType: 'extension.installation_reconnect_requested',
    securityEventType: 'extension.installation_reconnect_requested',
    securitySeverity: 'info',
    status: 'success',
    summary: 'extension runtime requested reconnect for installation session',
  },
  'extension.installation_reconnected': {
    auditEventType: 'extension.installation_reconnected',
    securityEventType: 'extension.installation_reconnected',
    securitySeverity: 'info',
    status: 'success',
    summary: 'extension runtime reported installation reconnected',
  },
};

const invalidInstallationTokenLogWindowMs = 10 * 60 * 1000;
const maxInvalidInstallationTokenLogKeys = 10_000;

interface InvalidInstallationTokenLogState {
  nextLogAt: number;
  suppressed: number;
}

interface ExtensionSessionPolicy {
  lifetimeHours: number;
  refreshAfterSeconds: number;
}

@Injectable()
export class ExtensionControlService {
  private readonly env = loadApiEnv();
  private readonly invalidInstallationTokenLogState = new Map<string, InvalidInstallationTokenLogState>();

  constructor(
    @Inject(ExtensionInstallationRepository)
    private readonly extensionInstallationRepository: ExtensionInstallationRepository,
    @Inject(ExtensionInstallationSessionRepository)
    private readonly extensionInstallationSessionRepository: ExtensionInstallationSessionRepository,
    @Inject(ExtensionCompatibilityRepository)
    private readonly extensionCompatibilityRepository: ExtensionCompatibilityRepository,
    @Inject(ExtensionEventRepository)
    private readonly extensionEventRepository: ExtensionEventRepository,
    @Inject(FeatureFlagRepository)
    private readonly featureFlagRepository: FeatureFlagRepository,
    @Inject(RemoteConfigRepository)
    private readonly remoteConfigRepository: RemoteConfigRepository,
    @Inject(AiProviderPolicyService)
    private readonly aiProviderPolicyService: AiProviderPolicyService,
    @Inject(QueueDispatchService)
    private readonly queueDispatchService: QueueDispatchService,
    @Inject(RetentionSettingsService)
    private readonly retentionSettingsService: RetentionSettingsService,
  ) {}

  async bindInstallationForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<ExtensionInstallationBindRequest>,
  ): Promise<ExtensionInstallationBindResult> {
    const sessionPolicy = await this.resolveExtensionSessionPolicy();
    const normalizedRequest = this.normalizeBindRequest(request);
    const occurredAt = new Date();
    const existingInstallation = await this.extensionInstallationRepository.findByInstallationId(
      normalizedRequest.installationId,
    );
    const installation = await this.extensionInstallationRepository.upsertBoundInstallation({
      userId: session.user.id,
      installationId: normalizedRequest.installationId,
      browser: normalizedRequest.handshake.browser,
      extensionVersion: normalizedRequest.handshake.extensionVersion,
      schemaVersion: normalizedRequest.handshake.schemaVersion,
      capabilities: normalizedRequest.handshake.capabilities,
      lastSeenAt: occurredAt,
      metadata: this.normalizeDeviceMetadata(request?.metadata),
    });
    const revokedSessionCount = await this.extensionInstallationSessionRepository.revokeActiveByInstallationId(
      installation.id,
      occurredAt,
    );
    const { sessionToken, tokenRecord } = await this.issueInstallationSession(
      installation,
      session.user.id,
      sessionPolicy.lifetimeHours,
    );
    const bootstrap = await this.buildBootstrapPayload({
      installation,
      environment: normalizedRequest.environment,
      handshake: normalizedRequest.handshake,
      issuedAt: occurredAt.toISOString(),
      refreshAfterSeconds: sessionPolicy.refreshAfterSeconds,
    });
    const result: ExtensionInstallationBindResult = {
      installation: {
        installationId: installation.installationId,
        userId: installation.userId,
        browser: installation.browser as CompatibilityHandshake['browser'],
        extensionVersion: installation.extensionVersion,
        schemaVersion: installation.schemaVersion,
        capabilities: normalizeCapabilities(installation.capabilitiesJson),
        lastSeenAt: (installation.lastSeenAt ?? occurredAt).toISOString(),
        boundAt: installation.createdAt.toISOString(),
      signedInAt: installation.createdAt.toISOString(),
        ...(normalizedRequest.handshake.buildId ? { buildId: normalizedRequest.handshake.buildId } : {}),
      },
      session: {
        token: sessionToken,
        expiresAt: tokenRecord.expiresAt.toISOString(),
        refreshAfterSeconds: sessionPolicy.refreshAfterSeconds,
      },
      bootstrap,
    };

    await this.recordLifecycleEventSafely({
      actorId: session.user.id,
      targetType: 'extension_installation',
      targetId: installation.installationId,
      auditEventType: existingInstallation
        ? 'extension.installation_reconnected'
        : 'extension.installation_bound',
      securityEventType: existingInstallation
        ? 'extension.installation_session_reissued'
        : 'extension.installation_session_issued',
      securitySeverity: 'info',
      status: 'success',
      summary: existingInstallation
        ? 'reconnected an extension installation session'
        : 'bound a new extension installation session',
      metadata: {
        installationId: installation.installationId,
        browser: installation.browser,
        extensionVersion: installation.extensionVersion,
        schemaVersion: installation.schemaVersion,
        capabilities: normalizeCapabilities(installation.capabilitiesJson),
        sessionExpiresAt: tokenRecord.expiresAt.toISOString(),
        refreshAfterSeconds: result.session.refreshAfterSeconds,
        revokedSessionCount,
        previousUserId: existingInstallation?.userId ?? null,
      },
      domainEventType: existingInstallation
        ? 'extension.installation_reconnected'
        : 'extension.installation_bound',
      domainPayload: {
        installationId: installation.installationId,
        actorId: session.user.id,
        sessionExpiresAt: tokenRecord.expiresAt.toISOString(),
        revokedSessionCount,
      },
      occurredAt,
    });

    return result;
  }

  async resolveInstallationSession(
    accessToken: string,
    context?: { endpoint?: string },
  ): Promise<ExtensionInstallationSessionRecord> {
    const tokenHash = hashOpaqueToken(accessToken, this.env.extensionTokenSecret);
    const tokenRecord = await this.extensionInstallationSessionRepository.findActiveByTokenHash(tokenHash);

    if (!tokenRecord) {
      this.logInvalidInstallationToken({
        tokenHash,
        endpoint: context?.endpoint,
      });
      throw new UnauthorizedException('Installation session is invalid or expired.');
    }

    return tokenRecord;
  }

  async bootstrapInstallationSession(
    installationSession: ExtensionInstallationSessionRecord,
    request?: Partial<ExtensionBootstrapRequestV2>,
  ): Promise<ExtensionBootstrapPayloadV2> {
    const sessionPolicy = await this.resolveExtensionSessionPolicy();
    const installationId = readRequiredString(
      request?.installationId ?? installationSession.installation.installationId,
      'installationId',
    );

    if (installationId !== installationSession.installation.installationId) {
      throw new UnauthorizedException('Installation session does not match the requested installation.');
    }

    const environment = readRequiredEnvironment(request?.environment ?? 'production', 'environment');
    const handshake = this.normalizeBootstrapHandshake(request?.handshake, installationSession.installation);
    const now = new Date();
    let installation: ExtensionInstallationRecord = {
      ...installationSession.installation,
      lastSeenAt: now,
    };

    try {
      installation = await this.extensionInstallationRepository.upsertBoundInstallation({
        userId: installationSession.installation.userId,
        installationId,
        browser: handshake.browser,
        extensionVersion: handshake.extensionVersion,
        schemaVersion: handshake.schemaVersion,
        capabilities: handshake.capabilities,
        lastSeenAt: now,
        metadata: this.mergeInstallationMetadata(installationSession.installation, this.normalizeDeviceMetadata(request?.metadata)),
      });
    } catch (error) {
      console.error('Failed to refresh extension installation metadata during bootstrap. Serving degraded bootstrap payload.', error);
    }

    try {
      return await this.buildBootstrapPayload({
        installation,
        environment,
        handshake,
        refreshAfterSeconds: sessionPolicy.refreshAfterSeconds,
      });
    } catch (error) {
      console.error('Failed to build extension bootstrap payload. Serving degraded bootstrap payload.', error);

      return await this.buildDegradedBootstrapPayload({
        installation,
        environment,
        handshake,
        refreshAfterSeconds: sessionPolicy.refreshAfterSeconds,
      });
    }
  }

  async ingestUsageEventForInstallationSession(
    installationSession: ExtensionInstallationSessionRecord,
    event?: Partial<UsageEventPayload>,
  ): Promise<UsageEventIngestResult> {
    const usageEvent: UsageEventPayload = {
      installationId: installationSession.installation.installationId,
      eventType: event?.eventType ?? 'extension.quiz_answer_requested',
      occurredAt: event?.occurredAt ?? new Date().toISOString(),
      payload: {
        browser: installationSession.installation.browser,
        extensionVersion: installationSession.installation.extensionVersion,
        schemaVersion: installationSession.installation.schemaVersion,
        capabilities: normalizeCapabilities(installationSession.installation.capabilitiesJson),
        ...(event?.payload ?? {}),
      },
    };

    let queueJob: Awaited<ReturnType<QueueDispatchService['dispatch']>>;

    try {
      queueJob = await this.queueDispatchService.dispatch(
        createQueueDispatchRequest({
          queue: 'usage-events',
          payload: usageEvent,
        }),
      );
    } catch (error) {
      const occurredAt = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.recordUsageLifecycleEventIfNeeded({
        installation: installationSession.installation,
        usageEvent,
      });
      await this.recordLifecycleEventSafely({
        actorId: installationSession.installation.userId,
        targetType: 'extension_installation',
        targetId: installationSession.installation.installationId,
        auditEventType: 'extension.usage_event_queue_failed',
        securityEventType: 'extension.usage_event_queue_failed',
        securitySeverity: 'error',
        status: 'failure',
        summary: 'extension usage event queue dispatch failed',
        metadata: {
          installationId: usageEvent.installationId,
          sourceEventType: usageEvent.eventType,
          errorMessage,
        },
        domainEventType: 'extension.usage_event_queue_failed',
        domainPayload: {
          installationId: usageEvent.installationId,
          sourceEventType: usageEvent.eventType,
          errorMessage,
        },
      });
      console.error('Failed to dispatch extension usage event to queue. Returning degraded ingest result.', error);

      return this.buildDegradedUsageIngestResult({
        usageEvent,
        occurredAt,
      });
    }

    const logEvent = createLogEvent({
      eventId: `usage:${usageEvent.installationId}:${usageEvent.occurredAt}`,
      eventType: 'extension.usage_queued',
      actorId: usageEvent.installationId,
      actorType: 'system',
      targetType: 'extension_usage_event',
      targetId: usageEvent.installationId,
      occurredAt: usageEvent.occurredAt,
      category: 'extension',
      severity: 'info',
      status: 'success',
      metadata: usageEvent.payload,
    });
    await this.recordUsageLifecycleEventIfNeeded({
      installation: installationSession.installation,
      usageEvent,
    });

    return {
      queued: true,
      queue: queueJob.queue,
      job: {
        id: queueJob.id,
        queue: queueJob.queue,
        dedupeKey: queueJob.dedupeKey,
        createdAt: queueJob.createdAt,
        attempts: queueJob.attempts,
      },
      handler: 'worker.process-usage-event',
      logEvent: {
        eventId: logEvent.eventId,
        eventType: logEvent.eventType,
        occurredAt: logEvent.occurredAt,
        status: logEvent.status ?? 'success',
      },
    };
  }

  private async buildDegradedBootstrapPayload(input: {
    installation: ExtensionInstallationRecord;
    environment: string;
    handshake: CompatibilityHandshake;
    refreshAfterSeconds: number;
  }): Promise<ExtensionBootstrapPayloadV2> {
    return buildExtensionBootstrapV2({
      installationId: input.installation.installationId,
      handshake: input.handshake,
      compatibilityPolicy: defaultCompatibilityPolicy,
      flagDefinitions: [],
      remoteConfigLayers: [],
      entitlements: [],
      quotaHints: [],
      aiAccessPolicy: buildDefaultAiAccessPolicy({
        mode: 'platform_only',
        providers: ['openrouter'],
        defaultProvider: 'openrouter',
        defaultModel: 'openrouter/auto',
        reason:
          'Fallback bootstrap policy is active because the connected bootstrap services are temporarily unavailable.',
      }),
      context: {
        environment: input.environment,
        userId: input.installation.userId,
        buildId: input.handshake.buildId,
      },
      refreshAfterSeconds: input.refreshAfterSeconds,
    });
  }

  private buildDegradedUsageIngestResult(input: {
    usageEvent: UsageEventPayload;
    occurredAt: string;
  }): UsageEventIngestResult {
    const fallbackJobId = `usage-events:degraded:${input.usageEvent.installationId}:${Date.now().toString()}`;

    return {
      queued: false,
      queue: 'usage-events',
      job: {
        id: fallbackJobId,
        queue: 'usage-events',
        createdAt: input.occurredAt,
        attempts: 0,
      },
      handler: 'worker.process-usage-event',
      logEvent: {
        eventId: `usage:degraded:${input.usageEvent.installationId}:${input.occurredAt}`,
        eventType: 'extension.usage_queue_degraded',
        occurredAt: input.occurredAt,
        status: 'failure',
      },
    };
  }

  private async recordUsageLifecycleEventIfNeeded(input: {
    installation: ExtensionInstallationSessionRecord['installation'];
    usageEvent: UsageEventPayload;
  }): Promise<void> {
    const mapping = usageLifecycleEventMappings[input.usageEvent.eventType];

    if (!mapping) {
      return;
    }

    const parsedOccurredAt = new Date(input.usageEvent.occurredAt);
    const occurredAt = Number.isNaN(parsedOccurredAt.getTime()) ? new Date() : parsedOccurredAt;

    await this.recordLifecycleEventSafely({
      actorId: input.installation.userId,
      targetType: 'extension_installation',
      targetId: input.installation.installationId,
      auditEventType: mapping.auditEventType,
      securityEventType: mapping.securityEventType,
      securitySeverity: mapping.securitySeverity,
      status: mapping.status,
      summary: mapping.summary,
      metadata: {
        sourceEventType: input.usageEvent.eventType,
        installationId: input.installation.installationId,
        payload: input.usageEvent.payload,
      },
      domainEventType: mapping.auditEventType,
      domainPayload: {
        sourceEventType: input.usageEvent.eventType,
        installationId: input.installation.installationId,
        payload: input.usageEvent.payload,
      },
      occurredAt,
    });
  }

  async listInstallationsForCurrentSession(
    session: CurrentSessionSnapshot,
  ): Promise<ExtensionInstallationInventorySnapshot> {
    const accessDecision = canReadExtensionInstallations(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const [installations, compatibilityRule] = await Promise.all([
      this.extensionInstallationRepository.listByUserId(session.user.id),
      this.extensionCompatibilityRepository.findLatest(),
    ]);
    const activeSessions = await this.extensionInstallationSessionRepository.listActiveByInstallationIds(
      installations.map((record) => record.id),
    );
    const compatibilityPolicy = compatibilityRule
      ? mapExtensionCompatibilityRuleToPolicy(compatibilityRule, defaultCompatibilityPolicy)
      : defaultCompatibilityPolicy;
    const sessionStats = new Map<
      string,
      {
        count: number;
        lastSessionIssuedAt?: string;
        lastSessionExpiresAt?: string;
      }
    >();

    for (const activeSession of activeSessions) {
      const current = sessionStats.get(activeSession.extensionInstallationId) ?? { count: 0 };
      const createdAt = activeSession.createdAt.toISOString();
      const expiresAt = activeSession.expiresAt.toISOString();

      sessionStats.set(activeSession.extensionInstallationId, {
        count: current.count + 1,
        lastSessionIssuedAt:
          !current.lastSessionIssuedAt || createdAt > current.lastSessionIssuedAt
            ? createdAt
            : current.lastSessionIssuedAt,
        lastSessionExpiresAt:
          !current.lastSessionExpiresAt || expiresAt > current.lastSessionExpiresAt
            ? expiresAt
            : current.lastSessionExpiresAt,
      });
    }

    const inventoryItems = installations
      .map((installation) => this.mapInstallationInventoryItem(installation, compatibilityPolicy, sessionStats))
      .filter((installation) => installation.connectionStatus !== 'reconnect_required' && installation.requiresReconnect !== true);

    return {
      accessDecision,
      disconnectDecision: canWriteExtensionInstallations(session.principal),
      items: inventoryItems,
      permissions: session.permissions,
    };
  }

  async updateInstallationLabelForCurrentSession(
    session: CurrentSessionSnapshot,
    installationId: string,
    deviceLabel: string | null | undefined,
  ): Promise<ExtensionInstallationLabelUpdateResult> {
    const accessDecision = canReadExtensionInstallations(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const normalizedInstallationId = readRequiredString(installationId, 'installationId');
    const trimmed = typeof deviceLabel === 'string' ? deviceLabel.trim() : null;

    if (trimmed && trimmed.length > 120) {
      throw new BadRequestException('deviceLabel must be at most 120 characters.');
    }

    const updated = await this.extensionInstallationRepository.updateDeviceLabelForUser(
      session.user.id,
      normalizedInstallationId,
      trimmed && trimmed.length > 0 ? trimmed : null,
    );

    if (!updated) {
      throw new NotFoundException('Extension installation not found.');
    }

    return {
      installationId: updated.installationId,
      deviceLabel: updated.deviceLabel ?? null,
    };
  }


  async disconnectInstallationForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<ExtensionInstallationDisconnectRequest>,
  ): Promise<ExtensionInstallationDisconnectResult> {
    const installationId = readRequiredString(request?.installationId, 'installationId');
    const accessDecision = canWriteExtensionInstallations(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const reason = readRequiredActionReason(request?.reason);

    const installation = await this.extensionInstallationRepository.findByInstallationId(installationId);

    if (!installation || installation.userId !== session.user.id) {
      throw new NotFoundException('Extension installation not found.');
    }

    const disconnectedAt = new Date();
    const revokedSessionCount = await this.extensionInstallationSessionRepository.revokeActiveByInstallationId(
      installation.id,
      disconnectedAt,
    );

    await this.recordLifecycleEventSafely({
      actorId: session.user.id,
      targetType: 'extension_installation',
      targetId: installation.installationId,
      auditEventType: 'extension.installation_disconnected',
      securityEventType: 'extension.installation_session_revoked',
      securitySeverity: 'info',
      status: 'success',
      summary: 'disconnected an extension installation and revoked active sessions',
      metadata: {
        installationId: installation.installationId,
        reason,
        revokedSessionCount,
        requiresReconnect: true,
      },
      domainEventType: 'extension.installation_disconnected',
      domainPayload: {
        installationId: installation.installationId,
        actorId: session.user.id,
        reason,
        revokedSessionCount,
      },
      occurredAt: disconnectedAt,
    });

    return {
      installationId: installation.installationId,
      revokedSessionCount,
      disconnectedAt: disconnectedAt.toISOString(),
      requiresReconnect: true,
    };
  }

  async selfDisconnectInstallationForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: { installationId?: string },
  ): Promise<ExtensionInstallationDisconnectResult> {
    const installationId = readRequiredString(request?.installationId, 'installationId');
    const accessDecision = canReadExtensionInstallations(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const installation = await this.extensionInstallationRepository.findByInstallationId(installationId);

    if (!installation || installation.userId !== session.user.id) {
      throw new NotFoundException('Extension installation not found.');
    }

    const disconnectedAt = new Date();
    const revokedSessionCount = await this.extensionInstallationSessionRepository.revokeActiveByInstallationId(
      installation.id,
      disconnectedAt,
    );

    await this.recordLifecycleEventSafely({
      actorId: session.user.id,
      targetType: 'extension_installation',
      targetId: installation.installationId,
      auditEventType: 'extension.installation_self_disconnected',
      securityEventType: 'extension.installation_session_revoked',
      securitySeverity: 'info',
      status: 'success',
      summary: 'self-disconnected an extension installation and revoked active sessions',
      metadata: {
        installationId: installation.installationId,
        revokedSessionCount,
        initiatedBy: 'user',
        requiresReconnect: true,
      },
      domainEventType: 'extension.installation_self_disconnected',
      domainPayload: {
        installationId: installation.installationId,
        actorId: session.user.id,
        revokedSessionCount,
      },
      occurredAt: disconnectedAt,
    });

    return {
      installationId: installation.installationId,
      revokedSessionCount,
      disconnectedAt: disconnectedAt.toISOString(),
      requiresReconnect: true,
    };
  }

  async rotateInstallationSessionForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<ExtensionInstallationRotateSessionRequest>,
  ): Promise<ExtensionInstallationRotateSessionResult> {
    const sessionPolicy = await this.resolveExtensionSessionPolicy();
    const installationId = readRequiredString(request?.installationId, 'installationId');
    const accessDecision = canWriteExtensionInstallations(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const reason = readRequiredActionReason(request?.reason);

    const installation = await this.extensionInstallationRepository.findByInstallationId(installationId);

    if (!installation || installation.userId !== session.user.id) {
      throw new NotFoundException('Extension installation not found.');
    }

    const rotatedAt = new Date();
    const revokedSessionCount = await this.extensionInstallationSessionRepository.revokeActiveByInstallationId(
      installation.id,
      rotatedAt,
    );
    const { sessionToken, tokenRecord } = await this.issueInstallationSession(
      installation,
      installation.userId,
      sessionPolicy.lifetimeHours,
    );

    await this.recordLifecycleEventSafely({
      actorId: session.user.id,
      targetType: 'extension_installation',
      targetId: installation.installationId,
      auditEventType: 'extension.installation_session_rotated',
      securityEventType: 'extension.installation_session_rotated',
      securitySeverity: 'info',
      status: 'success',
      summary: 'rotated an extension installation session token',
      metadata: {
        installationId: installation.installationId,
        reason,
        revokedSessionCount,
        sessionExpiresAt: tokenRecord.expiresAt.toISOString(),
        refreshAfterSeconds: sessionPolicy.refreshAfterSeconds,
      },
      domainEventType: 'extension.installation_session_rotated',
      domainPayload: {
        installationId: installation.installationId,
        actorId: session.user.id,
        reason,
        revokedSessionCount,
        sessionExpiresAt: tokenRecord.expiresAt.toISOString(),
      },
      occurredAt: rotatedAt,
    });

    return {
      installationId: installation.installationId,
      revokedSessionCount,
      rotatedAt: rotatedAt.toISOString(),
      session: {
        token: sessionToken,
        expiresAt: tokenRecord.expiresAt.toISOString(),
        refreshAfterSeconds: sessionPolicy.refreshAfterSeconds,
      },
    };
  }

  async refreshInstallationSessionForToken(
    installationSession: ExtensionInstallationSessionRecord,
  ): Promise<ExtensionInstallationSessionRefreshResult> {
    const sessionPolicy = await this.resolveExtensionSessionPolicy();
    const refreshedAt = new Date();
    await this.extensionInstallationSessionRepository.revoke(installationSession.id, refreshedAt);
    const { sessionToken, tokenRecord } = await this.issueInstallationSession(
      installationSession.installation,
      installationSession.installation.userId,
      sessionPolicy.lifetimeHours,
    );

    await this.recordLifecycleEventSafely({
      actorId: installationSession.installation.userId,
      targetType: 'extension_installation',
      targetId: installationSession.installation.installationId,
      auditEventType: 'extension.installation_session_refreshed',
      securityEventType: 'extension.installation_session_refreshed',
      securitySeverity: 'info',
      status: 'success',
      summary: 'extension installation session silently refreshed',
      metadata: {
        installationId: installationSession.installation.installationId,
        previousSessionId: installationSession.id,
        sessionExpiresAt: tokenRecord.expiresAt.toISOString(),
        refreshAfterSeconds: sessionPolicy.refreshAfterSeconds,
      },
      domainEventType: 'extension.installation_session_refreshed',
      domainPayload: {
        installationId: installationSession.installation.installationId,
        actorId: installationSession.installation.userId,
        sessionExpiresAt: tokenRecord.expiresAt.toISOString(),
      },
      occurredAt: refreshedAt,
    });

    return {
      installationId: installationSession.installation.installationId,
      installationToken: sessionToken,
      tokenExpiresAt: tokenRecord.expiresAt.toISOString(),
      refreshAfterSeconds: sessionPolicy.refreshAfterSeconds,
      status: 'refreshed' as const,
    };
  }

  private async buildBootstrapPayload(input: {
    installation: ExtensionInstallationRecord;
    environment: string;
    handshake: CompatibilityHandshake;
    issuedAt?: string;
    refreshAfterSeconds: number;
  }): Promise<ExtensionBootstrapPayloadV2> {
    const [compatibilityRule, featureFlags, remoteConfigLayers, aiAccessPolicy] = await Promise.all([
      this.extensionCompatibilityRepository.findLatest(),
      this.featureFlagRepository.findAll(),
      this.remoteConfigRepository.findActiveLayers(),
      this.aiProviderPolicyService.resolvePolicyForWorkspace(),
    ]);

    return buildExtensionBootstrapV2({
      installationId: input.installation.installationId,
      handshake: input.handshake,
      compatibilityPolicy: compatibilityRule
        ? mapExtensionCompatibilityRuleToPolicy(compatibilityRule)
        : {
            minimumVersion: '1.0.0',
            recommendedVersion: '1.6.0',
            supportedSchemaVersions: ['1', '2'],
            requiredCapabilities: ['quiz-capture'],
          },
      flagDefinitions: featureFlags.map(mapFeatureFlagRecordToDefinition),
      remoteConfigLayers: remoteConfigLayers.map(mapRemoteConfigLayerRecordToDefinition),
      entitlements: [],
      quotaHints: [],
      aiAccessPolicy,
      context: {
        environment: input.environment,
        userId: input.installation.userId,
        buildId: input.handshake.buildId,
      },
      issuedAt: input.issuedAt,
      refreshAfterSeconds: input.refreshAfterSeconds,
    });
  }

  private mapInstallationInventoryItem(
    installation: ExtensionInstallationRecord,
    compatibilityPolicy: ReturnType<typeof mapExtensionCompatibilityRuleToPolicy> | typeof defaultCompatibilityPolicy,
    sessionStats: Map<
      string,
      {
        count: number;
        lastSessionIssuedAt?: string;
        lastSessionExpiresAt?: string;
      }
    >,
  ): ExtensionInstallationInventoryItem {
    const installationSessionStats = sessionStats.get(installation.id);
    const activeSessionCount = installationSessionStats?.count ?? 0;
    const lastSessionExpiresAt = installationSessionStats?.lastSessionExpiresAt;
    const connectionStatus = this.computeConnectionStatus(activeSessionCount, installation.lastSeenAt, lastSessionExpiresAt);
    const compatibility = evaluateCompatibility(
      {
        extensionVersion: installation.extensionVersion,
        schemaVersion: installation.schemaVersion,
        capabilities: normalizeCapabilities(installation.capabilitiesJson),
        browser: normalizeBrowser(installation.browser),
      },
      compatibilityPolicy,
    );

    return {
      installationId: installation.installationId,
      browser: normalizeBrowser(installation.browser),
      extensionVersion: installation.extensionVersion,
      schemaVersion: installation.schemaVersion,
      capabilities: normalizeCapabilities(installation.capabilitiesJson),
      boundAt: installation.createdAt.toISOString(),
      signedInAt: installation.createdAt.toISOString(),
      ...(installation.lastSeenAt ? { lastSeenAt: installation.lastSeenAt.toISOString() } : {}),
      activeSessionCount,
      ...(installationSessionStats?.lastSessionIssuedAt
        ? { lastSessionIssuedAt: installationSessionStats.lastSessionIssuedAt }
        : {}),
      ...(lastSessionExpiresAt ? { lastSessionExpiresAt } : {}),
      compatibility,
      connectionStatus,
      requiresReconnect: connectionStatus === 'reconnect_required',
      isOnline: connectionStatus === 'connected',
      lastSeenStatus: installation.lastSeenAt ? (connectionStatus === 'connected' ? 'online' : 'offline') : 'unknown',
      ...(installation.deviceLabel ? { deviceLabel: installation.deviceLabel } : {}),
      ...(installation.platform ? { platform: installation.platform } : {}),
      ...(installation.osName ? { osName: installation.osName } : {}),
      ...(installation.osVersion ? { osVersion: installation.osVersion } : {}),
      ...(installation.browserName ? { browserName: installation.browserName } : {}),
      ...(installation.browserVersion ? { browserVersion: installation.browserVersion } : {}),
      ...(installation.userAgent ? { userAgent: installation.userAgent } : {}),
    };
  }

  private computeConnectionStatus(
    activeSessionCount: number,
    lastSeenAt: Date | null | undefined,
    lastSessionExpiresAt: string | undefined,
    now = new Date(),
  ): ExtensionConnectionStatus {
    if (activeSessionCount === 0) {
      return 'reconnect_required';
    }

    if (lastSessionExpiresAt) {
      const expiresAtMs = Date.parse(lastSessionExpiresAt);
      const EXPIRING_SOON_MS = 5 * 60 * 1000;

      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
        return 'reconnect_required';
      }
      if (expiresAtMs - now.getTime() <= EXPIRING_SOON_MS) {
        return 'expiring_soon';
      }
    }

    if (!lastSeenAt || now.getTime() - lastSeenAt.getTime() > extensionOnlineGraceMs) {
      return 'offline';
    }

    return 'connected';
  }

  private normalizeBindRequest(
    request?: Partial<ExtensionInstallationBindRequest>,
  ): ExtensionInstallationBindRequest {
    const installationId = readRequiredString(request?.installationId, 'installationId');
    const environment = readRequiredEnvironment(request?.environment ?? 'production', 'environment');
    const handshake = this.normalizeHandshake(request?.handshake);

    return {
      installationId,
      environment,
      handshake,
    };
  }

  private normalizeHandshake(handshake?: Partial<CompatibilityHandshake>): CompatibilityHandshake {
    const extensionVersion = readRequiredString(handshake?.extensionVersion, 'handshake.extensionVersion');
    const schemaVersion = readRequiredString(handshake?.schemaVersion, 'handshake.schemaVersion');
    const capabilities = normalizeCapabilities(handshake?.capabilities);

    if (capabilities.length === 0) {
      throw new BadRequestException('handshake.capabilities must contain at least one capability.');
    }

    const browser = handshake?.browser;

    if (!browser || !supportedHandshakeBrowsers.includes(browser)) {
      throw new BadRequestException(
        `handshake.browser must be one of ${supportedHandshakeBrowsers.join(', ')}.`,
      );
    }

    return {
      extensionVersion,
      schemaVersion,
      capabilities,
      browser,
      ...(handshake?.buildId?.trim() ? { buildId: handshake.buildId.trim() } : {}),
    };
  }

  private normalizeBootstrapHandshake(
    handshake: Partial<CompatibilityHandshake> | undefined,
    installation: ExtensionInstallationSessionRecord['installation'],
  ): CompatibilityHandshake {
    const normalizedCapabilities = normalizeCapabilities(handshake?.capabilities);
    const fallbackCapabilities = normalizeCapabilities(installation.capabilitiesJson);

    return this.normalizeHandshake({
      extensionVersion: handshake?.extensionVersion ?? installation.extensionVersion,
      schemaVersion: handshake?.schemaVersion ?? installation.schemaVersion,
      capabilities: normalizedCapabilities.length > 0 ? normalizedCapabilities : fallbackCapabilities,
      browser:
        (handshake?.browser as CompatibilityHandshake['browser'] | undefined) ??
        normalizeBrowser(installation.browser),
      ...(handshake?.buildId?.trim() ? { buildId: handshake.buildId.trim() } : {}),
    });
  }


  private normalizeDeviceMetadata(metadata?: Partial<ExtensionDeviceMetadata>): ExtensionDeviceMetadata | undefined {
    if (!metadata) return undefined;
    const normalize = (value: string | undefined, max: number): string | undefined => {
      const trimmed = value?.trim();
      if (!trimmed) return undefined;
      return trimmed.slice(0, max);
    };
    const result: ExtensionDeviceMetadata = {
      ...(normalize(metadata.deviceLabel, 120) ? { deviceLabel: normalize(metadata.deviceLabel, 120) } : {}),
      ...(normalize(metadata.platform, 120) ? { platform: normalize(metadata.platform, 120) } : {}),
      ...(normalize(metadata.osName, 120) ? { osName: normalize(metadata.osName, 120) } : {}),
      ...(normalize(metadata.osVersion, 120) ? { osVersion: normalize(metadata.osVersion, 120) } : {}),
      ...(normalize(metadata.browserName, 120) ? { browserName: normalize(metadata.browserName, 120) } : {}),
      ...(normalize(metadata.browserVersion, 120) ? { browserVersion: normalize(metadata.browserVersion, 120) } : {}),
      ...(normalize(metadata.userAgent, 500) ? { userAgent: normalize(metadata.userAgent, 500) } : {}),
    };

    return Object.keys(result).length > 0 ? result : undefined;
  }

  private mergeInstallationMetadata(
    installation: ExtensionInstallationRecord,
    metadata?: ExtensionDeviceMetadata,
  ): ExtensionDeviceMetadata | undefined {
    return {
      ...(installation.deviceLabel ? { deviceLabel: installation.deviceLabel } : {}),
      ...(installation.platform ? { platform: installation.platform } : {}),
      ...(installation.osName ? { osName: installation.osName } : {}),
      ...(installation.osVersion ? { osVersion: installation.osVersion } : {}),
      ...(installation.browserName ? { browserName: installation.browserName } : {}),
      ...(installation.browserVersion ? { browserVersion: installation.browserVersion } : {}),
      ...(installation.userAgent ? { userAgent: installation.userAgent } : {}),
      ...(metadata ?? {}),
    };
  }

  async recordAiFailureSafely(input: {
    installationId: string;
    userId: string;
    action: 'models' | 'proxy';
    requestData?: Record<string, unknown>;
    error: unknown;
  }): Promise<void> {
    const occurredAt = new Date();
    const eventType = input.action === 'models' ? 'extension.ai_models_failed' : 'extension.ai_request_failed';
    const httpStatus = input.error instanceof HttpException ? input.error.getStatus() : undefined;
    const errorMessage =
      input.error instanceof Error ? input.error.message.trim().slice(0, 512) : 'Unknown extension AI error.';
    const errorCode =
      input.error instanceof HttpException ? String(input.error.getStatus()) : 'unknown';

    await this.recordLifecycleEventSafely({
      actorId: input.userId,
      targetType: 'extension_installation',
      targetId: input.installationId,
      auditEventType: eventType,
      securityEventType: eventType,
      securitySeverity: 'error',
      status: 'failure',
      summary: `Extension AI ${input.action} request failed: ${errorMessage}`,
      metadata: {
        installationId: input.installationId,
        userId: input.userId,
        ...(input.requestData ?? {}),
        errorCode,
        errorMessage,
        ...(typeof httpStatus === 'number' ? { httpStatus } : {}),
        occurredAt: occurredAt.toISOString(),
      },
      domainEventType: eventType,
      domainPayload: {
        installationId: input.installationId,
        actorId: input.userId,
        ...(input.requestData ?? {}),
        errorCode,
        errorMessage,
        ...(typeof httpStatus === 'number' ? { httpStatus } : {}),
      },
      occurredAt,
    });
  }

  private logInvalidInstallationToken(input: {
    tokenHash: string;
    endpoint?: string;
  }): void {
    const now = Date.now();
    const tokenHashPrefix = input.tokenHash.slice(0, 16);
    const endpoint = input.endpoint?.trim() || 'unknown';
    const key = `${tokenHashPrefix}:${endpoint}`;
    const state = this.invalidInstallationTokenLogState.get(key);

    if (state && state.nextLogAt > now) {
      state.suppressed += 1;
      return;
    }

    const suppressedSinceLastLog = state?.suppressed ?? 0;
    this.invalidInstallationTokenLogState.set(key, {
      nextLogAt: now + invalidInstallationTokenLogWindowMs,
      suppressed: 0,
    });
    this.pruneInvalidInstallationTokenLogState(now);

    console.warn(
      JSON.stringify({
        eventType: 'extension.installation_session_auth_failed_sampled',
        status: 'failure',
        severity: 'warn',
        reason: 'invalid_or_expired_token',
        endpoint,
        tokenHashPrefix,
        suppressedSinceLastLog,
        dedupeWindowSeconds: invalidInstallationTokenLogWindowMs / 1000,
        occurredAt: new Date(now).toISOString(),
      }),
    );
  }

  private pruneInvalidInstallationTokenLogState(now: number): void {
    if (this.invalidInstallationTokenLogState.size <= maxInvalidInstallationTokenLogKeys) {
      return;
    }

    for (const [key, state] of this.invalidInstallationTokenLogState.entries()) {
      if (state.nextLogAt <= now) {
        this.invalidInstallationTokenLogState.delete(key);
      }
    }

    while (this.invalidInstallationTokenLogState.size > maxInvalidInstallationTokenLogKeys) {
      const oldestKey = this.invalidInstallationTokenLogState.keys().next().value;

      if (!oldestKey) {
        return;
      }

      this.invalidInstallationTokenLogState.delete(oldestKey);
    }
  }

  private async recordLifecycleEventSafely(input: {
    actorId?: string;
    targetType: string;
    targetId: string;
    auditEventType: string;
    securityEventType: string;
    securitySeverity: 'debug' | 'info' | 'warn' | 'error';
    status: 'success' | 'failure';
    summary: string;
    metadata?: Record<string, unknown>;
    domainEventType: string;
    domainPayload: Record<string, unknown>;
    occurredAt?: Date;
  }): Promise<void> {
    const occurredAt = input.occurredAt ?? new Date();
    const actorType = input.actorId ? 'user' : 'system';
    const baseMetadata = {
      summary: input.summary,
      ...(input.metadata ?? {}),
    };
    const auditLog = createAuditLogEvent({
      eventId: `audit:${input.auditEventType}:${input.targetId}:${occurredAt.getTime()}`,
      eventType: input.auditEventType,
      actorId: input.actorId ?? 'system',
      actorType,
      targetType: input.targetType,
      targetId: input.targetId,
      occurredAt: occurredAt.toISOString(),
      severity: input.securitySeverity === 'error' ? 'error' : 'info',
      status: input.status,
      metadata: baseMetadata,
    });
    const securityLog = createSecurityLogEvent({
      eventId: `security:${input.securityEventType}:${input.targetId}:${occurredAt.getTime()}`,
      eventType: input.securityEventType,
      actorId: input.actorId ?? 'system',
      actorType,
      targetType: input.targetType,
      targetId: input.targetId,
      occurredAt: occurredAt.toISOString(),
      severity: input.securitySeverity,
      status: input.status,
      metadata: baseMetadata,
    });

    try {
      await this.extensionEventRepository.recordLifecycleEvent({
        occurredAt,
        auditLog,
        securityLog,
        domainEventType: input.domainEventType,
        domainPayload: {
          summary: input.summary,
          ...input.domainPayload,
          occurredAt: occurredAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('Failed to persist extension lifecycle log event.', error);
    }
  }

  private async issueInstallationSession(
    installation: ExtensionInstallationRecord,
    userId: string,
    lifetimeHours: number,
  ): Promise<{ sessionToken: string; tokenRecord: ExtensionInstallationSessionRecord }> {
    const sessionToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + lifetimeHours * 60 * 60 * 1000);
    const tokenRecord = await this.extensionInstallationSessionRepository.create({
      extensionInstallationId: installation.id,
      userId,
      tokenHash: hashOpaqueToken(sessionToken, this.env.extensionTokenSecret),
      expiresAt,
    });

    return {
      sessionToken,
      tokenRecord,
    };
  }

  private buildFallbackExtensionSessionPolicy(): ExtensionSessionPolicy {
    const fallbackLifetimeHours = this.env.extensionSessionTtlMinutes / 60;
    const fallbackSeconds = Math.max(60, Math.floor((this.env.extensionSessionTtlMinutes * 60) / 2));
    return {
      lifetimeHours: fallbackLifetimeHours,
      refreshAfterSeconds: fallbackSeconds,
    };
  }

  private async resolveExtensionSessionPolicy(): Promise<ExtensionSessionPolicy> {
    const fallback = this.buildFallbackExtensionSessionPolicy();
    try {
      const snapshot = await this.retentionSettingsService.getRetentionPolicy();
      if (!snapshot.updatedAt) {
        return fallback;
      }
      return {
        lifetimeHours: snapshot.policy.extensionSessionLifetimeHours,
        refreshAfterSeconds: snapshot.policy.extensionSessionRefreshAfterSeconds,
      };
    } catch {
      return fallback;
    }
  }
}
