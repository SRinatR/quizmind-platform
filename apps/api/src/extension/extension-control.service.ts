import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createOpaqueToken, hashOpaqueToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import { buildExtensionBootstrapV2, evaluateCompatibility } from '@quizmind/extension';
import { createAuditLogEvent, createLogEvent, createSecurityLogEvent } from '@quizmind/logger';
import { createQueueDispatchRequest } from '@quizmind/queue';
import { buildQuotaHint } from '@quizmind/usage';
import {
  type CompatibilityHandshake,
  type ExtensionBootstrapPayloadV2,
  type ExtensionBootstrapRequestV2,
  type ExtensionInstallationDisconnectRequest,
  type ExtensionInstallationDisconnectResult,
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationBindResult,
  type ExtensionInstallationInventoryItem,
  type ExtensionInstallationInventorySnapshot,
  type ExtensionInstallationRotateSessionRequest,
  type ExtensionInstallationRotateSessionResult,
  type UsageEventIngestResult,
  type UsageEventPayload,
} from '@quizmind/contracts';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { SubscriptionRepository } from '../billing/subscription.repository';
import { QueueDispatchService } from '../queue/queue-dispatch.service';
import {
  canReadExtensionInstallations,
  canWriteExtensionInstallations,
} from '../services/access-service';
import {
  mapEntitlementOverrides,
  mapPlanRecordToDefinition,
  mapSubscriptionRecordToSnapshot,
  resolveWorkspaceSubscriptionSummary,
} from '../services/billing-service';
import {
  defaultCompatibilityPolicy,
  mapExtensionCompatibilityRuleToPolicy,
} from '../services/extension-bootstrap-service';
import { mapFeatureFlagRecordToDefinition } from '../services/feature-flags-service';
import { mapRemoteConfigLayerRecordToDefinition } from '../services/remote-config-service';
import { buildUsageQuotas } from '../services/usage-service';
import { UsageRepository } from '../usage/usage.repository';
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

const maxExtensionActionReasonLength = 500;

function readRequiredActionReason(value: string | undefined): string {
  const reason = readRequiredString(value, 'reason');

  if (reason.length > maxExtensionActionReasonLength) {
    throw new BadRequestException(`reason must be at most ${maxExtensionActionReasonLength} characters.`);
  }

  return reason;
}

