import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { loadApiEnv, validateApiEnv } from '@quizmind/config';
import { createNoopEmailAdapter, sendTemplatedEmail, verifyEmailTemplate } from '@quizmind/email';
import { createLogEvent } from '@quizmind/logger';
import { createQueueDispatchRequest, listQueueDefinitions } from '@quizmind/queue';
import { type SessionPrincipal } from '@quizmind/auth';
import {
  adminExtensionCompatibilityFilters,
  adminExtensionConnectionFilters,
  adminWebhookProviderFilters,
  adminWebhookStatusFilters,
  type AdminExtensionFleetFilters,
  type AdminExtensionFleetInstallationDetail,
  type AdminExtensionFleetItem,
  type AdminExtensionFleetSessionHistoryItem,
  type AdminExtensionFleetSnapshot,
  type AdminLogExportFormat,
  type AdminLogExportRequest,
  type AdminLogExportResult,
  type AuditExportJobPayload,
  adminLogSeverityFilters,
  adminLogStreamFilters,
  type AdminQueueSummary,
  type AdminLogEntry,
  type AdminLogFilters,
  type AdminLogsSnapshot,
  type AdminSecuritySnapshot,
  type AdminWebhookEventSummary,
  type AdminWebhookFilters,
  type AdminWebhookRetryRequest,
  type AdminWebhookRetryResult,
  type AdminWebhooksSnapshot,
  type BillingProvider,
  type BillingWebhookJobPayload,
  type CompatibilityRuleDefinition,
  type CompatibilityRulePublishRequest,
  type CompatibilityRulePublishResult,
  type CompatibilityRulesSnapshot,
  type AdminUserDirectorySnapshot,
  type AuthLoginRequest,
  type ExtensionBootstrapRequest,
  type FeatureFlagUpdateRequest,
  type FeatureFlagUpdateResult,
  type RemoteConfigActivateVersionRequest,
  type RemoteConfigActivateVersionResult,
  type RemoteConfigPublishRequest,
  type RemoteConfigPreviewRequest,
  type RemoteConfigSnapshot,
  type QuotaResetJobPayload,
  supportTicketQueuePresets,
  type SupportImpersonationEndRequest,
  type SupportImpersonationEndResult,
  type SupportImpersonationHistorySnapshot,
  type SupportImpersonationRequest,
  type SupportImpersonationSessionSnapshot,
  type SupportTicketQueueFilters,
  type SupportTicketQueuePreset,
  type SupportTicketQueuePresetFavoriteRequest,
  type SupportTicketQueuePresetFavoriteResult,
  type SupportTicketQueueSnapshot,
  type SupportTicketWorkflowUpdateRequest,
  type SupportTicketWorkflowUpdateResult,
  type UserProfilePayload,
  type UserProfileUpdateRequest,
  type UsageExportRequest,
  type UsageExportResult,
  type UsageHistoryRequest,
  type UsageHistorySourceFilter,
  type UsageEventIngestResult,
  type UsageEventPayload,
  type WorkspaceDetailSnapshot,
  type WorkspaceUsageHistorySnapshot,
  type WorkspaceUsageSnapshot,
} from '@quizmind/contracts';

import {
  canEndSupportImpersonation,
  canExportAuditLogs,
  canExportUsage,
  canReadAuditLogs,
  canReadExtensionInstallations,
  canReadFeatureFlags,
  canReadJobs,
  canManageCompatibilityRules,
  canReadSupportImpersonationSessions,
  canReadSupportTickets,
  canReadUsage,
  canReadUsers,
  canRetryJobs,
  canWriteFeatureFlags,
  canStartSupportImpersonation,
  canPublishRemoteConfig,
  canReadWorkspace,
  canReadWorkspaceSubscription,
  listPrincipalPermissions,
} from './services/access-service';
import {
  mapEntitlementOverrides,
  mapPlanRecordToDefinition,
  mapSubscriptionRecordToSnapshot,
  resolveWorkspaceSubscriptionSummary,
} from './services/billing-service';
import {
  defaultCompatibilityPolicy,
  mapExtensionCompatibilityRuleToDefinition,
  mapExtensionCompatibilityRuleToPolicy,
  resolveExtensionBootstrap,
} from './services/extension-bootstrap-service';
import { InfrastructureHealthService } from './services/infrastructure-health-service';
import {
  mapRemoteConfigLayerRecordToDefinition,
  mapRemoteConfigVersionRecordToSummary,
  previewRemoteConfig,
  publishRemoteConfigVersion,
} from './services/remote-config-service';
import {
  buildSupportImpersonationHistorySnapshot,
  buildSupportTicketQueueSnapshot,
  createSupportTicketWorkflowAuditLog,
  endSupportImpersonation as buildSupportImpersonationEnd,
  filterSupportTicketQueueEntries,
  groupSupportTicketTimelineEntries,
  mapSupportImpersonationRecordToEndResult,
  mapSupportImpersonationRecordToSnapshot,
  mapSupportTicketRecordToSnapshot,
  normalizeSupportTicketQueueFilters,
  resolveSupportTicketStatuses,
  startSupportImpersonation,
  type SupportTicketQueueFilterInput,
} from './services/support-service';
import {
  mapFeatureFlagRecordToDefinition,
  normalizeFeatureFlagUpdate,
  type NormalizedFeatureFlagUpdate,
} from './services/feature-flags-service';
import { buildRecentUsageEvents, buildUsageQuotas, mapUsageInstallations } from './services/usage-service';
import { type CurrentSessionSnapshot } from './auth/auth.types';
import { mapUserRecordToDirectoryEntry, mapUserRecordToProfile } from './services/users-service';
import {
  buildAuthSession,
  getAccessibleWorkspaces,
  getFoundationOverview,
  getPersona,
  getPlanForWorkspace,
  getWorkspaceSummary,
  listFoundationSupportTickets,
  listFoundationUsers,
  matchPersonaFromLogin,
} from './platform-data';
import { UserRepository } from './auth/repositories/user.repository';
import { SubscriptionRepository } from './billing/subscription.repository';
import { BillingWebhookRepository, type BillingWebhookAdminRecord } from './billing/billing-webhook.repository';
import { ExtensionCompatibilityRepository } from './extension/extension-compatibility.repository';
import {
  ExtensionInstallationRepository,
  type ExtensionInstallationRecord,
} from './extension/extension-installation.repository';
import {
  ExtensionInstallationSessionRepository,
  type ActiveExtensionInstallationSessionRecord,
  type RecentExtensionInstallationSessionRecord,
} from './extension/extension-installation-session.repository';
import { FeatureFlagRepository } from './feature-flags/feature-flag.repository';
import { AdminLogRepository } from './logs/admin-log.repository';
import { QueueDispatchService } from './queue/queue-dispatch.service';
import { RemoteConfigRepository } from './remote-config/remote-config.repository';
import { SupportImpersonationRepository } from './support/support-impersonation.repository';
import { SupportTicketPresetFavoriteRepository } from './support/support-ticket-preset-favorite.repository';
import { SupportTicketRepository } from './support/support-ticket.repository';
import { UsageRepository } from './usage/usage.repository';
import { WorkspaceRepository } from './workspaces/workspace.repository';
import { compareSemver, evaluateCompatibility } from '@quizmind/extension';

const validSupportTicketPresetKeys = new Set<string>(supportTicketQueuePresets);
const validAdminLogStreams = new Set<string>(adminLogStreamFilters);
const validAdminLogSeverityFilters = new Set<string>(adminLogSeverityFilters);
const validAdminWebhookProviderFilters = new Set<string>(adminWebhookProviderFilters);
const validAdminWebhookStatusFilters = new Set<string>(adminWebhookStatusFilters);
const validAdminExtensionConnectionFilters = new Set<string>(adminExtensionConnectionFilters);
const validAdminExtensionCompatibilityFilters = new Set<string>(adminExtensionCompatibilityFilters);
const maxProfileDisplayNameLength = 120;
const maxProfileLocaleLength = 32;
const maxProfileTimezoneLength = 100;
const maxProfileAvatarUrlLength = 2048;
const defaultUsageHistoryLimit = 25;
const maxUsageHistoryLimit = 200;
const validUsageHistorySources = new Set<UsageHistorySourceFilter>(['all', 'telemetry', 'activity', 'ai']);

function normalizeInstallationCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeInstallationBrowser(value: string): AdminExtensionFleetItem['browser'] {
  return value === 'chrome' || value === 'edge' || value === 'brave' ? value : 'other';
}

function resolveAdminExtensionSessionStatus(
  session: Pick<RecentExtensionInstallationSessionRecord, 'expiresAt' | 'revokedAt'>,
  now = new Date(),
): AdminExtensionFleetSessionHistoryItem['status'] {
  if (session.revokedAt) {
    return 'revoked';
  }

  return session.expiresAt <= now ? 'expired' : 'active';
}

