import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createOpaqueToken, hashOpaqueToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import { buildExtensionBootstrapV2 } from '@quizmind/extension';
import { createLogEvent } from '@quizmind/logger';
import { buildQuotaHint } from '@quizmind/usage';
import {
  type CompatibilityHandshake,
  type ExtensionBootstrapPayloadV2,
  type ExtensionBootstrapRequestV2,
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationBindResult,
  type UsageEventIngestResult,
  type UsageEventPayload,
} from '@quizmind/contracts';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { SubscriptionRepository } from '../billing/subscription.repository';
import { QueueDispatchService } from '../queue/queue-dispatch.service';
import {
  mapEntitlementOverrides,
  mapPlanRecordToDefinition,
  mapSubscriptionRecordToSnapshot,
  resolveWorkspaceSubscriptionSummary,
} from '../services/billing-service';
import { mapExtensionCompatibilityRuleToPolicy } from '../services/extension-bootstrap-service';
import { mapFeatureFlagRecordToDefinition } from '../services/feature-flags-service';
import { mapRemoteConfigLayerRecordToDefinition } from '../services/remote-config-service';
import { buildUsageQuotas } from '../services/usage-service';
import { UsageRepository } from '../usage/usage.repository';
import { ExtensionCompatibilityRepository } from './extension-compatibility.repository';
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
    const { sessionToken, tokenRecord } = await this.issueInstallationSession(installation, session.user.id);
    const bootstrap = await this.buildBootstrapPayload({
      installation,
      environment: normalizedRequest.environment,
      handshake: normalizedRequest.handshake,
      issuedAt: occurredAt.toISOString(),
      refreshAfterSeconds: this.resolveRefreshAfterSeconds(),
    });

    return {
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
  }

  async resolveInstallationSession(accessToken: string): Promise<ExtensionInstallationSessionRecord> {
    const tokenHash = hashOpaqueToken(accessToken, this.env.extensionTokenSecret);
    const tokenRecord = await this.extensionInstallationSessionRepository.findActiveByTokenHash(tokenHash);

    if (!tokenRecord) {
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

    const queueJob = await this.queueDispatchService.dispatch({
      queue: 'usage-events',
      payload: usageEvent,
      dedupeKey: `${usageEvent.installationId}:${usageEvent.occurredAt}`,
    });
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