function normalizeBrowser(value: string): CompatibilityHandshake['browser'] {
  return ['chrome', 'edge', 'brave', 'other'].includes(value)
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

@Injectable()
export class ExtensionControlService {
  private readonly env = loadApiEnv();

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
    @Inject(SubscriptionRepository)
    private readonly subscriptionRepository: SubscriptionRepository,
    @Inject(UsageRepository)
    private readonly usageRepository: UsageRepository,
    @Inject(QueueDispatchService)
    private readonly queueDispatchService: QueueDispatchService,
  ) {}

  async bindInstallationForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<ExtensionInstallationBindRequest>,
  ): Promise<ExtensionInstallationBindResult> {
    const normalizedRequest = this.normalizeBindRequest(session, request);
    const occurredAt = new Date();
    const existingInstallation = await this.extensionInstallationRepository.findByInstallationId(
      normalizedRequest.installationId,
    );
    const installation = await this.extensionInstallationRepository.upsertBoundInstallation({
      userId: session.user.id,
      ...(normalizedRequest.workspaceId ? { workspaceId: normalizedRequest.workspaceId } : {}),
      installationId: normalizedRequest.installationId,
      browser: normalizedRequest.handshake.browser,
      extensionVersion: normalizedRequest.handshake.extensionVersion,
      schemaVersion: normalizedRequest.handshake.schemaVersion,
      capabilities: normalizedRequest.handshake.capabilities,
      lastSeenAt: occurredAt,
    });
    const revokedSessionCount = await this.extensionInstallationSessionRepository.revokeActiveByInstallationId(
      installation.id,
      occurredAt,
    );
    const { sessionToken, tokenRecord } = await this.issueInstallationSession(installation, session.user.id);
    const bootstrap = await this.buildBootstrapPayload({
      installation,
      environment: normalizedRequest.environment,
      handshake: normalizedRequest.handshake,
      issuedAt: occurredAt.toISOString(),
      refreshAfterSeconds: this.resolveRefreshAfterSeconds(),
    });
    const result: ExtensionInstallationBindResult = {
      installation: {
        installationId: installation.installationId,
        ...(installation.workspaceId ? { workspaceId: installation.workspaceId } : {}),
        userId: installation.userId,
        browser: installation.browser as CompatibilityHandshake['browser'],
        extensionVersion: installation.extensionVersion,
        schemaVersion: installation.schemaVersion,
        capabilities: normalizeCapabilities(installation.capabilitiesJson),
        lastSeenAt: (installation.lastSeenAt ?? occurredAt).toISOString(),
        boundAt: installation.createdAt.toISOString(),
        ...(normalizedRequest.handshake.buildId ? { buildId: normalizedRequest.handshake.buildId } : {}),
      },
      session: {
        token: sessionToken,
        expiresAt: tokenRecord.expiresAt.toISOString(),
        refreshAfterSeconds: this.resolveRefreshAfterSeconds(),
      },
      bootstrap,
    };

    await this.recordLifecycleEventSafely({
      workspaceId: installation.workspaceId ?? undefined,
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
        workspaceId: installation.workspaceId ?? null,
        browser: installation.browser,
        extensionVersion: installation.extensionVersion,
        schemaVersion: installation.schemaVersion,
        capabilities: normalizeCapabilities(installation.capabilitiesJson),
        sessionExpiresAt: tokenRecord.expiresAt.toISOString(),
        refreshAfterSeconds: result.session.refreshAfterSeconds,
        revokedSessionCount,
        previousWorkspaceId: existingInstallation?.workspaceId ?? null,
        previousUserId: existingInstallation?.userId ?? null,
      },
      domainEventType: existingInstallation
        ? 'extension.installation_reconnected'
        : 'extension.installation_bound',
      domainPayload: {
        installationId: installation.installationId,
        workspaceId: installation.workspaceId ?? null,
        actorId: session.user.id,
        sessionExpiresAt: tokenRecord.expiresAt.toISOString(),
        revokedSessionCount,
      },
      occurredAt,
    });

    return result;
  }

  async resolveInstallationSession(accessToken: string): Promise<ExtensionInstallationSessionRecord> {
    const tokenHash = hashOpaqueToken(accessToken, this.env.extensionTokenSecret);
    const tokenRecord = await this.extensionInstallationSessionRepository.findActiveByTokenHash(tokenHash);

    if (!tokenRecord) {
      await this.recordLifecycleEventSafely({
        targetType: 'extension_installation_session',
        targetId: tokenHash.slice(0, 16),
        auditEventType: 'extension.installation_session_refresh_failed',
        securityEventType: 'extension.installation_session_refresh_failed',
        securitySeverity: 'warn',
        status: 'failure',
        summary: 'extension installation session refresh failed due to invalid or expired token',
        metadata: {
          reason: 'invalid_or_expired_token',
          tokenHashPrefix: tokenHash.slice(0, 16),
        },
        domainEventType: 'extension.installation_session_refresh_failed',
        domainPayload: {
          reason: 'invalid_or_expired_token',
          tokenHashPrefix: tokenHash.slice(0, 16),
        },
      });
      throw new UnauthorizedException('Installation session is invalid or expired.');
    }

    return tokenRecord;
  }

  async bootstrapInstallationSession(
    installationSession: ExtensionInstallationSessionRecord,
    request?: Partial<ExtensionBootstrapRequestV2>,
  ): Promise<ExtensionBootstrapPayloadV2> {
    const installationId = readRequiredString(
      request?.installationId ?? installationSession.installation.installationId,
      'installationId',
    );

    if (installationId !== installationSession.installation.installationId) {
      throw new UnauthorizedException('Installation session does not match the requested installation.');
    }

    const handshake = this.normalizeHandshake(request?.handshake);
    const installation = await this.extensionInstallationRepository.upsertBoundInstallation({
      userId: installationSession.installation.userId,
      ...(installationSession.installation.workspaceId ? { workspaceId: installationSession.installation.workspaceId } : {}),
      installationId,
      browser: handshake.browser,
      extensionVersion: handshake.extensionVersion,
      schemaVersion: handshake.schemaVersion,
      capabilities: handshake.capabilities,
      lastSeenAt: new Date(),
    });

    return this.buildBootstrapPayload({
      installation,
      environment: readRequiredString(request?.environment ?? 'production', 'environment'),
      handshake,
      refreshAfterSeconds: this.resolveRefreshAfterSeconds(),
    });
  }

  async ingestUsageEventForInstallationSession(
    installationSession: ExtensionInstallationSessionRecord,
    event?: Partial<UsageEventPayload>,
  ): Promise<UsageEventIngestResult> {
    const usageEvent: UsageEventPayload = {
      installationId: installationSession.installation.installationId,
      ...(installationSession.installation.workspaceId
        ? { workspaceId: installationSession.installation.workspaceId }
        : {}),
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

    const queueJob = await this.queueDispatchService.dispatch(
      createQueueDispatchRequest({
        queue: 'usage-events',
        payload: usageEvent,
      }),
    );
    const logEvent = createLogEvent({
      eventId: `usage:${usageEvent.installationId}:${usageEvent.occurredAt}`,
      eventType: 'extension.usage_queued',
      actorId: usageEvent.installationId,
      actorType: 'system',
      workspaceId: usageEvent.workspaceId,
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
      workspaceId: input.installation.workspaceId ?? undefined,
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
        workspaceId: input.installation.workspaceId ?? null,
        payload: input.usageEvent.payload,
      },
      domainEventType: mapping.auditEventType,
      domainPayload: {
        sourceEventType: input.usageEvent.eventType,
        installationId: input.installation.installationId,
        workspaceId: input.installation.workspaceId ?? null,
        payload: input.usageEvent.payload,
      },
      occurredAt,
    });
  }

  async listInstallationsForCurrentSession(
    session: CurrentSessionSnapshot,
    workspaceId?: string,
  ): Promise<ExtensionInstallationInventorySnapshot> {
    const requestedWorkspace = this.resolveRequestedWorkspace(session, workspaceId);
    const accessDecision = canReadExtensionInstallations(session.principal, requestedWorkspace.id);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const [installations, compatibilityRule] = await Promise.all([
      this.extensionInstallationRepository.listByWorkspaceId(requestedWorkspace.id),
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

    return {
      workspace: requestedWorkspace,
      accessDecision,
      disconnectDecision: canWriteExtensionInstallations(session.principal, requestedWorkspace.id),
      items: installations.map((installation) => this.mapInstallationInventoryItem(installation, compatibilityPolicy, sessionStats)),
      permissions: session.permissions,
    };
  }

  async disconnectInstallationForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<ExtensionInstallationDisconnectRequest>,
  ): Promise<ExtensionInstallationDisconnectResult> {
    const installationId = readRequiredString(request?.installationId, 'installationId');
    const requestedWorkspace = this.resolveRequestedWorkspace(session, request?.workspaceId);
    const accessDecision = canWriteExtensionInstallations(session.principal, requestedWorkspace.id);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const reason = readRequiredActionReason(request?.reason);

    const installation = await this.extensionInstallationRepository.findByInstallationId(installationId);

    if (!installation || installation.workspaceId !== requestedWorkspace.id) {
      throw new NotFoundException('Extension installation not found for workspace.');
    }

    const disconnectedAt = new Date();
    const revokedSessionCount = await this.extensionInstallationSessionRepository.revokeActiveByInstallationId(
      installation.id,
      disconnectedAt,
    );

    await this.recordLifecycleEventSafely({
      workspaceId: installation.workspaceId ?? undefined,
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
        workspaceId: installation.workspaceId ?? null,
        reason,
        revokedSessionCount,
        requiresReconnect: true,
      },
      domainEventType: 'extension.installation_disconnected',
      domainPayload: {
        installationId: installation.installationId,
        workspaceId: installation.workspaceId ?? null,
        actorId: session.user.id,
        reason,
        revokedSessionCount,
      },
      occurredAt: disconnectedAt,
    });

    return {
      installationId: installation.installationId,
      workspaceId: installation.workspaceId ?? undefined,
      revokedSessionCount,
      disconnectedAt: disconnectedAt.toISOString(),
      requiresReconnect: true,
    };
  }

  async rotateInstallationSessionForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<ExtensionInstallationRotateSessionRequest>,
  ): Promise<ExtensionInstallationRotateSessionResult> {
    const installationId = readRequiredString(request?.installationId, 'installationId');
    const requestedWorkspace = this.resolveRequestedWorkspace(session, request?.workspaceId);
    const accessDecision = canWriteExtensionInstallations(session.principal, requestedWorkspace.id);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const reason = readRequiredActionReason(request?.reason);

    const installation = await this.extensionInstallationRepository.findByInstallationId(installationId);

    if (!installation || installation.workspaceId !== requestedWorkspace.id) {
      throw new NotFoundException('Extension installation not found for workspace.');
    }

    const rotatedAt = new Date();
    const revokedSessionCount = await this.extensionInstallationSessionRepository.revokeActiveByInstallationId(
      installation.id,
      rotatedAt,
    );
    const { sessionToken, tokenRecord } = await this.issueInstallationSession(installation, installation.userId);

    await this.recordLifecycleEventSafely({
      workspaceId: installation.workspaceId ?? undefined,
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
        workspaceId: installation.workspaceId ?? null,
        reason,
        revokedSessionCount,
        sessionExpiresAt: tokenRecord.expiresAt.toISOString(),
        refreshAfterSeconds: this.resolveRefreshAfterSeconds(),
      },
      domainEventType: 'extension.installation_session_rotated',
      domainPayload: {
        installationId: installation.installationId,
        workspaceId: installation.workspaceId ?? null,
        actorId: session.user.id,
        reason,
        revokedSessionCount,
        sessionExpiresAt: tokenRecord.expiresAt.toISOString(),
      },
      occurredAt: rotatedAt,
    });

    return {
      installationId: installation.installationId,
      workspaceId: installation.workspaceId ?? undefined,
      revokedSessionCount,
      rotatedAt: rotatedAt.toISOString(),
      session: {
        token: sessionToken,
        expiresAt: tokenRecord.expiresAt.toISOString(),
        refreshAfterSeconds: this.resolveRefreshAfterSeconds(),
      },
    };
  }

  private async buildBootstrapPayload(input: {
    installation: ExtensionInstallationRecord;
    environment: string;
    handshake: CompatibilityHandshake;
    issuedAt?: string;
    refreshAfterSeconds: number;
  }): Promise<ExtensionBootstrapPayloadV2> {
    const [compatibilityRule, featureFlags, remoteConfigLayers, aiAccessPolicy, workspaceSubscription, quotaCounters] = await Promise.all([
      this.extensionCompatibilityRepository.findLatest(),
      this.featureFlagRepository.findAll(),
      this.remoteConfigRepository.findActiveLayers(input.installation.workspaceId ?? undefined),
      this.aiProviderPolicyService.resolvePolicyForWorkspace(input.installation.workspaceId ?? undefined),
      input.installation.workspaceId
        ? this.subscriptionRepository.findCurrentByWorkspaceId(input.installation.workspaceId)
        : Promise.resolve(null),
      input.installation.workspaceId
        ? this.usageRepository.listQuotaCountersByWorkspaceId(input.installation.workspaceId)
        : Promise.resolve([]),
    ]);
    const subscriptionSummary = workspaceSubscription
      ? resolveWorkspaceSubscriptionSummary({
          workspaceId: input.installation.workspaceId ?? workspaceSubscription.workspaceId,
          plan: mapPlanRecordToDefinition(workspaceSubscription.plan),
          subscription: mapSubscriptionRecordToSnapshot(workspaceSubscription),
          overrides: mapEntitlementOverrides(workspaceSubscription.workspace.entitlementOverrides),
        })
      : null;
    const quotaHints = subscriptionSummary
      ? buildUsageQuotas({
          entitlements: subscriptionSummary.entitlements,
          counters: quotaCounters,
          seatCount: subscriptionSummary.seatCount,
          currentPeriodStart: workspaceSubscription?.currentPeriodStart,
          currentPeriodEnd: workspaceSubscription?.currentPeriodEnd,
        }).map((quota) =>
          buildQuotaHint({
            key: quota.key,
            label: quota.label,
            consumed: quota.consumed,
            limit: quota.limit,
          }),
        )
      : [];

    return buildExtensionBootstrapV2({
      installationId: input.installation.installationId,
      workspaceId: input.installation.workspaceId ?? undefined,
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
      entitlements: subscriptionSummary?.entitlements ?? [],
      quotaHints,
      aiAccessPolicy,
      context: {
        environment: input.environment,
        workspaceId: input.installation.workspaceId ?? undefined,
        userId: input.installation.userId,
        planCode: subscriptionSummary?.planCode,
        buildId: input.handshake.buildId,
      },
      issuedAt: input.issuedAt,
      refreshAfterSeconds: input.refreshAfterSeconds,
    });
  }

  private resolveRequestedWorkspace(session: CurrentSessionSnapshot, workspaceId?: string) {
    const normalizedWorkspaceId = workspaceId?.trim();
    const requestedWorkspace =
      (normalizedWorkspaceId
        ? session.workspaces.find((workspace) => workspace.id === normalizedWorkspaceId)
        : session.workspaces[0]) ?? null;

    if (!requestedWorkspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    return requestedWorkspace;
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
      ...(installation.workspaceId ? { workspaceId: installation.workspaceId } : {}),
      browser: normalizeBrowser(installation.browser),
      extensionVersion: installation.extensionVersion,
      schemaVersion: installation.schemaVersion,
      capabilities: normalizeCapabilities(installation.capabilitiesJson),
      boundAt: installation.createdAt.toISOString(),
      ...(installation.lastSeenAt ? { lastSeenAt: installation.lastSeenAt.toISOString() } : {}),
      activeSessionCount: installationSessionStats?.count ?? 0,
      ...(installationSessionStats?.lastSessionIssuedAt
        ? { lastSessionIssuedAt: installationSessionStats.lastSessionIssuedAt }
        : {}),
      ...(installationSessionStats?.lastSessionExpiresAt
        ? { lastSessionExpiresAt: installationSessionStats.lastSessionExpiresAt }
        : {}),
      compatibility,
      requiresReconnect: (installationSessionStats?.count ?? 0) === 0,
    };
  }

  private normalizeBindRequest(
    session: CurrentSessionSnapshot,
    request?: Partial<ExtensionInstallationBindRequest>,
  ): ExtensionInstallationBindRequest {
    const installationId = readRequiredString(request?.installationId, 'installationId');
    const environment = readRequiredString(request?.environment ?? 'production', 'environment');
    const handshake = this.normalizeHandshake(request?.handshake);
    const workspaceId = request?.workspaceId?.trim() || session.workspaces[0]?.id;

    return {
      installationId,
      ...(workspaceId ? { workspaceId } : {}),
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

    if (!browser || !['chrome', 'edge', 'brave', 'other'].includes(browser)) {
      throw new BadRequestException('handshake.browser must be one of chrome, edge, brave, or other.');
    }

    return {
      extensionVersion,
      schemaVersion,
      capabilities,
      browser,
      ...(handshake?.buildId?.trim() ? { buildId: handshake.buildId.trim() } : {}),
    };
  }

  private async recordLifecycleEventSafely(input: {
    workspaceId?: string;
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
      workspaceId: input.workspaceId,
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
      workspaceId: input.workspaceId,
      targetType: input.targetType,
      targetId: input.targetId,
      occurredAt: occurredAt.toISOString(),
      severity: input.securitySeverity,
      status: input.status,
      metadata: baseMetadata,
    });

    try {
      await this.extensionEventRepository.recordLifecycleEvent({
        workspaceId: input.workspaceId ?? null,
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
  ): Promise<{ sessionToken: string; tokenRecord: ExtensionInstallationSessionRecord }> {
    const sessionToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + this.env.extensionSessionTtlMinutes * 60 * 1000);
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

  private resolveRefreshAfterSeconds(): number {
    return Math.max(60, Math.floor((this.env.extensionSessionTtlMinutes * 60) / 2));
  }
}