function normalizeOptionalProfileText(
  value: string | null | undefined,
  fieldName: string,
  maxLength: number,
): string | null | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string or null.`);
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new BadRequestException(`${fieldName} must be at most ${maxLength} characters.`);
  }

  return normalized;
}

function normalizeLocale(value: string | null | undefined): string | null | undefined {
  const normalized = normalizeOptionalProfileText(value, 'locale', maxProfileLocaleLength);

  if (typeof normalized !== 'string') {
    return normalized;
  }

  try {
    return Intl.getCanonicalLocales(normalized)[0] ?? normalized;
  } catch {
    throw new BadRequestException('locale must be a valid BCP-47 locale tag.');
  }
}

function normalizeTimezone(value: string | null | undefined): string | null | undefined {
  const normalized = normalizeOptionalProfileText(value, 'timezone', maxProfileTimezoneLength);

  if (typeof normalized !== 'string') {
    return normalized;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date());
  } catch {
    throw new BadRequestException('timezone must be a valid IANA timezone name.');
  }

  return normalized;
}

function normalizeAvatarUrl(value: string | null | undefined): string | null | undefined {
  const normalized = normalizeOptionalProfileText(value, 'avatarUrl', maxProfileAvatarUrlLength);

  if (typeof normalized !== 'string') {
    return normalized;
  }

  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new BadRequestException('avatarUrl must be a valid absolute URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('avatarUrl protocol must be http or https.');
  }

  return parsed.toString();
}

function normalizeUsageHistoryLimit(value: number | undefined): number {
  if (typeof value === 'undefined') {
    return defaultUsageHistoryLimit;
  }

  if (!Number.isInteger(value) || value < 1 || value > maxUsageHistoryLimit) {
    throw new BadRequestException(`limit must be an integer between 1 and ${maxUsageHistoryLimit}.`);
  }

  return value;
}

function normalizeUsageHistorySource(value: UsageHistoryRequest['source']): UsageHistorySourceFilter {
  if (typeof value === 'undefined') {
    return 'all';
  }

  if (!validUsageHistorySources.has(value)) {
    throw new BadRequestException('source must be one of: all, telemetry, activity, ai.');
  }

  return value;
}

function normalizeUsageHistoryString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

@Injectable()
export class PlatformService {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(InfrastructureHealthService)
    private readonly infrastructureHealthService: InfrastructureHealthService,
    @Inject(SubscriptionRepository)
    private readonly subscriptionRepository: SubscriptionRepository,
    @Inject(ExtensionCompatibilityRepository)
    private readonly extensionCompatibilityRepository: ExtensionCompatibilityRepository,
    @Inject(ExtensionInstallationRepository)
    private readonly extensionInstallationRepository: ExtensionInstallationRepository,
    @Inject(ExtensionInstallationSessionRepository)
    private readonly extensionInstallationSessionRepository: ExtensionInstallationSessionRepository,
    @Inject(FeatureFlagRepository)
    private readonly featureFlagRepository: FeatureFlagRepository,
    @Inject(AdminLogRepository)
    private readonly adminLogRepository: AdminLogRepository,
    @Inject(BillingWebhookRepository)
    private readonly billingWebhookRepository: BillingWebhookRepository,
    @Inject(RemoteConfigRepository)
    private readonly remoteConfigRepository: RemoteConfigRepository,
    @Inject(WorkspaceRepository)
    private readonly workspaceRepository: WorkspaceRepository,
    @Inject(UserRepository)
    private readonly userRepository: UserRepository,
    @Inject(SupportTicketRepository)
    private readonly supportTicketRepository: SupportTicketRepository,
    @Inject(SupportTicketPresetFavoriteRepository)
    private readonly supportTicketPresetFavoriteRepository: SupportTicketPresetFavoriteRepository,
    @Inject(SupportImpersonationRepository)
    private readonly supportImpersonationRepository: SupportImpersonationRepository,
    @Inject(UsageRepository)
    private readonly usageRepository: UsageRepository,
    @Inject(QueueDispatchService)
    private readonly queueDispatchService: QueueDispatchService,
  ) {}

  async getHealth() {
    const [postgresHealth, redisHealth] = await Promise.all([
      this.infrastructureHealthService.checkDatabaseConnection(this.env.runtimeMode),
      this.infrastructureHealthService.checkTcpConnection(this.env.redisUrl, this.env.runtimeMode),
    ]);

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      runtime: {
        nodeEnv: this.env.nodeEnv,
        runtimeMode: this.env.runtimeMode,
        apiUrl: this.env.apiUrl,
        appUrl: this.env.appUrl,
        port: this.env.port,
      },
      configuration: {
        runtimeMode: this.env.runtimeMode,
        corsAllowedOrigins: this.env.corsAllowedOrigins,
        jwt: {
          issuer: this.env.jwtIssuer,
          audience: this.env.jwtAudience,
        },
        emailProvider: this.env.emailProvider,
        billingProvider: this.env.billingProvider,
        validationIssues: validateApiEnv(this.env),
      },
      observability: {
        requestLogging: 'enabled',
        auditLogging: 'enabled',
        securityLogging: 'enabled',
      },
      infrastructure: [
        {
          service: 'postgres',
          status: postgresHealth.status,
          url: this.env.databaseUrl,
          latencyMs: postgresHealth.latencyMs,
          error: postgresHealth.error,
        },
        {
          service: 'redis',
          status: redisHealth.status,
          url: this.env.redisUrl,
          latencyMs: redisHealth.latencyMs,
          error: redisHealth.error,
        },
        {
          service: 'queues',
          status: this.env.runtimeMode === 'connected' ? 'ready_for_workers' : 'dry_run',
          queues: listQueueDefinitions(),
        },
      ],
    };
  }

  getFoundation() {
    return {
      ...getFoundationOverview(),
      notifications: {
        emailProvider: this.env.emailProvider,
        templates: ['auth.verify-email', 'auth.password-reset', 'workspace.invitation'],
      },
      billing: {
        provider: this.env.billingProvider,
      },
      runtime: {
        apiUrl: this.env.apiUrl,
        appUrl: this.env.appUrl,
        mode: this.env.runtimeMode,
      },
    };
  }

  async login(request: AuthLoginRequest) {
    const persona = getPersona(matchPersonaFromLogin(request));
    const emailReceipt = await sendTemplatedEmail(
      createNoopEmailAdapter(),
      verifyEmailTemplate,
      persona.user.email,
      {
        productName: 'QuizMind',
        displayName: persona.user.displayName,
        verifyUrl: `${this.env.appUrl}/auth/verify?persona=${persona.key}`,
        supportEmail: 'support@quizmind.dev',
      },
    );

    return {
      personaKey: persona.key,
      personaLabel: persona.label,
      notes: persona.notes,
      session: buildAuthSession(persona),
      emailVerification: {
        required: true,
        delivery: emailReceipt,
      },
    };
  }

  getCurrentSession(personaKey?: string) {
    const persona = getPersona(personaKey);

    return {
      personaKey: persona.key,
      personaLabel: persona.label,
      notes: persona.notes,
      user: persona.user,
      principal: persona.principal,
      workspaces: getAccessibleWorkspaces(persona),
      permissions: listPrincipalPermissions(persona.principal, persona.preferredWorkspaceId),
    };
  }

  listWorkspaces(personaKey?: string) {
    const persona = getPersona(personaKey);

    return {
      personaKey: persona.key,
      items: getAccessibleWorkspaces(persona),
    };
  }

  getWorkspace(personaKey?: string, workspaceId?: string): WorkspaceDetailSnapshot {
    const persona = getPersona(personaKey);
    const requestedWorkspaceId = workspaceId?.trim() || persona.preferredWorkspaceId;
    const workspace = getAccessibleWorkspaces(persona).find((candidate) => candidate.id === requestedWorkspaceId);

    if (!workspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    return {
      workspace,
      accessDecision: canReadWorkspace(persona.principal as SessionPrincipal, workspace.id),
      permissions: listPrincipalPermissions(persona.principal, workspace.id),
    };
  }

  private buildFoundationRemoteConfigVersions(
    activeLayers: RemoteConfigSnapshot['activeLayers'],
    workspaceId?: string,
  ): RemoteConfigSnapshot['versions'] {
    const actor = getPersona('platform-admin');
    const workspaceLabel = workspaceId ? `workspace-${workspaceId}` : 'global';

    return [
      {
        id: `foundation-${workspaceLabel}-active`,
        versionLabel: workspaceId ? `${workspaceId}-active` : 'foundation-default',
        workspaceId,
        isActive: true,
        publishedAt: '2026-03-24T08:00:00.000Z',
        publishedBy: {
          id: actor.user.id,
          email: actor.user.email,
          ...(actor.user.displayName ? { displayName: actor.user.displayName } : {}),
        },
        layers: activeLayers,
      },
      {
        id: `foundation-${workspaceLabel}-previous`,
        versionLabel: workspaceId ? `${workspaceId}-previous` : 'foundation-previous',
        workspaceId,
        isActive: false,
        publishedAt: '2026-03-23T18:30:00.000Z',
        publishedBy: {
          id: actor.user.id,
          email: actor.user.email,
          ...(actor.user.displayName ? { displayName: actor.user.displayName } : {}),
        },
        layers: activeLayers.length > 1 ? activeLayers.slice(0, activeLayers.length - 1) : activeLayers,
      },
    ];
  }

  private resolveFoundationRemoteConfigVersion(versionId: string): RemoteConfigSnapshot['versions'][number] | null {
    const activeLayers = getFoundationOverview().remoteConfigLayers;
    const globalMatch = this.buildFoundationRemoteConfigVersions(activeLayers).find((version) => version.id === versionId);

    if (globalMatch) {
      return globalMatch;
    }

    const workspaceMatch = /^foundation-workspace-(.+)-(active|previous)$/.exec(versionId);

    if (!workspaceMatch) {
      return null;
    }

    const workspaceId = workspaceMatch[1];

    return (
      this.buildFoundationRemoteConfigVersions(activeLayers, workspaceId).find((version) => version.id === versionId) ??
      null
    );
  }

  async listWorkspacesForCurrentSession(session: CurrentSessionSnapshot) {
    const items = await this.workspaceRepository.findByUserId(session.user.id);

    return {
      personaKey: 'connected-user',
      items: items.map((workspace) => ({
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        role: workspace.memberships[0]?.role ?? 'workspace_viewer',
      })),
    };
  }

  async getWorkspaceForCurrentSession(
    session: CurrentSessionSnapshot,
    workspaceId: string,
  ): Promise<WorkspaceDetailSnapshot> {
    const requestedWorkspace = session.workspaces.find((workspace) => workspace.id === workspaceId) ?? null;

    if (!requestedWorkspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const accessDecision = canReadWorkspace(session.principal as SessionPrincipal, requestedWorkspace.id);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const persistedWorkspace = await this.workspaceRepository.findById(requestedWorkspace.id);

    if (!persistedWorkspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    return {
      workspace: {
        id: persistedWorkspace.id,
        slug: persistedWorkspace.slug,
        name: persistedWorkspace.name,
        role: requestedWorkspace.role,
      },
      accessDecision,
      permissions: session.permissions,
    };
  }

  async getUserProfileForCurrentSession(session: CurrentSessionSnapshot): Promise<UserProfilePayload> {
    const user = await this.userRepository.findById(session.user.id);

    if (!user) {
      throw new NotFoundException('User profile not found.');
    }

    return mapUserRecordToProfile(user);
  }

  async updateUserProfileForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<UserProfileUpdateRequest>,
  ): Promise<UserProfilePayload> {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw new BadRequestException('Request body is required for /user/profile PATCH.');
    }

    const existing = await this.userRepository.findById(session.user.id);

    if (!existing) {
      throw new NotFoundException('User profile not found.');
    }

    const updateData: Prisma.UserUpdateInput = {};
    let mutationCount = 0;

    if ('displayName' in request) {
      updateData.displayName = normalizeOptionalProfileText(
        request.displayName ?? null,
        'displayName',
        maxProfileDisplayNameLength,
      );
      mutationCount += 1;
    }

    if ('avatarUrl' in request) {
      updateData.avatarUrl = normalizeAvatarUrl(request.avatarUrl ?? null);
      mutationCount += 1;
    }

    if ('locale' in request) {
      updateData.locale = normalizeLocale(request.locale ?? null);
      mutationCount += 1;
    }

    if ('timezone' in request) {
      updateData.timezone = normalizeTimezone(request.timezone ?? null);
      mutationCount += 1;
    }

    if (mutationCount === 0) {
      throw new BadRequestException(
        'At least one profile field must be provided: displayName, avatarUrl, locale, timezone.',
      );
    }

    const updated = await this.userRepository.update(session.user.id, updateData);

    return mapUserRecordToProfile(updated);
  }

  getSubscription(personaKey?: string, workspaceId?: string) {
    const persona = getPersona(personaKey);
    const workspace = getWorkspaceSummary(workspaceId ?? persona.preferredWorkspaceId);
    const plan = getPlanForWorkspace(workspace.id);
    const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    return {
      workspace,
      accessDecision: canReadWorkspaceSubscription(persona.principal, workspace.id),
      summary: resolveWorkspaceSubscriptionSummary({
        workspaceId: workspace.id,
        plan,
        subscription: {
          planId: plan.id,
          status: workspace.id === 'ws_beta' ? 'trialing' : 'active',
          interval: 'monthly',
          cancelAtPeriodEnd: false,
          seats: workspace.id === 'ws_beta' ? 3 : 24,
          trialEndsAt: currentPeriodEnd,
        },
      }),
    };
  }

  async getSubscriptionForCurrentSession(session: CurrentSessionSnapshot, workspaceId?: string) {
    const requestedWorkspace =
      (workspaceId ? session.workspaces.find((workspace) => workspace.id === workspaceId) : session.workspaces[0]) ?? null;

    if (!requestedWorkspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const accessDecision = canReadWorkspaceSubscription(session.principal as SessionPrincipal, requestedWorkspace.id);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const subscription = await this.subscriptionRepository.findCurrentByWorkspaceId(requestedWorkspace.id);

    if (!subscription) {
      throw new NotFoundException('Subscription not found for workspace.');
    }

    return {
      workspace: requestedWorkspace,
      accessDecision,
      summary: resolveWorkspaceSubscriptionSummary({
        workspaceId: requestedWorkspace.id,
        plan: mapPlanRecordToDefinition(subscription.plan),
        subscription: mapSubscriptionRecordToSnapshot(subscription),
        overrides: mapEntitlementOverrides(subscription.workspace.entitlementOverrides),
      }),
    };
  }

  getUsage(personaKey?: string, workspaceId?: string): WorkspaceUsageSnapshot {
    const persona = getPersona(personaKey);
    const workspace = getWorkspaceSummary(workspaceId ?? persona.preferredWorkspaceId);
    const accessDecision = canReadUsage(persona.principal as SessionPrincipal, workspace.id);
    const plan = getPlanForWorkspace(workspace.id);
    const currentPeriodStart = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const currentPeriodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const seatCount = workspace.id === 'ws_beta' ? 3 : 2;
    const quotas = buildUsageQuotas({
      entitlements: plan.entitlements,
      seatCount,
      currentPeriodStart,
      currentPeriodEnd,
      counters: [
        {
          key: 'limit.requests_per_day',
          consumed: workspace.id === 'ws_beta' ? 7 : 312,
          periodStart: new Date(Date.now() - 10 * 60 * 60 * 1000),
          periodEnd: new Date(Date.now() + 14 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
      ],
    });
    const installations = mapUsageInstallations([
      {
        installationId: workspace.id === 'ws_beta' ? 'inst_foundation_edge' : 'inst_foundation_chrome',
        browser: workspace.id === 'ws_beta' ? 'edge' : 'chrome',
        extensionVersion: workspace.id === 'ws_beta' ? '1.6.1' : '1.7.0',
        schemaVersion: '2',
        capabilitiesJson:
          workspace.id === 'ws_beta' ? ['quiz-capture', 'history-sync'] : ['quiz-capture', 'history-sync', 'remote-sync'],
        lastSeenAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    ]);
    const recentEvents = buildRecentUsageEvents({
      telemetry: [
        {
          id: `${workspace.id}:telemetry:1`,
          eventType: 'extension.quiz_answer_requested',
          severity: 'info',
          payloadJson: {
            questionType: workspace.id === 'ws_beta' ? 'short_answer' : 'multiple_choice',
            surface: 'content_script',
          },
          createdAt: new Date(Date.now() - 12 * 60 * 1000),
          installation: {
            installationId: installations[0]?.installationId ?? 'inst_foundation',
          },
        },
      ],
      activity: [
        {
          id: `${workspace.id}:activity:1`,
          actorId: persona.user.id,
          eventType: 'usage.dashboard_opened',
          metadataJson: {
            workspaceId: workspace.id,
            route: '/app/usage',
          },
          createdAt: new Date(Date.now() - 30 * 60 * 1000),
        },
      ],
      aiRequests: [],
    });

    return {
      workspace,
      accessDecision,
      planCode: plan.code,
      subscriptionStatus: workspace.id === 'ws_beta' ? 'trialing' : 'active',
      currentPeriodStart: currentPeriodStart.toISOString(),
      currentPeriodEnd: currentPeriodEnd.toISOString(),
      quotas,
      installations,
      recentEvents,
    };
  }

  async getUsageForCurrentSession(
    session: CurrentSessionSnapshot,
    workspaceId?: string,
  ): Promise<WorkspaceUsageSnapshot> {
    const requestedWorkspace =
      (workspaceId ? session.workspaces.find((workspace) => workspace.id === workspaceId) : session.workspaces[0]) ?? null;

    if (!requestedWorkspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const accessDecision = canReadUsage(session.principal as SessionPrincipal, requestedWorkspace.id);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const subscription = await this.subscriptionRepository.findCurrentByWorkspaceId(requestedWorkspace.id);

    if (!subscription) {
      throw new NotFoundException('Subscription not found for workspace.');
    }

    const [installations, counters, telemetry, activity, aiRequests] = await Promise.all([
      this.usageRepository.listInstallationsByWorkspaceId(requestedWorkspace.id),
      this.usageRepository.listQuotaCountersByWorkspaceId(requestedWorkspace.id),
      this.usageRepository.listRecentTelemetryByWorkspaceId(requestedWorkspace.id),
      this.usageRepository.listRecentActivityByWorkspaceId(requestedWorkspace.id),
      this.usageRepository.listRecentAiRequestsByWorkspaceId(requestedWorkspace.id),
    ]);
    const summary = resolveWorkspaceSubscriptionSummary({
      workspaceId: requestedWorkspace.id,
      plan: mapPlanRecordToDefinition(subscription.plan),
      subscription: mapSubscriptionRecordToSnapshot(subscription),
      overrides: mapEntitlementOverrides(subscription.workspace.entitlementOverrides),
    });
    const usageSnapshot: WorkspaceUsageSnapshot = {
      workspace: requestedWorkspace,
      accessDecision,
      planCode: summary.planCode,
      subscriptionStatus: summary.status,
      currentPeriodStart: subscription.currentPeriodStart?.toISOString(),
      currentPeriodEnd: summary.currentPeriodEnd,
      quotas: buildUsageQuotas({
        entitlements: summary.entitlements,
        counters,
        seatCount: summary.seatCount,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      }),
      installations: mapUsageInstallations(installations),
      recentEvents: buildRecentUsageEvents({
        telemetry,
        activity,
        aiRequests,
      }),
    };
    await this.enqueueQuotaResetsForExpiredUsageQuotas(usageSnapshot);

    return usageSnapshot;
  }

  listUsageHistory(
    personaKey?: string,
    request?: Partial<UsageHistoryRequest>,
  ): WorkspaceUsageHistorySnapshot {
    const persona = getPersona(personaKey);
    const workspaceId = request?.workspaceId?.trim() || persona.preferredWorkspaceId;
    const workspace = getWorkspaceSummary(workspaceId);
    const accessDecision = canReadUsage(persona.principal as SessionPrincipal, workspace.id);
    const summary = this.getUsage(personaKey, workspace.id);
    const filters = this.normalizeUsageHistoryFilters({
      workspaceId: workspace.id,
      source: request?.source,
      eventType: request?.eventType,
      installationId: request?.installationId,
      actorId: request?.actorId,
      limit: request?.limit,
    });

    return {
      workspace,
      accessDecision,
      filters,
      items: this.filterUsageHistoryItems(summary.recentEvents, filters),
      permissions: listPrincipalPermissions(persona.principal, workspace.id),
    };
  }

  async listUsageHistoryForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<UsageHistoryRequest>,
  ): Promise<WorkspaceUsageHistorySnapshot> {
    const requestedWorkspace =
      ((request?.workspaceId?.trim()
        ? session.workspaces.find((workspace) => workspace.id === request.workspaceId?.trim())
        : session.workspaces[0]) as CurrentSessionSnapshot['workspaces'][number] | undefined) ?? null;

    if (!requestedWorkspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const accessDecision = canReadUsage(session.principal as SessionPrincipal, requestedWorkspace.id);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const filters = this.normalizeUsageHistoryFilters({
      workspaceId: requestedWorkspace.id,
      source: request?.source,
      eventType: request?.eventType,
      installationId: request?.installationId,
      actorId: request?.actorId,
      limit: request?.limit,
    });
    const fetchLimit = Math.min(filters.limit * 2, maxUsageHistoryLimit);
    const telemetryPromise =
      filters.source === 'activity' || filters.source === 'ai'
        ? Promise.resolve([])
        : this.usageRepository.listTelemetryHistoryByWorkspaceId({
            workspaceId: requestedWorkspace.id,
            limit: fetchLimit,
            ...(filters.eventType ? { eventType: filters.eventType } : {}),
            ...(filters.installationId ? { installationId: filters.installationId } : {}),
          });
    const activityPromise =
      filters.source === 'telemetry' || filters.source === 'ai'
        ? Promise.resolve([])
        : this.usageRepository.listActivityHistoryByWorkspaceId({
            workspaceId: requestedWorkspace.id,
            limit: fetchLimit,
            ...(filters.eventType ? { eventType: filters.eventType } : {}),
            ...(filters.actorId ? { actorId: filters.actorId } : {}),
          });
    const aiRequestsPromise =
      filters.source === 'telemetry' || filters.source === 'activity'
        ? Promise.resolve([])
        : this.usageRepository.listAiRequestHistoryByWorkspaceId({
            workspaceId: requestedWorkspace.id,
            limit: fetchLimit,
            ...(filters.actorId ? { actorId: filters.actorId } : {}),
            ...(filters.installationId ? { installationId: filters.installationId } : {}),
          });
    const [telemetry, activity, aiRequests] = await Promise.all([telemetryPromise, activityPromise, aiRequestsPromise]);
    const items = buildRecentUsageEvents({
      telemetry,
      activity,
      aiRequests,
      limit: Math.min(fetchLimit * 2, maxUsageHistoryLimit),
    });

    return {
      workspace: requestedWorkspace,
      accessDecision,
      filters,
      items: this.filterUsageHistoryItems(items, filters),
      permissions: listPrincipalPermissions(session.principal, requestedWorkspace.id),
    };
  }

  private normalizeUsageHistoryFilters(input: {
    workspaceId: string;
    source?: UsageHistoryRequest['source'];
    eventType?: string;
    installationId?: string;
    actorId?: string;
    limit?: number;
  }): WorkspaceUsageHistorySnapshot['filters'] {
    const source = normalizeUsageHistorySource(input.source);
    const eventType = normalizeUsageHistoryString(input.eventType);
    const installationId = normalizeUsageHistoryString(input.installationId);
    const actorId = normalizeUsageHistoryString(input.actorId);
    const limit = normalizeUsageHistoryLimit(input.limit);

    if (source === 'telemetry' && actorId) {
      throw new BadRequestException('actorId filter is only supported for activity or ai sources.');
    }

    if (source === 'activity' && installationId) {
      throw new BadRequestException('installationId filter is only supported for telemetry or ai sources.');
    }

    return {
      workspaceId: input.workspaceId,
      source,
      ...(eventType ? { eventType } : {}),
      ...(installationId ? { installationId } : {}),
      ...(actorId ? { actorId } : {}),
      limit,
    };
  }

  private filterUsageHistoryItems(
    items: WorkspaceUsageHistorySnapshot['items'],
    filters: WorkspaceUsageHistorySnapshot['filters'],
  ): WorkspaceUsageHistorySnapshot['items'] {
    return items
      .filter((item) => (filters.source === 'all' ? true : item.source === filters.source))
      .filter((item) => (filters.eventType ? item.eventType === filters.eventType : true))
      .filter((item) => (filters.installationId ? item.installationId === filters.installationId : true))
      .filter((item) => (filters.actorId ? item.actorId === filters.actorId : true))
      .slice(0, filters.limit);
  }

  private async enqueueQuotaResetsForExpiredUsageQuotas(summary: WorkspaceUsageSnapshot): Promise<void> {
    const requestedAt = new Date().toISOString();
    const dispatches: Array<Promise<unknown>> = [];

    for (const quota of summary.quotas) {
      if (quota.key === 'limit.seats') {
        continue;
      }

      const periodStart = new Date(quota.periodStart);
      const periodEnd = new Date(quota.periodEnd);

      if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime())) {
        continue;
      }

      if (periodEnd.getTime() > Date.now()) {
        continue;
      }

      const currentWindowMs = periodEnd.getTime() - periodStart.getTime();
      const windowDurationMs = currentWindowMs > 0 ? currentWindowMs : 24 * 60 * 60 * 1000;
      const queuePayload: QuotaResetJobPayload = {
        workspaceId: summary.workspace.id,
        key: quota.key,
        consumed: quota.consumed,
        periodStart: quota.periodStart,
        periodEnd: quota.periodEnd,
        nextPeriodStart: periodEnd.toISOString(),
        nextPeriodEnd: new Date(periodEnd.getTime() + windowDurationMs).toISOString(),
        requestedAt,
      };

      dispatches.push(
        this.queueDispatchService.dispatch(
          createQueueDispatchRequest({
            queue: 'quota-resets',
            payload: queuePayload,
          }),
        ),
      );
    }

    if (dispatches.length === 0) {
      return;
    }

    await Promise.all(dispatches);
  }

  exportUsage(personaKey?: string, request?: Partial<UsageExportRequest>): UsageExportResult {
    const workspaceId = request?.workspaceId?.trim();

    if (!workspaceId) {
      throw new BadRequestException('workspaceId is required for usage export.');
    }

    const summary = this.getUsage(personaKey, workspaceId);

    return this.buildUsageExportResult(summary, request);
  }

  async exportUsageForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<UsageExportRequest>,
  ): Promise<UsageExportResult> {
    const workspaceId = request?.workspaceId?.trim();

    if (!workspaceId) {
      throw new BadRequestException('workspaceId is required for usage export.');
    }

    const requestedWorkspace = session.workspaces.find((workspace) => workspace.id === workspaceId) ?? null;

    if (!requestedWorkspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const accessDecision = canExportUsage(session.principal as SessionPrincipal, requestedWorkspace.id);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const exportResult = this.buildUsageExportResult(
      await this.getUsageForCurrentSession(session, requestedWorkspace.id),
      request,
    );
    const queuePayload: AuditExportJobPayload = {
      exportType: 'usage',
      workspaceId: exportResult.workspaceId,
      format: exportResult.format,
      scope: exportResult.scope,
      fileName: exportResult.fileName,
      contentType: exportResult.contentType,
      exportedAt: exportResult.exportedAt,
      requestedByUserId: session.user.id,
    };
    await this.queueDispatchService.dispatch(
      createQueueDispatchRequest({
        queue: 'audit-exports',
        payload: queuePayload,
      }),
    );

    return exportResult;
  }

  exportAdminLogs(personaKey?: string, request?: Partial<AdminLogExportRequest>): AdminLogExportResult {
    const snapshot = this.listAdminLogs(personaKey, request);
    const persona = getPersona(personaKey);
    const accessDecision = canExportAuditLogs(persona.principal, snapshot.filters.workspaceId);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    return this.buildAdminLogExportResult(snapshot, request);
  }

  async exportAdminLogsForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<AdminLogExportRequest>,
  ): Promise<AdminLogExportResult> {
    const resolvedWorkspaceId = request?.workspaceId?.trim() || session.workspaces[0]?.id;
    const accessDecision = canExportAuditLogs(session.principal as SessionPrincipal, resolvedWorkspaceId);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const exportResult = this.buildAdminLogExportResult(
      await this.listAdminLogsForCurrentSession(session, {
        ...request,
        ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
      }),
      request,
    );
    const queuePayload: AuditExportJobPayload = {
      exportType: 'admin_logs',
      ...(exportResult.workspaceId ? { workspaceId: exportResult.workspaceId } : {}),
      format: exportResult.format,
      fileName: exportResult.fileName,
      contentType: exportResult.contentType,
      exportedAt: exportResult.exportedAt,
      itemCount: exportResult.itemCount,
      requestedByUserId: session.user.id,
    };
    await this.queueDispatchService.dispatch(
      createQueueDispatchRequest({
        queue: 'audit-exports',
        payload: queuePayload,
      }),
    );

    return exportResult;
  }

  listAdminExtensionFleet(
    personaKey?: string,
    filters?: Partial<AdminExtensionFleetFilters>,
  ): AdminExtensionFleetSnapshot {
    const persona = getPersona(personaKey);
    const resolvedWorkspaceId = filters?.workspaceId?.trim() || persona.preferredWorkspaceId;

    if (!resolvedWorkspaceId) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const normalizedFilters = this.normalizeAdminExtensionFleetFilters(filters, resolvedWorkspaceId);
    const accessDecision = canReadExtensionInstallations(persona.principal, normalizedFilters.workspaceId);
    const workspace = getWorkspaceSummary(normalizedFilters.workspaceId);
    const baseItems = accessDecision.allowed
      ? this.buildFoundationAdminExtensionFleetItems(persona.key, workspace)
      : [];
    const filtered = this.filterAdminExtensionFleetItems(baseItems, normalizedFilters);
    const selectedInstallation =
      accessDecision.allowed && normalizedFilters.installationId
        ? this.buildFoundationAdminExtensionInstallationDetail(
            baseItems.find((item) => item.installationId === normalizedFilters.installationId),
          )
        : undefined;

    return {
      personaKey: persona.key,
      accessDecision,
      workspace,
      filters: normalizedFilters,
      items: filtered.items,
      counts: filtered.counts,
      ...(normalizedFilters.installationId ? { selectedInstallationId: normalizedFilters.installationId } : {}),
      ...(selectedInstallation ? { selectedInstallation } : {}),
      permissions: listPrincipalPermissions(persona.principal, normalizedFilters.workspaceId),
    };
  }

  async listAdminExtensionFleetForCurrentSession(
    session: CurrentSessionSnapshot,
    filters?: Partial<AdminExtensionFleetFilters>,
  ): Promise<AdminExtensionFleetSnapshot> {
    const resolvedWorkspaceId = filters?.workspaceId?.trim() || session.workspaces[0]?.id;

    if (!resolvedWorkspaceId) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const requestedWorkspace = session.workspaces.find((workspace) => workspace.id === resolvedWorkspaceId) ?? null;

    if (!requestedWorkspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const accessDecision = canReadExtensionInstallations(session.principal as SessionPrincipal, requestedWorkspace.id);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const normalizedFilters = this.normalizeAdminExtensionFleetFilters(filters, requestedWorkspace.id);
    const [installations, compatibilityRule] = await Promise.all([
      this.extensionInstallationRepository.listByWorkspaceId(requestedWorkspace.id),
      this.extensionCompatibilityRepository.findLatest(),
    ]);
    const sessionStats = this.buildInstallationSessionStats(
      await this.extensionInstallationSessionRepository.listActiveByInstallationIds(
        installations.map((installation) => installation.id),
      ),
    );
    const compatibilityPolicy = compatibilityRule
      ? mapExtensionCompatibilityRuleToPolicy(compatibilityRule, defaultCompatibilityPolicy)
      : defaultCompatibilityPolicy;
    const allItems = installations.map((installation) =>
      this.mapAdminExtensionFleetItem(installation, requestedWorkspace, compatibilityPolicy, sessionStats),
    );
    const filtered = this.filterAdminExtensionFleetItems(
      allItems,
      normalizedFilters,
    );
    const selectedInstallation =
      normalizedFilters.installationId
        ? await this.buildAdminExtensionInstallationDetail(
            installations.find((installation) => installation.installationId === normalizedFilters.installationId),
            allItems.find((item) => item.installationId === normalizedFilters.installationId),
          )
        : undefined;

    return {
      personaKey: 'connected-user',
      accessDecision,
      workspace: requestedWorkspace,
      filters: normalizedFilters,
      items: filtered.items,
      counts: filtered.counts,
      ...(normalizedFilters.installationId ? { selectedInstallationId: normalizedFilters.installationId } : {}),
      ...(selectedInstallation ? { selectedInstallation } : {}),
      permissions: session.permissions,
    };
  }

  listAdminWebhooks(personaKey?: string, filters?: Partial<AdminWebhookFilters>): AdminWebhooksSnapshot {
    const persona = getPersona(personaKey);
    const normalizedFilters = this.normalizeAdminWebhookFilters(filters);
    const accessDecision = canReadJobs(persona.principal);
    const retryDecision = canRetryJobs(persona.principal);
    const baseItems = accessDecision.allowed ? this.buildFoundationWebhookEntries() : [];
    const filtered = this.filterAdminWebhookEntries(baseItems, normalizedFilters);

    return {
      personaKey: persona.key,
      accessDecision,
      retryDecision,
      filters: normalizedFilters,
      items: filtered.items,
      statusCounts: filtered.statusCounts,
      queues: this.buildAdminQueueSummaries(),
      permissions: listPrincipalPermissions(persona.principal, persona.preferredWorkspaceId),
    };
  }

  async listAdminWebhooksForCurrentSession(
    session: CurrentSessionSnapshot,
    filters?: Partial<AdminWebhookFilters>,
  ): Promise<AdminWebhooksSnapshot> {
    const accessDecision = canReadJobs(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const normalizedFilters = this.normalizeAdminWebhookFilters(filters);
    const records = await this.billingWebhookRepository.listRecentEvents(Math.max(normalizedFilters.limit * 3, 24));
    const filtered = this.filterAdminWebhookEntries(
      records.map((record) => this.mapBillingWebhookRecordToAdminEntry(record)),
      normalizedFilters,
    );

    return {
      personaKey: 'connected-user',
      accessDecision,
      retryDecision: canRetryJobs(session.principal as SessionPrincipal),
      filters: normalizedFilters,
      items: filtered.items,
      statusCounts: filtered.statusCounts,
      queues: this.buildAdminQueueSummaries(),
      permissions: session.permissions,
    };
  }

  async retryAdminWebhookForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<AdminWebhookRetryRequest>,
  ): Promise<AdminWebhookRetryResult> {
    const accessDecision = canRetryJobs(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const webhookEventId = request?.webhookEventId?.trim();

    if (!webhookEventId) {
      throw new BadRequestException('webhookEventId is required.');
    }

    const webhookEvent = await this.billingWebhookRepository.findEventById(webhookEventId);

    if (!webhookEvent) {
      throw new NotFoundException('Webhook event not found.');
    }

    const provider = this.normalizeBillingProvider(webhookEvent.provider);

    if (webhookEvent.processedAt || webhookEvent.status === 'processed') {
      throw new BadRequestException('Processed webhook events cannot be retried.');
    }

    if (webhookEvent.status !== 'failed') {
      throw new BadRequestException('Only failed webhook events can be retried.');
    }

    await this.billingWebhookRepository.resetEventForRetry(webhookEvent.id);

    const retriedAt = new Date().toISOString();
    const queueJob = await this.queueDispatchService.dispatch<BillingWebhookJobPayload>({
      queue: 'billing-webhooks',
      jobId: `billing-webhooks:retry:${webhookEvent.id}:${Date.now()}`,
      dedupeKey: `retry:${provider}:${webhookEvent.externalEventId}:${Date.now()}`,
      payload: {
        provider,
        webhookEventId: webhookEvent.id,
        externalEventId: webhookEvent.externalEventId,
        eventType: webhookEvent.eventType,
        receivedAt: webhookEvent.receivedAt.toISOString(),
      },
    });

    return {
      webhookEventId: webhookEvent.id,
      provider,
      externalEventId: webhookEvent.externalEventId,
      eventType: webhookEvent.eventType,
      queue: queueJob.queue,
      jobId: queueJob.id,
      retriedAt,
      status: 'received',
    };
  }

  listAdminLogs(personaKey?: string, filters?: Partial<AdminLogFilters>): AdminLogsSnapshot {
    const persona = getPersona(personaKey);
    const normalizedFilters = this.normalizeAdminLogFilters(filters, filters?.workspaceId ?? persona.preferredWorkspaceId);
    const accessDecision = canReadAuditLogs(persona.principal, normalizedFilters.workspaceId);
    const permissions = listPrincipalPermissions(persona.principal, normalizedFilters.workspaceId);
    const baseItems = accessDecision.allowed
      ? this.buildFoundationAdminLogEntries(normalizedFilters.workspaceId)
      : [];
    const filtered = this.filterAdminLogEntries(baseItems, normalizedFilters);

    return {
      personaKey: persona.key,
      accessDecision,
      ...(normalizedFilters.workspaceId ? { workspace: getWorkspaceSummary(normalizedFilters.workspaceId) } : {}),
      filters: normalizedFilters,
      items: filtered.items,
      streamCounts: filtered.streamCounts,
      permissions,
    };
  }

  async listAdminLogsForCurrentSession(
    session: CurrentSessionSnapshot,
    filters?: Partial<AdminLogFilters>,
  ): Promise<AdminLogsSnapshot> {
    const resolvedWorkspaceId = filters?.workspaceId?.trim() || session.workspaces[0]?.id;
    const normalizedFilters = this.normalizeAdminLogFilters(filters, resolvedWorkspaceId);
    const accessDecision = canReadAuditLogs(session.principal as SessionPrincipal, normalizedFilters.workspaceId);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    if (normalizedFilters.workspaceId) {
      const workspaceVisible = session.workspaces.some((workspace) => workspace.id === normalizedFilters.workspaceId);

      if (!workspaceVisible) {
        throw new NotFoundException('Workspace not found or not accessible.');
      }
    }

    const records = await this.adminLogRepository.listRecent({
      workspaceId: normalizedFilters.workspaceId,
      stream: normalizedFilters.stream,
      severity: normalizedFilters.severity,
      limit: normalizedFilters.limit,
    });
    const baseItems = this.mapConnectedAdminLogEntries(records);
    const filtered = this.filterAdminLogEntries(baseItems, normalizedFilters);
    const workspace =
      normalizedFilters.workspaceId
        ? session.workspaces.find((candidate) => candidate.id === normalizedFilters.workspaceId) ?? undefined
        : undefined;

    return {
      personaKey: 'connected-user',
      accessDecision,
      ...(workspace ? { workspace } : {}),
      filters: normalizedFilters,
      items: filtered.items,
      streamCounts: filtered.streamCounts,
      permissions: session.permissions,
    };
  }

  listAdminSecurity(personaKey?: string, filters?: Partial<AdminLogFilters>): AdminSecuritySnapshot {
    const snapshot = this.listAdminLogs(personaKey, {
      ...filters,
      stream: 'security',
    });

    return this.buildAdminSecuritySnapshot(snapshot);
  }

  async listAdminSecurityForCurrentSession(
    session: CurrentSessionSnapshot,
    filters?: Partial<AdminLogFilters>,
  ): Promise<AdminSecuritySnapshot> {
    const snapshot = await this.listAdminLogsForCurrentSession(session, {
      ...filters,
      stream: 'security',
    });

    return this.buildAdminSecuritySnapshot(snapshot);
  }

  listFeatureFlags(personaKey?: string) {
    const persona = getPersona(personaKey);
    const foundation = getFoundationOverview();

    return {
      personaKey: persona.key,
      flags: foundation.featureFlags,
      publishDecision: canPublishRemoteConfig(persona.principal),
      permissions: listPrincipalPermissions(persona.principal, persona.preferredWorkspaceId),
    };
  }

  listUsers(personaKey?: string): AdminUserDirectorySnapshot {
    const persona = getPersona(personaKey);
    const accessDecision = canReadUsers(persona.principal);

    return {
      personaKey: persona.key,
      accessDecision,
      items: accessDecision.allowed ? listFoundationUsers() : [],
      permissions: listPrincipalPermissions(persona.principal, persona.preferredWorkspaceId),
    };
  }

  async listUsersForCurrentSession(session: CurrentSessionSnapshot): Promise<AdminUserDirectorySnapshot> {
    const accessDecision = canReadUsers(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const users = await this.userRepository.listAll();

    return {
      personaKey: 'connected-user',
      accessDecision,
      items: users.map(mapUserRecordToDirectoryEntry),
      permissions: session.permissions,
    };
  }

  async listFeatureFlagsForCurrentSession(session: CurrentSessionSnapshot) {
    const accessDecision = canReadFeatureFlags(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const flags = await this.featureFlagRepository.findAll();

    return {
      personaKey: 'connected-user',
      flags: flags.map(mapFeatureFlagRecordToDefinition),
      publishDecision: canPublishRemoteConfig(session.principal as SessionPrincipal),
      permissions: session.permissions,
    };
  }

  listCompatibilityRules(personaKey?: string): CompatibilityRulesSnapshot {
    const persona = getPersona(personaKey);
    const publishDecision = canManageCompatibilityRules(persona.principal);

    return {
      personaKey: persona.key,
      publishDecision,
      items: this.buildFoundationCompatibilityRules(),
      permissions: listPrincipalPermissions(persona.principal, persona.preferredWorkspaceId),
    };
  }

  async listCompatibilityRulesForCurrentSession(
    session: CurrentSessionSnapshot,
  ): Promise<CompatibilityRulesSnapshot> {
    const accessDecision = canManageCompatibilityRules(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const rules = await this.extensionCompatibilityRepository.findRecent();

    return {
      personaKey: 'connected-user',
      publishDecision: accessDecision,
      items: rules.map(mapExtensionCompatibilityRuleToDefinition),
      permissions: session.permissions,
    };
  }

  publishCompatibilityRule(
    request?: Partial<CompatibilityRulePublishRequest>,
  ): CompatibilityRulePublishResult {
    const normalized = this.normalizeCompatibilityRulePublishRequest(request);
    const publishedAt = new Date().toISOString();
    const requiredCapabilities = normalized.requiredCapabilities ?? [];

    return {
      rule: {
        id: `compatibility-rule-${Date.now()}`,
        minimumVersion: normalized.minimumVersion,
        recommendedVersion: normalized.recommendedVersion,
        supportedSchemaVersions: normalized.supportedSchemaVersions,
        resultStatus: normalized.resultStatus,
        ...(requiredCapabilities.length > 0
          ? { requiredCapabilities }
          : {}),
        ...(typeof normalized.reason === 'string' && normalized.reason.length > 0
          ? { reason: normalized.reason }
          : {}),
        createdAt: publishedAt,
      },
      publishedAt,
    };
  }

  async publishCompatibilityRuleForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<CompatibilityRulePublishRequest>,
  ): Promise<CompatibilityRulePublishResult> {
    const accessDecision = canManageCompatibilityRules(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const normalized = this.normalizeCompatibilityRulePublishRequest(request);
    const requiredCapabilities = normalized.requiredCapabilities ?? [];
    const createdRule = await this.extensionCompatibilityRepository.create({
      minimumVersion: normalized.minimumVersion,
      recommendedVersion: normalized.recommendedVersion,
      supportedSchemaVersions: normalized.supportedSchemaVersions,
      requiredCapabilities: requiredCapabilities.length > 0 ? requiredCapabilities : null,
      resultStatus: normalized.resultStatus,
      reason: typeof normalized.reason === 'string' ? normalized.reason : null,
    });

    return {
      rule: mapExtensionCompatibilityRuleToDefinition(createdRule),
      publishedAt: createdRule.createdAt.toISOString(),
    };
  }

  updateFeatureFlag(request?: Partial<FeatureFlagUpdateRequest>): FeatureFlagUpdateResult {
    const key = request?.key?.trim();

    if (!key) {
      throw new BadRequestException('Feature flag key is required.');
    }

    const existing = getFoundationOverview().featureFlags.find((flag) => flag.key === key);

    if (!existing) {
      throw new NotFoundException('Feature flag not found.');
    }

    const normalized = normalizeFeatureFlagUpdate(existing, request);

    this.assertValidFeatureFlagMutation(normalized);

    return {
      flag: this.mapNormalizedFeatureFlag(normalized),
      updatedAt: new Date().toISOString(),
    };
  }

  async updateFeatureFlagForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<FeatureFlagUpdateRequest>,
  ): Promise<FeatureFlagUpdateResult> {
    const accessDecision = canWriteFeatureFlags(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const key = request?.key?.trim();

    if (!key) {
      throw new BadRequestException('Feature flag key is required.');
    }

    const existingRecord = await this.featureFlagRepository.findByKey(key);

    if (!existingRecord) {
      throw new NotFoundException('Feature flag not found.');
    }

    const normalized = normalizeFeatureFlagUpdate(mapFeatureFlagRecordToDefinition(existingRecord), request);

    this.assertValidFeatureFlagMutation(normalized);

    try {
      const updatedRecord = await this.featureFlagRepository.replaceDefinition({
        key: normalized.key,
        description: normalized.description,
        status: normalized.status,
        enabled: normalized.enabled,
        rolloutPercentage: normalized.rolloutPercentage ?? null,
        minimumExtensionVersion: normalized.minimumExtensionVersion ?? null,
        allowRoles: normalized.allowRoles,
        allowPlans: normalized.allowPlans,
        allowUsers: normalized.allowUsers,
        allowWorkspaces: normalized.allowWorkspaces,
      });

      if (!updatedRecord) {
        throw new NotFoundException('Feature flag not found.');
      }

      return {
        flag: mapFeatureFlagRecordToDefinition(updatedRecord),
        updatedAt: updatedRecord.updatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException('Target user or workspace not found for feature flag targeting.');
      }

      throw error;
    }
  }

  listRemoteConfig(personaKey?: string, workspaceId?: string): RemoteConfigSnapshot {
    const persona = getPersona(personaKey);
    const resolvedWorkspaceId = workspaceId ?? persona.preferredWorkspaceId;
    const previewContext: RemoteConfigPreviewRequest['context'] = {
      environment: 'development',
      planCode: getPlanForWorkspace(resolvedWorkspaceId).code,
      workspaceId: resolvedWorkspaceId,
      userId: persona.user.id,
      activeFlags: persona.principal.featureFlags,
    };
    const activeLayers = getFoundationOverview().remoteConfigLayers;

    return {
      personaKey: persona.key,
      publishDecision: canPublishRemoteConfig(persona.principal),
      activeLayers,
      versions: this.buildFoundationRemoteConfigVersions(activeLayers, resolvedWorkspaceId),
      previewContext,
      preview: previewRemoteConfig({
        layers: activeLayers,
        context: previewContext,
      }),
      permissions: listPrincipalPermissions(persona.principal, resolvedWorkspaceId),
    };
  }

  async listRemoteConfigForCurrentSession(
    session: CurrentSessionSnapshot,
    workspaceId?: string,
  ): Promise<RemoteConfigSnapshot> {
    const accessDecision = canPublishRemoteConfig(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const resolvedWorkspaceId = workspaceId?.trim() || session.workspaces[0]?.id;
    const [subscription, activeLayerRecords, recentVersions] = await Promise.all([
      resolvedWorkspaceId
        ? this.subscriptionRepository.findCurrentByWorkspaceId(resolvedWorkspaceId)
        : Promise.resolve(null),
      this.remoteConfigRepository.findActiveLayers(resolvedWorkspaceId),
      this.remoteConfigRepository.findRecentVersions(resolvedWorkspaceId),
    ]);
    const activeLayers = activeLayerRecords.map(mapRemoteConfigLayerRecordToDefinition);
    const previewContext: RemoteConfigPreviewRequest['context'] = {
      environment: 'development',
      planCode: subscription?.plan.code ?? 'pro',
      workspaceId: resolvedWorkspaceId,
      userId: session.user.id,
      activeFlags: session.principal.featureFlags,
    };

    return {
      personaKey: 'connected-user',
      publishDecision: accessDecision,
      activeLayers,
      versions: recentVersions.map(mapRemoteConfigVersionRecordToSummary),
      previewContext,
      preview: previewRemoteConfig({
        layers: activeLayers,
        context: previewContext,
      }),
      permissions: session.permissions,
    };
  }

  publishRemoteConfig(request?: Partial<RemoteConfigPublishRequest>) {
    const fallbackActor = getPersona('platform-admin');
    const publishRequest: RemoteConfigPublishRequest = {
      versionLabel: request?.versionLabel ?? `local-${Date.now()}`,
      layers: request?.layers ?? getFoundationOverview().remoteConfigLayers,
      actorId: request?.actorId ?? fallbackActor.user.id,
      workspaceId: request?.workspaceId,
    };
    const previewRequest: RemoteConfigPreviewRequest = {
      layers: publishRequest.layers,
      context: {
        environment: 'development',
        planCode: 'pro',
        workspaceId: publishRequest.workspaceId ?? fallbackActor.preferredWorkspaceId,
        userId: fallbackActor.user.id,
        activeFlags: ['beta.remote-config-v2'],
      },
    };

    return {
      ...publishRemoteConfigVersion(publishRequest),
      preview: previewRemoteConfig(previewRequest),
    };
  }

  async publishRemoteConfigForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<RemoteConfigPublishRequest>,
  ) {
    const accessDecision = canPublishRemoteConfig(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const publishRequest: RemoteConfigPublishRequest = {
      versionLabel: request?.versionLabel ?? `connected-${Date.now()}`,
      layers: request?.layers ?? getFoundationOverview().remoteConfigLayers,
      actorId: session.user.id,
      workspaceId: request?.workspaceId,
    };

    try {
      const persistedVersion = await this.remoteConfigRepository.publishVersion({
        actorId: publishRequest.actorId,
        layers: publishRequest.layers,
        versionLabel: publishRequest.versionLabel,
        workspaceId: publishRequest.workspaceId,
      });
      const previewRequest: RemoteConfigPreviewRequest = {
        layers: publishRequest.layers,
        context: {
          environment: 'development',
          planCode: 'pro',
          workspaceId: publishRequest.workspaceId ?? session.workspaces[0]?.id,
          userId: session.user.id,
          activeFlags: ['beta.remote-config-v2'],
        },
      };
      const publishResult = publishRemoteConfigVersion(publishRequest, {
        publishedAt: persistedVersion.createdAt.toISOString(),
      });
      await this.queueDispatchService.dispatch(
        createQueueDispatchRequest({
          queue: 'config-publish',
          payload: publishResult.publishResult,
        }),
      );

      return {
        ...publishResult,
        preview: previewRemoteConfig(previewRequest),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException('Workspace not found for remote config publication.');
      }

      throw error;
    }
  }

  activateRemoteConfigVersion(
    request?: Partial<RemoteConfigActivateVersionRequest>,
  ): RemoteConfigActivateVersionResult {
    const versionId = request?.versionId?.trim();

    if (!versionId) {
      throw new BadRequestException('Remote config version is required.');
    }

    const version = this.resolveFoundationRemoteConfigVersion(versionId);

    if (!version) {
      throw new NotFoundException('Remote config version not found.');
    }

    return {
      version: {
        ...version,
        isActive: true,
      },
      activatedAt: new Date().toISOString(),
    };
  }

  async activateRemoteConfigVersionForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<RemoteConfigActivateVersionRequest>,
  ): Promise<RemoteConfigActivateVersionResult> {
    const accessDecision = canPublishRemoteConfig(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const versionId = request?.versionId?.trim();

    if (!versionId) {
      throw new BadRequestException('Remote config version is required.');
    }

    const activatedVersion = await this.remoteConfigRepository.activateVersion(versionId);

    if (!activatedVersion) {
      throw new NotFoundException('Remote config version not found.');
    }

    return {
      version: mapRemoteConfigVersionRecordToSummary(activatedVersion),
      activatedAt: new Date().toISOString(),
    };
  }

  async bootstrapExtension(request?: Partial<ExtensionBootstrapRequest>) {
    const fallbackPersona = getPersona('platform-admin');
    const bootstrapRequest: ExtensionBootstrapRequest = {
      installationId: request?.installationId ?? 'inst_local_browser',
      userId: request?.userId ?? fallbackPersona.user.id,
      workspaceId: request?.workspaceId ?? fallbackPersona.preferredWorkspaceId,
      environment: request?.environment ?? 'development',
      planCode: request?.planCode ?? 'pro',
      handshake: request?.handshake ?? {
        extensionVersion: '1.6.0',
        schemaVersion: '2',
        capabilities: ['quiz-capture', 'history-sync'],
        browser: 'chrome',
      },
    };

    if (this.env.runtimeMode !== 'connected') {
      return resolveExtensionBootstrap(bootstrapRequest);
    }

    return this.bootstrapExtensionForConnectedRuntime(bootstrapRequest);
  }

  async bootstrapExtensionForConnectedRuntime(request: ExtensionBootstrapRequest) {
    const [compatibilityRule, featureFlags, remoteConfigLayers, workspaceSubscription] = await Promise.all([
      this.extensionCompatibilityRepository.findLatest(),
      this.featureFlagRepository.findAll(),
      this.remoteConfigRepository.findActiveLayers(request.workspaceId),
      request.workspaceId ? this.subscriptionRepository.findCurrentByWorkspaceId(request.workspaceId) : Promise.resolve(null),
    ]);

    const effectivePlanCode = workspaceSubscription?.plan.code ?? request.planCode;

    return resolveExtensionBootstrap(
      {
        ...request,
        ...(effectivePlanCode ? { planCode: effectivePlanCode } : {}),
      },
      {
        ...(compatibilityRule ? { compatibilityPolicy: mapExtensionCompatibilityRuleToPolicy(compatibilityRule) } : {}),
        flagDefinitions: featureFlags.map(mapFeatureFlagRecordToDefinition),
        remoteConfigLayers: remoteConfigLayers.map(mapRemoteConfigLayerRecordToDefinition),
      },
    );
  }

  async ingestUsageEvent(event?: Partial<UsageEventPayload>): Promise<UsageEventIngestResult> {
    const usageEvent: UsageEventPayload = {
      installationId: event?.installationId ?? 'inst_local_browser',
      workspaceId: event?.workspaceId ?? 'ws_alpha',
      eventType: event?.eventType ?? 'extension.quiz_answer_requested',
      occurredAt: event?.occurredAt ?? new Date().toISOString(),
      payload: event?.payload ?? {
        questionType: 'multiple_choice',
        surface: 'content_script',
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

  private mapNormalizedFeatureFlag(normalized: NormalizedFeatureFlagUpdate) {
    return {
      key: normalized.key,
      status: normalized.status,
      description: normalized.description,
      enabled: normalized.enabled,
      ...(normalized.rolloutPercentage === undefined ? {} : { rolloutPercentage: normalized.rolloutPercentage }),
      ...(normalized.allowRoles.length > 0 ? { allowRoles: normalized.allowRoles } : {}),
      ...(normalized.allowPlans.length > 0 ? { allowPlans: normalized.allowPlans } : {}),
      ...(normalized.allowUsers.length > 0 ? { allowUsers: normalized.allowUsers } : {}),
      ...(normalized.allowWorkspaces.length > 0 ? { allowWorkspaces: normalized.allowWorkspaces } : {}),
      ...(normalized.minimumExtensionVersion
        ? { minimumExtensionVersion: normalized.minimumExtensionVersion }
        : {}),
    };
  }

  private assertValidFeatureFlagMutation(normalized: NormalizedFeatureFlagUpdate) {
    if (!normalized.description.trim()) {
      throw new BadRequestException('Feature flag description is required.');
    }

    if (
      normalized.rolloutPercentage !== undefined &&
      (!Number.isInteger(normalized.rolloutPercentage) ||
        normalized.rolloutPercentage < 0 ||
        normalized.rolloutPercentage > 100)
    ) {
      throw new BadRequestException('Feature flag rollout percentage must be an integer between 0 and 100.');
    }
  }

  private buildFoundationCompatibilityRules(): CompatibilityRuleDefinition[] {
    const activeRule: CompatibilityRuleDefinition = {
      id: 'foundation-compatibility-active',
      minimumVersion: defaultCompatibilityPolicy.minimumVersion,
      recommendedVersion: defaultCompatibilityPolicy.recommendedVersion,
      supportedSchemaVersions: [...defaultCompatibilityPolicy.supportedSchemaVersions],
      ...(defaultCompatibilityPolicy.requiredCapabilities
        ? { requiredCapabilities: [...defaultCompatibilityPolicy.requiredCapabilities] }
        : {}),
      resultStatus: 'supported',
      createdAt: '2026-03-24T08:00:00.000Z',
    };

    return [
      activeRule,
      {
        ...activeRule,
        id: 'foundation-compatibility-previous',
        recommendedVersion: '1.5.0',
        resultStatus: 'supported_with_warnings',
        reason: 'Older extension builds are still allowed, but a refresh is recommended.',
        createdAt: '2026-03-23T18:30:00.000Z',
      },
    ];
  }

  private normalizeCompatibilityRulePublishRequest(
    request?: Partial<CompatibilityRulePublishRequest>,
  ): CompatibilityRulePublishRequest {
    const minimumVersion = request?.minimumVersion?.trim();
    const recommendedVersion = request?.recommendedVersion?.trim();
    const supportedSchemaVersions = Array.from(
      new Set(
        (request?.supportedSchemaVersions ?? [])
          .map((version) => version.trim())
          .filter((version) => version.length > 0),
      ),
    );
    const requiredCapabilities = Array.from(
      new Set(
        (request?.requiredCapabilities ?? [])
          .map((capability) => capability.trim())
          .filter((capability) => capability.length > 0),
      ),
    );
    const reason = request?.reason?.trim() || undefined;
    const resultStatus = request?.resultStatus;

    if (!minimumVersion) {
      throw new BadRequestException('minimumVersion is required.');
    }

    if (!recommendedVersion) {
      throw new BadRequestException('recommendedVersion is required.');
    }

    if (compareSemver(recommendedVersion, minimumVersion) < 0) {
      throw new BadRequestException('recommendedVersion must be greater than or equal to minimumVersion.');
    }

    if (supportedSchemaVersions.length === 0) {
      throw new BadRequestException('At least one supported schema version is required.');
    }

    if (
      resultStatus !== 'supported' &&
      resultStatus !== 'supported_with_warnings' &&
      resultStatus !== 'deprecated' &&
      resultStatus !== 'unsupported'
    ) {
      throw new BadRequestException('resultStatus must be a valid compatibility status.');
    }

    return {
      minimumVersion,
      recommendedVersion,
      supportedSchemaVersions,
      ...(requiredCapabilities.length > 0 ? { requiredCapabilities } : {}),
      resultStatus,
      ...(reason ? { reason } : {}),
    };
  }

  private normalizeAdminExtensionFleetFilters(
    filters?: Partial<AdminExtensionFleetFilters>,
    defaultWorkspaceId?: string,
  ): AdminExtensionFleetFilters {
    const workspaceId = filters?.workspaceId?.trim() || defaultWorkspaceId;

    if (!workspaceId) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const compatibility =
      typeof filters?.compatibility === 'string' && validAdminExtensionCompatibilityFilters.has(filters.compatibility)
        ? filters.compatibility
        : 'all';
    const connection =
      typeof filters?.connection === 'string' && validAdminExtensionConnectionFilters.has(filters.connection)
        ? filters.connection
        : 'all';
    const installationId = filters?.installationId?.trim() || undefined;
    const search = filters?.search?.trim() || undefined;
    const limit =
      typeof filters?.limit === 'number' && Number.isFinite(filters.limit)
        ? Math.min(Math.max(Math.trunc(filters.limit), 8), 50)
        : 12;

    return {
      workspaceId,
      compatibility,
      connection,
      ...(installationId ? { installationId } : {}),
      ...(search ? { search } : {}),
      limit,
    };
  }

  private buildFoundationAdminExtensionFleetItems(
    personaKey: string | undefined,
    workspace: AdminExtensionFleetSnapshot['workspace'],
  ): AdminExtensionFleetItem[] {
    const persona = getPersona(personaKey);
    const usageSummary = this.getUsage(persona.key, workspace.id);
    const activeRule = this.buildFoundationCompatibilityRules()[0];
    const compatibilityPolicy = {
      minimumVersion: activeRule.minimumVersion,
      recommendedVersion: activeRule.recommendedVersion,
      supportedSchemaVersions: activeRule.supportedSchemaVersions,
      ...(activeRule.requiredCapabilities ? { requiredCapabilities: activeRule.requiredCapabilities } : {}),
      resultStatus: activeRule.resultStatus,
      ...(activeRule.reason ? { reason: activeRule.reason } : {}),
    };

    return usageSummary.installations.map((installation, index) => {
      const compatibility = evaluateCompatibility(
        {
          extensionVersion: installation.extensionVersion,
          schemaVersion: installation.schemaVersion,
          capabilities: installation.capabilities,
          browser: normalizeInstallationBrowser(installation.browser),
        },
        compatibilityPolicy,
      );
      const lastSeenAt = installation.lastSeenAt ?? new Date('2026-03-24T12:00:00.000Z').toISOString();
      const lastSeenTime = new Date(lastSeenAt).getTime();

      return {
        workspace,
        userId: persona.user.id,
        installationId: installation.installationId,
        browser: normalizeInstallationBrowser(installation.browser),
        extensionVersion: installation.extensionVersion,
        schemaVersion: installation.schemaVersion,
        capabilities: installation.capabilities,
        boundAt: new Date(lastSeenTime - (index + 1) * 60 * 60 * 1000).toISOString(),
        ...(installation.lastSeenAt ? { lastSeenAt: installation.lastSeenAt } : {}),
        activeSessionCount: 1,
        lastSessionIssuedAt: new Date(lastSeenTime - 15 * 60 * 1000).toISOString(),
        lastSessionExpiresAt: new Date(lastSeenTime + 45 * 60 * 1000).toISOString(),
        compatibility,
        requiresReconnect: false,
      };
    });
  }

  private buildFoundationAdminExtensionInstallationDetail(
    installation: AdminExtensionFleetItem | undefined,
  ): AdminExtensionFleetInstallationDetail | undefined {
    if (!installation) {
      return undefined;
    }

    const issuedAt = installation.lastSessionIssuedAt ?? installation.boundAt;
    const activeSession: AdminExtensionFleetSessionHistoryItem = {
      id: `${installation.installationId}:session:active`,
      installationId: installation.installationId,
      userId: installation.userId,
      issuedAt,
      expiresAt:
        installation.lastSessionExpiresAt ??
        new Date(new Date(issuedAt).getTime() + 45 * 60 * 1000).toISOString(),
      status: installation.requiresReconnect ? 'expired' : 'active',
    };
    const previousSession: AdminExtensionFleetSessionHistoryItem = {
      id: `${installation.installationId}:session:previous`,
      installationId: installation.installationId,
      userId: installation.userId,
      issuedAt: new Date(new Date(issuedAt).getTime() - 90 * 60 * 1000).toISOString(),
      expiresAt: new Date(new Date(issuedAt).getTime() - 30 * 60 * 1000).toISOString(),
      revokedAt: new Date(new Date(issuedAt).getTime() - 50 * 60 * 1000).toISOString(),
      status: 'revoked',
    };
    const sessions: AdminExtensionFleetSessionHistoryItem[] = installation.requiresReconnect
      ? [previousSession, activeSession]
      : [activeSession, previousSession];

    return {
      installation,
      counts: this.buildAdminExtensionSessionHistoryCounts(sessions),
      sessions,
    };
  }

  private buildInstallationSessionStats(
    sessions: ActiveExtensionInstallationSessionRecord[],
  ): Map<string, { count: number; lastSessionIssuedAt?: string; lastSessionExpiresAt?: string }> {
    return sessions.reduce((stats, session) => {
      const existing = stats.get(session.extensionInstallationId);

      stats.set(session.extensionInstallationId, {
        count: (existing?.count ?? 0) + 1,
        lastSessionIssuedAt: existing?.lastSessionIssuedAt ?? session.createdAt.toISOString(),
        lastSessionExpiresAt: existing?.lastSessionExpiresAt ?? session.expiresAt.toISOString(),
      });

      return stats;
    }, new Map<string, { count: number; lastSessionIssuedAt?: string; lastSessionExpiresAt?: string }>());
  }

  private async buildAdminExtensionInstallationDetail(
    installationRecord: ExtensionInstallationRecord | undefined,
    installation: AdminExtensionFleetItem | undefined,
  ): Promise<AdminExtensionFleetInstallationDetail | undefined> {
    if (!installationRecord || !installation) {
      return undefined;
    }

    const sessions = this.mapAdminExtensionSessionHistory(
      installation.installationId,
      await this.extensionInstallationSessionRepository.listRecentByInstallationRecordId(installationRecord.id),
    );

    return {
      installation,
      counts: this.buildAdminExtensionSessionHistoryCounts(sessions),
      sessions,
    };
  }

  private mapAdminExtensionFleetItem(
    installation: ExtensionInstallationRecord,
    workspace: AdminExtensionFleetSnapshot['workspace'],
    compatibilityPolicy: typeof defaultCompatibilityPolicy,
    sessionStats: Map<string, { count: number; lastSessionIssuedAt?: string; lastSessionExpiresAt?: string }>,
  ): AdminExtensionFleetItem {
    const normalizedBrowser = normalizeInstallationBrowser(installation.browser);
    const compatibility = evaluateCompatibility(
      {
        extensionVersion: installation.extensionVersion,
        schemaVersion: installation.schemaVersion,
        capabilities: normalizeInstallationCapabilities(installation.capabilitiesJson),
        browser: normalizedBrowser,
      },
      compatibilityPolicy,
    );
    const stats = sessionStats.get(installation.id);

    return {
      workspace,
      userId: installation.userId,
      installationId: installation.installationId,
      browser: normalizedBrowser,
      extensionVersion: installation.extensionVersion,
      schemaVersion: installation.schemaVersion,
      capabilities: normalizeInstallationCapabilities(installation.capabilitiesJson),
      boundAt: installation.createdAt.toISOString(),
      ...(installation.lastSeenAt ? { lastSeenAt: installation.lastSeenAt.toISOString() } : {}),
      activeSessionCount: stats?.count ?? 0,
      ...(stats?.lastSessionIssuedAt ? { lastSessionIssuedAt: stats.lastSessionIssuedAt } : {}),
      ...(stats?.lastSessionExpiresAt ? { lastSessionExpiresAt: stats.lastSessionExpiresAt } : {}),
      compatibility,
      requiresReconnect: (stats?.count ?? 0) === 0,
    };
  }

  private mapAdminExtensionSessionHistory(
    installationId: string,
    sessions: RecentExtensionInstallationSessionRecord[],
    now = new Date(),
  ): AdminExtensionFleetSessionHistoryItem[] {
    return sessions.map((session) => ({
      id: session.id,
      installationId,
      userId: session.userId,
      issuedAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      ...(session.revokedAt ? { revokedAt: session.revokedAt.toISOString() } : {}),
      status: resolveAdminExtensionSessionStatus(session, now),
    }));
  }

  private buildAdminExtensionSessionHistoryCounts(
    sessions: AdminExtensionFleetSessionHistoryItem[],
  ): AdminExtensionFleetInstallationDetail['counts'] {
    return {
      total: sessions.length,
      active: sessions.filter((session) => session.status === 'active').length,
      expired: sessions.filter((session) => session.status === 'expired').length,
      revoked: sessions.filter((session) => session.status === 'revoked').length,
    };
  }

  private filterAdminExtensionFleetItems(
    items: AdminExtensionFleetItem[],
    filters: AdminExtensionFleetFilters,
  ): {
    items: AdminExtensionFleetItem[];
    counts: AdminExtensionFleetSnapshot['counts'];
  } {
    const filteredItems = items.filter((item) => {
      if (filters.compatibility !== 'all' && item.compatibility.status !== filters.compatibility) {
        return false;
      }

      if (filters.connection === 'connected' && item.requiresReconnect) {
        return false;
      }

      if (filters.connection === 'reconnect_required' && !item.requiresReconnect) {
        return false;
      }

      if (!filters.search) {
        return true;
      }

      return this.matchesAdminExtensionFleetSearch(item, filters.search);
    });
    const counts: AdminExtensionFleetSnapshot['counts'] = {
      total: filteredItems.length,
      connected: filteredItems.filter((item) => !item.requiresReconnect).length,
      reconnectRequired: filteredItems.filter((item) => item.requiresReconnect).length,
      supported: filteredItems.filter((item) => item.compatibility.status === 'supported').length,
      supportedWithWarnings: filteredItems.filter((item) => item.compatibility.status === 'supported_with_warnings').length,
      deprecated: filteredItems.filter((item) => item.compatibility.status === 'deprecated').length,
      unsupported: filteredItems.filter((item) => item.compatibility.status === 'unsupported').length,
    };

    return {
      items: filteredItems
        .sort((left, right) => {
          const rightDate = right.lastSeenAt ?? right.boundAt;
          const leftDate = left.lastSeenAt ?? left.boundAt;

          return new Date(rightDate).getTime() - new Date(leftDate).getTime();
        })
        .slice(0, filters.limit),
      counts,
    };
  }

  private matchesAdminExtensionFleetSearch(item: AdminExtensionFleetItem, search: string): boolean {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return true;
    }

    return [
      item.workspace.id,
      item.workspace.slug,
      item.workspace.name,
      item.userId,
      item.installationId,
      item.browser,
      item.extensionVersion,
      item.schemaVersion,
      item.compatibility.status,
      item.compatibility.reason,
      item.capabilities.join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  }

  private normalizeAdminWebhookFilters(filters?: Partial<AdminWebhookFilters>): AdminWebhookFilters {
    const provider =
      typeof filters?.provider === 'string' && validAdminWebhookProviderFilters.has(filters.provider)
        ? filters.provider
        : 'all';
    const status =
      typeof filters?.status === 'string' && validAdminWebhookStatusFilters.has(filters.status)
        ? filters.status
        : 'all';
    const search = filters?.search?.trim() || undefined;
    const limit =
      typeof filters?.limit === 'number' && Number.isFinite(filters.limit)
        ? Math.min(Math.max(Math.trunc(filters.limit), 8), 40)
        : 12;

    return {
      provider,
      status,
      ...(search ? { search } : {}),
      limit,
    };
  }

  private buildAdminQueueSummaries(): AdminQueueSummary[] {
    return listQueueDefinitions().map((definition) => ({
      name: definition.name,
      description: definition.description,
      attempts: definition.attempts,
      ...this.describeQueueProcessor(definition.name),
    }));
  }

  private describeQueueProcessor(
    queueName: AdminQueueSummary['name'],
  ): Pick<AdminQueueSummary, 'processorState' | 'handler'> {
    switch (queueName) {
      case 'billing-webhooks':
        return {
          processorState: 'bound',
          handler: 'processBillingWebhookJob',
        };
      case 'usage-events':
        return {
          processorState: 'bound',
          handler: 'processUsageEventJob',
        };
      case 'emails':
        return {
          processorState: 'bound',
          handler: 'processEmailJob',
        };
      case 'quota-resets':
        return {
          processorState: 'bound',
          handler: 'processQuotaResetJob',
        };
      case 'entitlement-refresh':
        return {
          processorState: 'bound',
          handler: 'processEntitlementRefreshJob',
        };
      case 'config-publish':
        return {
          processorState: 'bound',
          handler: 'propagateRemoteConfigPublish',
        };
      case 'audit-exports':
        return {
          processorState: 'bound',
          handler: 'processAuditExportJob',
        };
      default:
        return {
          processorState: 'declared_only',
        };
    }
  }

  private buildFoundationWebhookEntries(): AdminWebhookEventSummary[] {
    return [
      {
        id: 'webhook_foundation_failed',
        provider: 'stripe',
        externalEventId: 'evt_foundation_failed',
        eventType: 'invoice.payment_failed',
        status: 'failed',
        queue: 'billing-webhooks',
        retryable: true,
        receivedAt: '2026-03-24T12:00:00.000Z',
        providerCreatedAt: '2026-03-24T11:59:20.000Z',
        processedAt: null,
        lastError: 'Workspace billing context could not be resolved for the incoming customer.',
      },
      {
        id: 'webhook_foundation_processed',
        provider: 'stripe',
        externalEventId: 'evt_foundation_processed',
        eventType: 'customer.subscription.updated',
        status: 'processed',
        queue: 'billing-webhooks',
        retryable: false,
        receivedAt: '2026-03-24T11:25:00.000Z',
        providerCreatedAt: '2026-03-24T11:24:44.000Z',
        processedAt: '2026-03-24T11:25:04.000Z',
      },
      {
        id: 'webhook_foundation_received',
        provider: 'stripe',
        externalEventId: 'evt_foundation_received',
        eventType: 'checkout.session.completed',
        status: 'received',
        queue: 'billing-webhooks',
        retryable: false,
        receivedAt: '2026-03-24T11:15:00.000Z',
        providerCreatedAt: '2026-03-24T11:14:53.000Z',
        processedAt: null,
      },
    ];
  }

  private mapBillingWebhookRecordToAdminEntry(record: BillingWebhookAdminRecord): AdminWebhookEventSummary {
    const status =
      record.status === 'processed' ? 'processed' : record.status === 'failed' ? 'failed' : 'received';

    return {
      id: record.id,
      provider: this.normalizeBillingProvider(record.provider),
      externalEventId: record.externalEventId,
      eventType: record.eventType,
      status,
      queue: 'billing-webhooks',
      retryable: status === 'failed',
      receivedAt: record.receivedAt.toISOString(),
      providerCreatedAt: record.providerCreatedAt?.toISOString() ?? null,
      processedAt: record.processedAt?.toISOString() ?? null,
      lastError: record.lastError ?? null,
    };
  }

  private normalizeBillingProvider(provider: string | null | undefined): BillingProvider {
    if (
      provider === 'manual' ||
      provider === 'mock' ||
      provider === 'yookassa' ||
      provider === 'paddle'
    ) {
      return provider;
    }

    return 'stripe';
  }

  private filterAdminWebhookEntries(items: AdminWebhookEventSummary[], filters: AdminWebhookFilters): {
    items: AdminWebhookEventSummary[];
    statusCounts: AdminWebhooksSnapshot['statusCounts'];
  } {
    const filteredItems = items.filter((item) => {
      if (filters.provider !== 'all' && item.provider !== filters.provider) {
        return false;
      }

      if (filters.status !== 'all' && item.status !== filters.status) {
        return false;
      }

      if (!filters.search) {
        return true;
      }

      return this.matchesAdminWebhookSearch(item, filters.search);
    });
    const statusCounts: AdminWebhooksSnapshot['statusCounts'] = {
      received: filteredItems.filter((item) => item.status === 'received').length,
      processed: filteredItems.filter((item) => item.status === 'processed').length,
      failed: filteredItems.filter((item) => item.status === 'failed').length,
    };

    return {
      items: filteredItems
        .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime())
        .slice(0, filters.limit),
      statusCounts,
    };
  }

  private matchesAdminWebhookSearch(item: AdminWebhookEventSummary, search: string): boolean {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return true;
    }

    return [item.provider, item.externalEventId, item.eventType, item.status, item.queue, item.lastError]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  }

  private normalizeAdminLogFilters(
    filters?: Partial<AdminLogFilters>,
    defaultWorkspaceId?: string,
  ): AdminLogFilters {
    const workspaceId = filters?.workspaceId?.trim() || defaultWorkspaceId;
    const stream =
      typeof filters?.stream === 'string' && validAdminLogStreams.has(filters.stream) ? filters.stream : 'all';
    const severity =
      typeof filters?.severity === 'string' && validAdminLogSeverityFilters.has(filters.severity)
        ? filters.severity
        : 'all';
    const search = filters?.search?.trim() || undefined;
    const limit =
      typeof filters?.limit === 'number' && Number.isFinite(filters.limit)
        ? Math.min(Math.max(Math.trunc(filters.limit), 1), 50)
        : 12;

    return {
      ...(workspaceId ? { workspaceId } : {}),
      stream,
      severity,
      ...(search ? { search } : {}),
      limit,
    };
  }

  private buildFoundationAdminLogEntries(workspaceId?: string): AdminLogEntry[] {
    const workspace = workspaceId ? getWorkspaceSummary(workspaceId) : undefined;
    const platformAdmin = getPersona('platform-admin');
    const supportAdmin = getPersona('support-admin');
    const workspaceViewer = getPersona('workspace-viewer');

    return [
      {
        id: `audit:${workspace?.id ?? 'platform'}:provider-policy`,
        stream: 'audit',
        eventType: 'ai_provider_policy.updated',
        summary: 'Updated the AI provider policy and narrowed the allowed provider set for the selected scope.',
        occurredAt: '2026-03-24T13:40:00.000Z',
        severity: 'info',
        status: 'success',
        actor: {
          id: platformAdmin.user.id,
          email: platformAdmin.user.email,
          displayName: platformAdmin.user.displayName,
        },
        ...(workspace
          ? {
              workspace: {
                id: workspace.id,
                slug: workspace.slug,
                name: workspace.name,
              },
            }
          : {}),
        targetType: 'ai_provider_policy',
        targetId: workspace ? `workspace:${workspace.id}` : 'global',
        metadata: {
          mode: 'platform_only',
          providers: ['openrouter', 'openai'],
        },
      },
      {
        id: `activity:${workspace?.id ?? 'platform'}:usage-dashboard`,
        stream: 'activity',
        eventType: 'usage.dashboard_opened',
        summary: 'Opened the usage explorer and reviewed the latest quota counters for the workspace.',
        occurredAt: '2026-03-24T13:28:00.000Z',
        actor: {
          id: platformAdmin.user.id,
          email: platformAdmin.user.email,
          displayName: platformAdmin.user.displayName,
        },
        ...(workspace
          ? {
              workspace: {
                id: workspace.id,
                slug: workspace.slug,
                name: workspace.name,
              },
            }
          : {}),
        metadata: {
          route: '/app/usage',
          source: 'dashboard',
        },
      },
      {
        id: `security:${workspace?.id ?? 'platform'}:auth-login-failed`,
        stream: 'security',
        eventType: 'auth.login_failed',
        summary: 'Blocked a sign-in attempt after the submitted password did not match the stored account credentials.',
        occurredAt: '2026-03-24T12:58:00.000Z',
        severity: 'warn',
        status: 'failure',
        actor: {
          id: workspaceViewer.user.id,
          email: workspaceViewer.user.email,
          displayName: workspaceViewer.user.displayName,
        },
        ...(workspace
          ? {
              workspace: {
                id: workspace.id,
                slug: workspace.slug,
                name: workspace.name,
              },
            }
          : {}),
        targetType: 'auth_session',
        targetId: workspaceViewer.user.id,
        metadata: {
          reason: 'invalid_password',
        },
      },
      {
        id: `domain:${workspace?.id ?? 'platform'}:subscription-changed`,
        stream: 'domain',
        eventType: 'billing.subscription_changed',
        summary: 'Reconciled the workspace subscription after a provider status update moved the plan into active state.',
        occurredAt: '2026-03-24T12:40:00.000Z',
        ...(workspace
          ? {
              workspace: {
                id: workspace.id,
                slug: workspace.slug,
                name: workspace.name,
              },
            }
          : {}),
        metadata: {
          provider: 'stripe',
          status: 'active',
        },
      },
      {
        id: `audit:${workspace?.id ?? 'platform'}:support-ticket`,
        stream: 'audit',
        eventType: 'support.ticket_workflow_updated',
        summary: 'Assigned the support ticket, moved it into progress, and attached a handoff note for the next operator.',
        occurredAt: '2026-03-24T12:12:00.000Z',
        severity: 'info',
        status: 'success',
        actor: {
          id: supportAdmin.user.id,
          email: supportAdmin.user.email,
          displayName: supportAdmin.user.displayName,
        },
        ...(workspace
          ? {
              workspace: {
                id: workspace.id,
                slug: workspace.slug,
                name: workspace.name,
              },
            }
          : {}),
        targetType: 'support_ticket',
        targetId: 'support-ticket-demo-1',
        metadata: {
          nextStatus: 'in_progress',
        },
      },
    ];
  }

  private mapConnectedAdminLogEntries(
    input: Awaited<ReturnType<AdminLogRepository['listRecent']>>,
  ): AdminLogEntry[] {
    const actorById = new Map(
      input.actors.map((actor) => [
        actor.id,
        {
          id: actor.id,
          email: actor.email,
          ...(actor.displayName ? { displayName: actor.displayName } : {}),
        },
      ]),
    );

    return [
      ...input.audit.map((record) => {
        const metadata = this.toAdminLogMetadata(record.metadataJson);
        const severity = this.readAdminLogSeverity(metadata);
        const status = this.readAdminLogStatus(metadata);

        return {
          id: `audit:${record.id}`,
          stream: 'audit' as const,
          eventType: record.action,
          summary:
            this.readAdminLogSummary(metadata) ??
            `Audit event ${record.action} on ${record.targetType} ${record.targetId}.`,
          occurredAt: record.createdAt.toISOString(),
          ...(severity ? { severity } : {}),
          ...(status ? { status } : {}),
          ...(record.actorId ? { actor: actorById.get(record.actorId) ?? { id: record.actorId } } : {}),
          ...(record.workspace
            ? {
                workspace: {
                  id: record.workspace.id,
                  slug: record.workspace.slug,
                  name: record.workspace.name,
                },
              }
            : {}),
          targetType: record.targetType,
          targetId: record.targetId,
          ...(metadata ? { metadata } : {}),
        };
      }),
      ...input.activity.map((record) => {
        const metadata = this.toAdminLogMetadata(record.metadataJson);

        return {
          id: `activity:${record.id}`,
          stream: 'activity' as const,
          eventType: record.eventType,
          summary: this.readAdminLogSummary(metadata) ?? this.summarizeMetadataPayload(metadata, record.eventType),
          occurredAt: record.createdAt.toISOString(),
          ...(record.actorId ? { actor: actorById.get(record.actorId) ?? { id: record.actorId } } : {}),
          ...(record.workspace
            ? {
                workspace: {
                  id: record.workspace.id,
                  slug: record.workspace.slug,
                  name: record.workspace.name,
                },
              }
            : {}),
          ...(metadata ? { metadata } : {}),
        };
      }),
      ...input.security.map((record) => {
        const metadata = this.toAdminLogMetadata(record.metadataJson);
        const status = this.readAdminLogStatus(metadata);

        return {
          id: `security:${record.id}`,
          stream: 'security' as const,
          eventType: record.eventType,
          summary: this.readAdminLogSummary(metadata) ?? this.summarizeMetadataPayload(metadata, record.eventType),
          occurredAt: record.createdAt.toISOString(),
          severity: record.severity,
          ...(status ? { status } : {}),
          ...(record.actorId ? { actor: actorById.get(record.actorId) ?? { id: record.actorId } } : {}),
          ...(record.workspace
            ? {
                workspace: {
                  id: record.workspace.id,
                  slug: record.workspace.slug,
                  name: record.workspace.name,
                },
              }
            : {}),
          ...(metadata ? { metadata } : {}),
        };
      }),
      ...input.domain.map((record) => {
        const metadata = this.toAdminLogMetadata(record.payloadJson);

        return {
          id: `domain:${record.id}`,
          stream: 'domain' as const,
          eventType: record.eventType,
          summary: this.readAdminLogSummary(metadata) ?? this.summarizeMetadataPayload(metadata, record.eventType),
          occurredAt: record.createdAt.toISOString(),
          ...(record.workspace
            ? {
                workspace: {
                  id: record.workspace.id,
                  slug: record.workspace.slug,
                  name: record.workspace.name,
                },
              }
            : {}),
          ...(metadata ? { metadata } : {}),
        };
      }),
    ].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());
  }

  private filterAdminLogEntries(items: AdminLogEntry[], filters: AdminLogFilters): {
    items: AdminLogEntry[];
    streamCounts: AdminLogsSnapshot['streamCounts'];
  } {
    const afterSearchAndSeverity = items.filter((item) => {
      if (filters.severity !== 'all' && item.severity !== filters.severity) {
        return false;
      }

      if (!filters.search) {
        return true;
      }

      return this.matchesAdminLogSearch(item, filters.search);
    });
    const streamCounts: AdminLogsSnapshot['streamCounts'] = {
      audit: afterSearchAndSeverity.filter((item) => item.stream === 'audit').length,
      activity: afterSearchAndSeverity.filter((item) => item.stream === 'activity').length,
      security: afterSearchAndSeverity.filter((item) => item.stream === 'security').length,
      domain: afterSearchAndSeverity.filter((item) => item.stream === 'domain').length,
    };
    const filteredItems =
      filters.stream === 'all'
        ? afterSearchAndSeverity
        : afterSearchAndSeverity.filter((item) => item.stream === filters.stream);

    return {
      items: filteredItems.slice(0, filters.limit),
      streamCounts,
    };
  }

  private buildAdminSecuritySnapshot(snapshot: AdminLogsSnapshot): AdminSecuritySnapshot {
    return {
      personaKey: snapshot.personaKey,
      accessDecision: snapshot.accessDecision,
      ...(snapshot.workspace ? { workspace: snapshot.workspace } : {}),
      filters: snapshot.filters,
      items: snapshot.items,
      streamCounts: snapshot.streamCounts,
      findings: this.buildAdminSecurityFindings(snapshot.items),
      controls: this.buildAdminSecurityControls(),
      permissions: snapshot.permissions,
    };
  }

  private buildAdminSecurityFindings(items: AdminLogEntry[]): AdminSecuritySnapshot['findings'] {
    const eventSearchText = (item: AdminLogEntry) =>
      [
        item.eventType,
        item.summary,
        item.targetType,
        item.targetId,
        item.metadata ? JSON.stringify(item.metadata) : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    const suspiciousAuthFailures = items.filter((item) => {
      const search = eventSearchText(item);

      return (
        item.eventType.startsWith('auth.') &&
        (item.status === 'failure' || search.includes('failed') || search.includes('invalid'))
      );
    }).length;
    const impersonationEvents = items.filter((item) => eventSearchText(item).includes('impersonation')).length;
    const providerCredentialEvents = items.filter((item) => {
      const search = eventSearchText(item);

      return (
        search.includes('credential') ||
        search.includes('provider') ||
        search.includes('api key') ||
        search.includes('api_key')
      );
    }).length;
    const privilegedActionEvents = items.filter((item) => {
      const search = eventSearchText(item);

      return (
        search.includes('policy') ||
        search.includes('role') ||
        search.includes('suspend') ||
        search.includes('publish') ||
        search.includes('impersonation') ||
        search.includes('credential')
      );
    }).length;
    const totalFailures = items.filter((item) => item.status === 'failure' || item.severity === 'error').length;

    return {
      suspiciousAuthFailures,
      impersonationEvents,
      providerCredentialEvents,
      privilegedActionEvents,
      totalFailures,
    };
  }

  private buildAdminSecurityControls(): AdminSecuritySnapshot['controls'] {
    return [
      {
        id: 'admin_mfa',
        title: 'Admin MFA enforcement',
        status: 'planned',
        description: 'Require MFA enrollment and step-up verification for privileged admin surfaces.',
      },
      {
        id: 'step_up_auth',
        title: 'Step-up authentication',
        status: 'in_progress',
        description: 'Prompt for secondary verification before high-risk actions like role changes and key rotation.',
      },
      {
        id: 'secret_access_audit',
        title: 'Secret access audit',
        status: 'in_progress',
        description: 'Track and review provider credential and BYOK secret access events end-to-end.',
      },
      {
        id: 'risk_scoring',
        title: 'Risk scoring and markers',
        status: 'planned',
        description: 'Label suspicious authentication and control-plane behavior with review markers for security ops.',
      },
    ];
  }

  private matchesAdminLogSearch(item: AdminLogEntry, search: string): boolean {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return true;
    }

    return [
      item.stream,
      item.eventType,
      item.summary,
      item.severity,
      item.status,
      item.actor?.id,
      item.actor?.email,
      item.actor?.displayName,
      item.workspace?.id,
      item.workspace?.slug,
      item.workspace?.name,
      item.targetType,
      item.targetId,
      item.metadata ? JSON.stringify(item.metadata) : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  }

  private toAdminLogMetadata(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private readAdminLogSummary(metadata?: Record<string, unknown>) {
    return typeof metadata?.summary === 'string' && metadata.summary.trim().length > 0
      ? metadata.summary.trim()
      : undefined;
  }

  private readAdminLogSeverity(metadata?: Record<string, unknown>): AdminLogEntry['severity'] {
    const severity = metadata?.severity;

    return severity === 'debug' || severity === 'info' || severity === 'warn' || severity === 'error'
      ? severity
      : undefined;
  }

  private readAdminLogStatus(metadata?: Record<string, unknown>): AdminLogEntry['status'] {
    const status = metadata?.status;

    return status === 'success' || status === 'failure' ? status : undefined;
  }

  private summarizeMetadataPayload(metadata: Record<string, unknown> | undefined, fallback: string) {
    if (!metadata) {
      return fallback;
    }

    const entries = Object.entries(metadata)
      .filter(([key, value]) => key !== 'summary' && ['string', 'number', 'boolean'].includes(typeof value))
      .slice(0, 3)
      .map(([key, value]) => `${key}=${String(value)}`);

    return entries.length > 0 ? entries.join(' | ') : fallback;
  }

  private buildAdminLogExportResult(
    snapshot: AdminLogsSnapshot,
    request?: Partial<AdminLogExportRequest>,
  ): AdminLogExportResult {
    const format = this.normalizeAdminLogExportFormat(request?.format);
    const exportedAt = new Date().toISOString();
    const fileStem = `audit-logs-${snapshot.workspace?.slug ?? 'platform'}-${exportedAt.slice(0, 10)}`;

    if (format === 'json') {
      return {
        ...(snapshot.workspace ? { workspaceId: snapshot.workspace.id } : {}),
        format,
        fileName: `${fileStem}.json`,
        contentType: 'application/json',
        exportedAt,
        itemCount: snapshot.items.length,
        content: JSON.stringify(
          {
            exportedAt,
            workspace: snapshot.workspace ?? null,
            filters: snapshot.filters,
            streamCounts: snapshot.streamCounts,
            items: snapshot.items,
          },
          null,
          2,
        ),
      };
    }

    return {
      ...(snapshot.workspace ? { workspaceId: snapshot.workspace.id } : {}),
      format,
      fileName: `${fileStem}.csv`,
      contentType: 'text/csv; charset=utf-8',
      exportedAt,
      itemCount: snapshot.items.length,
      content: this.serializeAdminLogsCsv(snapshot),
    };
  }

  private normalizeAdminLogExportFormat(format?: AdminLogExportFormat): AdminLogExportFormat {
    return format === 'csv' ? 'csv' : 'json';
  }

  private serializeAdminLogsCsv(snapshot: AdminLogsSnapshot): string {
    const header =
      'stream,eventType,summary,occurredAt,severity,status,workspaceId,workspaceSlug,workspaceName,actorId,actorEmail,actorDisplayName,targetType,targetId,metadata';
    const rows = snapshot.items.map((item) =>
      [
        item.stream,
        item.eventType,
        item.summary,
        item.occurredAt,
        item.severity ?? '',
        item.status ?? '',
        item.workspace?.id ?? '',
        item.workspace?.slug ?? '',
        item.workspace?.name ?? '',
        item.actor?.id ?? '',
        item.actor?.email ?? '',
        item.actor?.displayName ?? '',
        item.targetType ?? '',
        item.targetId ?? '',
        item.metadata ? JSON.stringify(item.metadata) : '',
      ]
        .map((value) => this.escapeCsv(value))
        .join(','),
    );

    return [header, ...rows].join('\n');
  }

  private buildUsageExportResult(
    summary: WorkspaceUsageSnapshot,
    request?: Partial<UsageExportRequest>,
  ): UsageExportResult {
    const format = request?.format === 'csv' ? 'csv' : 'json';
    const scope = request?.scope ?? 'full';
    const exportedAt = new Date().toISOString();

    if (format === 'csv' && scope === 'full') {
      throw new BadRequestException('CSV export requires a specific scope: quotas, installations, or events.');
    }

    const fileStem = `usage-${summary.workspace.slug}-${scope}-${exportedAt.slice(0, 10)}`;

    if (format === 'json') {
      const payload =
        scope === 'quotas'
          ? summary.quotas
          : scope === 'installations'
            ? summary.installations
            : scope === 'events'
              ? summary.recentEvents
              : summary;

      return {
        workspaceId: summary.workspace.id,
        format,
        scope,
        fileName: `${fileStem}.json`,
        contentType: 'application/json',
        exportedAt,
        content: JSON.stringify(payload, null, 2),
      };
    }

    return {
      workspaceId: summary.workspace.id,
      format,
      scope,
      fileName: `${fileStem}.csv`,
      contentType: 'text/csv; charset=utf-8',
      exportedAt,
      content:
        scope === 'quotas'
          ? this.serializeUsageQuotasCsv(summary)
          : scope === 'installations'
            ? this.serializeUsageInstallationsCsv(summary)
            : this.serializeUsageEventsCsv(summary),
    };
  }

  private serializeUsageQuotasCsv(summary: WorkspaceUsageSnapshot): string {
    const header = 'key,label,consumed,limit,remaining,periodStart,periodEnd,status';
    const rows = summary.quotas.map((quota) =>
      [
        quota.key,
        quota.label,
        String(quota.consumed),
        quota.limit === undefined ? '' : String(quota.limit),
        quota.remaining === undefined ? '' : String(quota.remaining),
        quota.periodStart,
        quota.periodEnd,
        quota.status,
      ]
        .map((value) => this.escapeCsv(value))
        .join(','),
    );

    return [header, ...rows].join('\n');
  }

  private serializeUsageInstallationsCsv(summary: WorkspaceUsageSnapshot): string {
    const header = 'installationId,browser,extensionVersion,schemaVersion,capabilities,lastSeenAt';
    const rows = summary.installations.map((installation) =>
      [
        installation.installationId,
        installation.browser,
        installation.extensionVersion,
        installation.schemaVersion,
        installation.capabilities.join('|'),
        installation.lastSeenAt ?? '',
      ]
        .map((value) => this.escapeCsv(value))
        .join(','),
    );

    return [header, ...rows].join('\n');
  }

  private serializeUsageEventsCsv(summary: WorkspaceUsageSnapshot): string {
    const header = 'id,source,eventType,severity,occurredAt,installationId,actorId,summary';
    const rows = summary.recentEvents.map((event) =>
      [
        event.id,
        event.source,
        event.eventType,
        event.severity ?? '',
        event.occurredAt,
        event.installationId ?? '',
        event.actorId ?? '',
        event.summary,
      ]
        .map((value) => this.escapeCsv(value))
        .join(','),
    );

    return [header, ...rows].join('\n');
  }

  private escapeCsv(value: string): string {
    const normalized = value.replaceAll('"', '""');

    return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
  }

  listSupportImpersonationSessions(personaKey?: string): SupportImpersonationHistorySnapshot {
    const persona = getPersona(personaKey);
    const accessDecision = canReadSupportImpersonationSessions(persona.principal);
    const supportPersona = getPersona('support-admin');
    const targetPersona = getPersona('workspace-viewer');
    const workspace = getWorkspaceSummary(supportPersona.preferredWorkspaceId);
    const items: SupportImpersonationSessionSnapshot[] = accessDecision.allowed
      ? [
          {
            impersonationSessionId: 'support-demo-session-1',
            supportActor: {
              id: supportPersona.user.id,
              email: supportPersona.user.email,
              displayName: supportPersona.user.displayName,
            },
            targetUser: {
              id: targetPersona.user.id,
              email: targetPersona.user.email,
              displayName: targetPersona.user.displayName,
            },
            workspace: {
              id: workspace.id,
              slug: workspace.slug,
              name: workspace.name,
            },
            reason: 'Investigating why a viewer lost access to workspace billing pages.',
            createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
            endedAt: null,
          },
        ]
      : [];

    return buildSupportImpersonationHistorySnapshot({
      personaKey: persona.key,
      accessDecision,
      items,
      permissions: listPrincipalPermissions(persona.principal, persona.preferredWorkspaceId),
    });
  }

  async listSupportImpersonationSessionsForCurrentSession(
    session: CurrentSessionSnapshot,
  ): Promise<SupportImpersonationHistorySnapshot> {
    const accessDecision = canReadSupportImpersonationSessions(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const items = await this.supportImpersonationRepository.listRecent();

    return buildSupportImpersonationHistorySnapshot({
      personaKey: 'connected-user',
      accessDecision,
      items: items.map(mapSupportImpersonationRecordToSnapshot),
      permissions: session.permissions,
    });
  }

  listSupportTickets(
    personaKey?: string,
    filtersInput?: SupportTicketQueueFilterInput,
  ): SupportTicketQueueSnapshot {
    const persona = getPersona(personaKey);
    const accessDecision = canReadSupportTickets(persona.principal);
    const filters = normalizeSupportTicketQueueFilters(filtersInput);
    const favoritePresets: SupportTicketQueuePreset[] =
      persona.key === 'support-admin' ? ['active_queue', 'shared_queue'] : [];

    return buildSupportTicketQueueSnapshot({
      personaKey: persona.key,
      accessDecision,
      items: accessDecision.allowed
        ? filterSupportTicketQueueEntries(listFoundationSupportTickets(), filters, persona.user.id)
        : [],
      permissions: listPrincipalPermissions(persona.principal, persona.preferredWorkspaceId),
      filters,
      favoritePresets,
    });
  }

  async listSupportTicketsForCurrentSession(
    session: CurrentSessionSnapshot,
    filtersInput?: SupportTicketQueueFilterInput,
  ): Promise<SupportTicketQueueSnapshot> {
    const accessDecision = canReadSupportTickets(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const filters = normalizeSupportTicketQueueFilters(filtersInput);
    const [items, favoritePresets] = await Promise.all([
      this.supportTicketRepository.listRecent({
        statuses: resolveSupportTicketStatuses(filters.status),
        ...(filters.ownership === 'mine' ? { assignedToUserId: session.user.id } : {}),
        ...(filters.ownership === 'unassigned' ? { unassignedOnly: true } : {}),
        ...(filters.search ? { search: filters.search } : {}),
        limit: filters.limit,
      }),
      this.supportTicketPresetFavoriteRepository.listByUserId(session.user.id),
    ]);
    const timelineByTicketId = groupSupportTicketTimelineEntries(
      await this.supportTicketRepository.listTimelineEntries(
        items.map((item) => item.id),
        filters.timelineLimit,
      ),
    );

    return buildSupportTicketQueueSnapshot({
      personaKey: 'connected-user',
      accessDecision,
      items: items.map((item) => mapSupportTicketRecordToSnapshot(item, timelineByTicketId.get(item.id))),
      permissions: session.permissions,
      filters,
      favoritePresets,
    });
  }

  updateSupportTicketPresetFavorite(
    personaKey?: string,
    request?: Partial<SupportTicketQueuePresetFavoriteRequest>,
  ): SupportTicketQueuePresetFavoriteResult {
    const persona = getPersona(personaKey);
    const preset = request?.preset?.trim();

    if (!preset || !validSupportTicketPresetKeys.has(preset)) {
      throw new BadRequestException('A valid support ticket queue preset is required.');
    }

    const favorite = request?.favorite ?? true;
    const foundationFavorites: SupportTicketQueuePreset[] =
      persona.key === 'support-admin' ? ['active_queue', 'shared_queue'] : [];
    const favorites = favorite
      ? Array.from(new Set([...foundationFavorites, preset as SupportTicketQueuePreset]))
      : foundationFavorites.filter((item) => item !== preset);

    return {
      preset: preset as SupportTicketQueuePreset,
      favorite,
      favorites,
    };
  }

  async updateSupportTicketPresetFavoriteForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<SupportTicketQueuePresetFavoriteRequest>,
  ): Promise<SupportTicketQueuePresetFavoriteResult> {
    const accessDecision = canReadSupportTickets(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const preset = request?.preset?.trim();

    if (!preset || !validSupportTicketPresetKeys.has(preset)) {
      throw new BadRequestException('A valid support ticket queue preset is required.');
    }

    const favorite = request?.favorite ?? true;
    const favorites = await this.supportTicketPresetFavoriteRepository.setFavorite({
      userId: session.user.id,
      preset: preset as SupportTicketQueuePreset,
      favorite,
    });

    return {
      preset: preset as SupportTicketQueuePreset,
      favorite,
      favorites,
    };
  }

  updateSupportTicket(request?: Partial<SupportTicketWorkflowUpdateRequest>): SupportTicketWorkflowUpdateResult {
    const fallbackTicket =
      listFoundationSupportTickets().find((ticket) => ticket.id === request?.supportTicketId?.trim()) ??
      listFoundationSupportTickets()[0];

    if (!fallbackTicket) {
      throw new NotFoundException('Support ticket not found.');
    }

    const supportPersona = getPersona('support-admin');
    const normalizedStatus = request?.status ?? fallbackTicket.status;
    const normalizedAssignedToUserId =
      request?.assignedToUserId === undefined
        ? fallbackTicket.assignedTo?.id
        : request.assignedToUserId?.trim() || null;
    const normalizedHandoffNote =
      request?.handoffNote === undefined
        ? fallbackTicket.handoffNote
        : request.handoffNote?.trim() || undefined;
    const nextAssignee = normalizedAssignedToUserId
      ? {
          id: normalizedAssignedToUserId,
          email: supportPersona.user.email,
          displayName: supportPersona.user.displayName,
        }
      : null;
    const auditLog = createSupportTicketWorkflowAuditLog({
      supportTicketId: fallbackTicket.id,
      ticketSubject: fallbackTicket.subject,
      actor: {
        id: supportPersona.user.id,
        email: supportPersona.user.email,
        displayName: supportPersona.user.displayName,
      },
      workspaceId: fallbackTicket.workspace?.id,
      previousStatus: fallbackTicket.status,
      nextStatus: normalizedStatus,
      previousAssignee: fallbackTicket.assignedTo
        ? {
            id: fallbackTicket.assignedTo.id,
            email: fallbackTicket.assignedTo.email,
            displayName: fallbackTicket.assignedTo.displayName,
          }
        : null,
      nextAssignee,
      previousHandoffNote: fallbackTicket.handoffNote ?? null,
      nextHandoffNote: normalizedHandoffNote ?? null,
    });

    return {
      ...fallbackTicket,
      status: normalizedStatus,
      updatedAt: new Date().toISOString(),
      ...(nextAssignee ? { assignedTo: nextAssignee } : {}),
      ...(normalizedHandoffNote ? { handoffNote: normalizedHandoffNote } : {}),
      timeline: [
        {
          id: auditLog.eventId,
          eventType: auditLog.eventType,
          summary: String(auditLog.metadata?.summary ?? 'reviewed the ticket workflow'),
          occurredAt: auditLog.occurredAt,
          actor: {
            id: supportPersona.user.id,
            email: supportPersona.user.email,
            displayName: supportPersona.user.displayName,
          },
          ...(fallbackTicket.status !== normalizedStatus
            ? { previousStatus: fallbackTicket.status, nextStatus: normalizedStatus }
            : {}),
          ...(fallbackTicket.assignedTo
            ? {
                previousAssignee: {
                  id: fallbackTicket.assignedTo.id,
                  email: fallbackTicket.assignedTo.email,
                  displayName: fallbackTicket.assignedTo.displayName,
                },
              }
            : {}),
          ...(nextAssignee ? { nextAssignee } : {}),
          ...(normalizedHandoffNote ? { handoffNote: normalizedHandoffNote } : {}),
        },
        ...(fallbackTicket.timeline ?? []),
      ],
    };
  }

  async updateSupportTicketForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<SupportTicketWorkflowUpdateRequest>,
  ): Promise<SupportTicketWorkflowUpdateResult> {
    const accessDecision = canReadSupportTickets(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const supportTicketId = request?.supportTicketId?.trim();

    if (!supportTicketId) {
      throw new BadRequestException('Support ticket is required.');
    }

    const existingTicket = await this.supportTicketRepository.findById(supportTicketId);

    if (!existingTicket) {
      throw new NotFoundException('Support ticket not found.');
    }

    const normalizedStatus = request?.status;
    const normalizedAssignedToUserId =
      request && 'assignedToUserId' in request
        ? request.assignedToUserId?.trim() || null
        : undefined;
    const normalizedHandoffNote =
      request && 'handoffNote' in request
        ? request.handoffNote?.trim() || null
        : undefined;
    const effectiveAssignedToUserId =
      normalizedAssignedToUserId === undefined && normalizedStatus === 'in_progress' && !existingTicket.assignedTo
        ? session.user.id
        : normalizedAssignedToUserId;

    if (
      normalizedStatus === undefined &&
      effectiveAssignedToUserId === undefined &&
      normalizedHandoffNote === undefined
    ) {
      return mapSupportTicketRecordToSnapshot(existingTicket);
    }

    try {
      const nextAssignee =
        effectiveAssignedToUserId === undefined
          ? existingTicket.assignedTo
            ? {
                id: existingTicket.assignedTo.id,
                email: existingTicket.assignedTo.email,
                displayName: existingTicket.assignedTo.displayName,
              }
            : null
          : effectiveAssignedToUserId === null
            ? null
            : effectiveAssignedToUserId === existingTicket.assignedTo?.id
              ? {
                  id: existingTicket.assignedTo.id,
                  email: existingTicket.assignedTo.email,
                  displayName: existingTicket.assignedTo.displayName,
                }
              : effectiveAssignedToUserId === session.user.id
                ? {
                    id: session.user.id,
                    email: session.user.email,
                    displayName: session.user.displayName,
                  }
                : {
                    id: effectiveAssignedToUserId,
                    email: 'unknown@quizmind.dev',
                  };
      const auditLog = createSupportTicketWorkflowAuditLog({
        supportTicketId,
        ticketSubject: existingTicket.subject,
        actor: {
          id: session.user.id,
          email: session.user.email,
          displayName: session.user.displayName,
        },
        workspaceId: existingTicket.workspace?.id,
        previousStatus: existingTicket.status,
        nextStatus: normalizedStatus ?? existingTicket.status,
        previousAssignee: existingTicket.assignedTo
          ? {
              id: existingTicket.assignedTo.id,
              email: existingTicket.assignedTo.email,
              displayName: existingTicket.assignedTo.displayName,
            }
          : null,
        nextAssignee,
        previousHandoffNote: existingTicket.handoffNote ?? null,
        nextHandoffNote:
          normalizedHandoffNote === undefined ? (existingTicket.handoffNote ?? null) : normalizedHandoffNote,
      });
      const updatedTicket = await this.supportTicketRepository.updateWorkflow({
        supportTicketId,
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
        ...(effectiveAssignedToUserId !== undefined ? { assignedToUserId: effectiveAssignedToUserId } : {}),
        ...(normalizedHandoffNote !== undefined ? { handoffNote: normalizedHandoffNote } : {}),
        auditLog,
      });
      const timelineByTicketId = groupSupportTicketTimelineEntries(
        await this.supportTicketRepository.listTimelineEntries([updatedTicket.id]),
      );

      return mapSupportTicketRecordToSnapshot(updatedTicket, timelineByTicketId.get(updatedTicket.id));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException('Assigned support operator not found for support ticket ownership.');
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Support ticket not found.');
      }

      throw error;
    }
  }

  startSupportImpersonation(request?: Partial<SupportImpersonationRequest>) {
    return startSupportImpersonation({
      supportActorId: request?.supportActorId ?? getPersona('support-admin').user.id,
      targetUserId: request?.targetUserId ?? getPersona('workspace-viewer').user.id,
      workspaceId: request?.workspaceId ?? 'ws_alpha',
      reason: request?.reason ?? 'Investigating a workspace access issue in local foundation mode.',
      supportTicketId: request?.supportTicketId?.trim() || undefined,
      operatorNote: request?.operatorNote?.trim() || undefined,
    });
  }

  async startSupportImpersonationForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<SupportImpersonationRequest>,
  ) {
    const accessDecision = canStartSupportImpersonation(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const targetUserId = request?.targetUserId?.trim();

    if (!targetUserId) {
      throw new BadRequestException('Target user is required for support impersonation.');
    }

    const result = startSupportImpersonation({
      supportActorId: session.user.id,
      targetUserId,
      workspaceId: request?.workspaceId?.trim() || undefined,
      reason: request?.reason?.trim() || 'Investigating a workspace access issue in connected runtime mode.',
      supportTicketId: request?.supportTicketId?.trim() || undefined,
      operatorNote: request?.operatorNote?.trim() || undefined,
    });

    try {
      await this.supportImpersonationRepository.createSessionWithLogs({
        impersonationSessionId: result.result.impersonationSessionId,
        supportActorId: result.result.supportActorId,
        targetUserId: result.result.targetUserId,
        workspaceId: result.result.workspaceId,
        supportTicketId: request?.supportTicketId?.trim() || undefined,
        reason: result.result.reason,
        operatorNote: request?.operatorNote?.trim() || undefined,
        createdAt: new Date(result.result.createdAt),
        auditLog: result.auditLog,
        securityLog: result.securityLog,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException('Support actor, target user, workspace, or support ticket not found for impersonation.');
      }

      throw error;
    }

    return result;
  }

  endSupportImpersonation(request?: Partial<SupportImpersonationEndRequest>): SupportImpersonationEndResult {
    const supportPersona = getPersona('support-admin');
    const targetPersona = getPersona('workspace-viewer');
    const impersonationSessionId = request?.impersonationSessionId?.trim() || 'support-demo-session-1';
    const closeReason = request?.closeReason?.trim() || undefined;
    const createdAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const completion = buildSupportImpersonationEnd({
      impersonationSessionId,
      endedById: supportPersona.user.id,
      targetUserId: targetPersona.user.id,
      workspaceId: supportPersona.preferredWorkspaceId,
      reason: 'Investigating why a viewer lost access to workspace billing pages.',
      closeReason,
    });

    return {
      impersonationSessionId,
      targetUserId: targetPersona.user.id,
      workspaceId: supportPersona.preferredWorkspaceId,
      reason: 'Investigating why a viewer lost access to workspace billing pages.',
      createdAt,
      endedAt: completion.endedAt,
      ...(closeReason ? { closeReason } : {}),
    };
  }

  async endSupportImpersonationForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<SupportImpersonationEndRequest>,
  ): Promise<SupportImpersonationEndResult> {
    const accessDecision = canEndSupportImpersonation(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const impersonationSessionId = request?.impersonationSessionId?.trim();

    if (!impersonationSessionId) {
      throw new BadRequestException('Impersonation session is required to end support access.');
    }

    const existingSession = await this.supportImpersonationRepository.findById(impersonationSessionId);

    if (!existingSession) {
      throw new NotFoundException('Support impersonation session not found.');
    }

    if (existingSession.endedAt) {
      return mapSupportImpersonationRecordToEndResult(existingSession);
    }

    const closeReason = request?.closeReason?.trim() || undefined;

    const completion = buildSupportImpersonationEnd({
      impersonationSessionId: existingSession.id,
      endedById: session.user.id,
      targetUserId: existingSession.targetUser.id,
      workspaceId: existingSession.workspace?.id,
      reason: existingSession.reason,
      closeReason,
    });

    const endedSession = await this.supportImpersonationRepository.endSessionWithLogs({
      impersonationSessionId: existingSession.id,
      endedAt: new Date(completion.endedAt),
      closeReason,
      auditLog: completion.auditLog,
      securityLog: completion.securityLog,
    });

    if (!endedSession) {
      throw new NotFoundException('Support impersonation session not found.');
    }

    return mapSupportImpersonationRecordToEndResult(endedSession);
  }
}
