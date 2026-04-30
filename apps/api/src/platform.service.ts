import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { loadApiEnv, validateApiEnv } from '@quizmind/config';
import { createNoopEmailAdapter, sendTemplatedEmail, verifyEmailTemplate } from '@quizmind/email';
import { createLogEvent } from '@quizmind/logger';
import { createQueueDispatchRequest, listQueueDefinitions, type QueueDefinition } from '@quizmind/queue';
import { assertPasswordPolicy, hashPassword, type SessionPrincipal } from '@quizmind/auth';
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
  adminLogCategoryFilters,
  adminLogSourceFilters,
  adminLogStatusFilters,
  type AdminLogCategoryFilter,
  type AdminLogSourceFilter,
  type AdminLogCategoryCounts,
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
  type AdminUserCreateRequest,
  type AdminUserDirectorySnapshot,
  type AdminUserAccessUpdateRequest,
  type AdminUserMutationResult,
  type AdminBillingUsersPayload,
  type AdminWalletAdjustmentRequest,
  type AdminWalletAdjustmentResult,
  type UserBillingOverrideRequest,
  type UserBillingOverrideSnapshot,
  type AuthLoginRequest,
  type ExtensionBootstrapRequest,
  type FeatureFlagUpdateRequest,
  type FeatureFlagUpdateResult,
  type RemoteConfigActivateVersionRequest,
  type RemoteConfigActivateVersionResult,
  type RemoteConfigPublishRequest,
  type RemoteConfigPreviewRequest,
  type RemoteConfigSnapshot,
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
  type PlatformRetentionPolicySnapshot,
  type PlatformRetentionPolicyUpdateRequest,
  type PlatformAiPricingPolicySnapshot,
  type PlatformAiPricingPolicyUpdateRequest,
  type UiPreferences,
  type UserProfilePayload,
  type UserProfileUpdateRequest,
  type UsageExportRequest,
  type UsageExportResult,
  type UsageHistoryRequest,
  type UsageHistorySourceFilter,
  type UsageEventIngestResult,
  type UsageEventPayload,
  type WorkspaceUsageHistorySnapshot,
  type WorkspaceUsageSnapshot,
  type SystemRole,
  systemRoles,
} from '@quizmind/contracts';


import {
  canEndSupportImpersonation,
  canExportAuditLogs,
  canExportUsage,
  canReadAuditLogs,
  canReadExtensionInstallations,
  canWriteExtensionInstallations,
  canReadFeatureFlags,
  canReadJobs,
  canManageCompatibilityRules,
  canReadSupportImpersonationSessions,
  canReadSupportTickets,
  canReadUsage,
  canReadUsers,
  canUpdateUsers,
  canRetryJobs,
  canWriteFeatureFlags,
  canStartSupportImpersonation,
  canPublishRemoteConfig,
  listPrincipalPermissions,
} from './services/access-service';
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
  getFoundationOverview,
  getPersona,
  listFoundationSupportTickets,
  listFoundationUsers,
  matchPersonaFromLogin,
} from './platform-data';
import { UserRepository } from './auth/repositories/user.repository';
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
import { collectAdminAiRequestCandidateIds } from './logs/admin-log-ai-request-candidates';
import { AdminLogRepository } from './logs/admin-log.repository';
import { QueueDispatchService } from './queue/queue-dispatch.service';
import { RemoteConfigRepository } from './remote-config/remote-config.repository';
import { SupportImpersonationRepository } from './support/support-impersonation.repository';
import { SupportTicketPresetFavoriteRepository } from './support/support-ticket-preset-favorite.repository';
import { SupportTicketRepository } from './support/support-ticket.repository';
import { UsageRepository } from './usage/usage.repository';
import { WorkspaceRepository } from './workspaces/workspace.repository';
import { compareSemver, evaluateCompatibility } from '@quizmind/extension';
import { AiHistoryService } from './history/ai-history.service';
import { RetentionSettingsService } from './settings/retention-settings.service';
import { AiPricingSettingsService } from './settings/ai-pricing-settings.service';
import { WalletRepository } from './wallet/wallet.repository';
import { UserBillingOverrideRepository } from './ai/user-billing-override.repository';
import { PrismaService } from './database/prisma.service';

const validSupportTicketPresetKeys = new Set<string>(supportTicketQueuePresets);
const validAdminLogStreams = new Set<string>(adminLogStreamFilters);
const validAdminLogSeverityFilters = new Set<string>(adminLogSeverityFilters);
const validAdminLogCategoryFilters = new Set<string>(adminLogCategoryFilters);
const validAdminLogSourceFilters = new Set<string>(adminLogSourceFilters);
const validAdminLogStatusFilters = new Set<string>(adminLogStatusFilters);
const validAdminWebhookProviderFilters = new Set<string>(adminWebhookProviderFilters);
const validAdminWebhookStatusFilters = new Set<string>(adminWebhookStatusFilters);
const validAdminExtensionConnectionFilters = new Set<string>(adminExtensionConnectionFilters);
const validAdminExtensionCompatibilityFilters = new Set<string>(adminExtensionCompatibilityFilters);
const maxProfileDisplayNameLength = 120;
const maxProfileLocaleLength = 32;
const maxProfileTimezoneLength = 100;
const maxProfileAvatarUrlLength = 2048;

export function normalizeAdminAiEstimatedCostUsd(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}
const defaultUsageHistoryLimit = 25;
const maxUsageHistoryLimit = 200;
const validUsageHistorySources = new Set<UsageHistorySourceFilter>(['all', 'telemetry', 'activity', 'ai']);
const maxAdminUserDisplayNameLength = 120;
const maxAdminSuspendReasonLength = 500;
const adminUserEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validSystemRoles = new Set<SystemRole>(systemRoles);


function normalizeAdminEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('email is required.');
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    throw new BadRequestException('email is required.');
  }

  if (!adminUserEmailPattern.test(normalized)) {
    throw new BadRequestException('email must be a valid email address.');
  }

  return normalized;
}

function normalizeAdminPassword(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('password is required.');
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new BadRequestException('password is required.');
  }

  try {
    assertPasswordPolicy(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'password does not satisfy policy.';
    throw new BadRequestException(message);
  }

  return normalized;
}

function normalizeAdminDisplayName(
  value: unknown,
  fieldName: string,
  allowNull: boolean,
): string | null | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (value === null) {
    if (allowNull) {
      return null;
    }

    throw new BadRequestException(`${fieldName} must be a non-empty string.`);
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    if (allowNull) {
      return null;
    }

    return undefined;
  }

  if (normalized.length > maxAdminUserDisplayNameLength) {
    throw new BadRequestException(
      `${fieldName} must be at most ${maxAdminUserDisplayNameLength} characters.`,
    );
  }

  return normalized;
}

function normalizeAdminSuspendReason(value: unknown): string | null | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('suspendReason must be a string or null.');
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > maxAdminSuspendReasonLength) {
    throw new BadRequestException(
      `suspendReason must be at most ${maxAdminSuspendReasonLength} characters.`,
    );
  }

  return normalized;
}

function normalizeAdminSystemRoles(value: unknown, fieldName: string): SystemRole[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${fieldName} must be an array of system roles.`);
  }

  const roles: SystemRole[] = [];
  const seen = new Set<SystemRole>();

  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new BadRequestException(`${fieldName} must contain role ids.`);
    }

    const role = entry.trim() as SystemRole;

    if (!validSystemRoles.has(role)) {
      throw new BadRequestException(`${fieldName} contains unknown role "${entry}".`);
    }

    if (!seen.has(role)) {
      seen.add(role);
      roles.push(role);
    }
  }

  return roles;
}

function normalizeOptionalAdminSystemRoles(value: unknown, fieldName: string): SystemRole[] | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return normalizeAdminSystemRoles(value, fieldName);
}

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

const validThemes = new Set(['light', 'dark', 'system']);
const validLanguages = new Set(['en', 'ru', 'uz', 'kk', 'tr', 'es', 'pt-BR']);
const validDensities = new Set(['comfortable', 'compact']);

function normalizeUiPreferences(value: UiPreferences | null | undefined): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('uiPreferences must be an object or null.');
  }
  const result: UiPreferences = {};
  if ('theme' in value) {
    if (value.theme !== undefined && !validThemes.has(value.theme)) {
      throw new BadRequestException('uiPreferences.theme must be light, dark, or system.');
    }
    result.theme = value.theme;
  }
  if ('language' in value) {
    if (value.language !== undefined && !validLanguages.has(value.language)) {
      throw new BadRequestException('uiPreferences.language must be one of en, ru, uz, kk, tr, es, pt-BR.');
    }
    result.language = value.language;
  }
  if ('density' in value) {
    if (value.density !== undefined && !validDensities.has(value.density)) {
      throw new BadRequestException('uiPreferences.density must be comfortable or compact.');
    }
    result.density = value.density;
  }
  if ('reducedMotion' in value) {
    if (value.reducedMotion !== undefined && typeof value.reducedMotion !== 'boolean') {
      throw new BadRequestException('uiPreferences.reducedMotion must be a boolean.');
    }
    result.reducedMotion = value.reducedMotion;
  }
  if ('sidebarCollapsed' in value) {
    if (value.sidebarCollapsed !== undefined && typeof value.sidebarCollapsed !== 'boolean') {
      throw new BadRequestException('uiPreferences.sidebarCollapsed must be a boolean.');
    }
    result.sidebarCollapsed = value.sidebarCollapsed;
  }
  return result as Prisma.InputJsonValue;
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
    @Inject(AiHistoryService)
    private readonly aiHistoryService: AiHistoryService,
    @Inject(RetentionSettingsService)
    private readonly retentionSettingsService: RetentionSettingsService,
    @Inject(AiPricingSettingsService)
    private readonly aiPricingSettingsService: AiPricingSettingsService,
    @Inject(WalletRepository)
    private readonly walletRepository: WalletRepository,
    @Inject(UserBillingOverrideRepository)
    private readonly userBillingOverrideRepository: UserBillingOverrideRepository,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async listAdminBillingUsersForCurrentSession(
    session: CurrentSessionSnapshot,
    raw?: { search?: string; hasOverride?: string; feeExempt?: string; limit?: string; cursor?: string },
  ): Promise<AdminBillingUsersPayload> {
    this.requireSystemAdmin(session);
    const limit = Math.min(100, Math.max(1, Number(raw?.limit) || 25));
    const search = raw?.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(search ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, { displayName: { contains: search, mode: 'insensitive' } }] } : {}),
      ...(raw?.hasOverride === 'true' ? { billingOverride: { isNot: null } } : raw?.hasOverride === 'false' ? { billingOverride: { is: null } } : {}),
      ...(raw?.feeExempt === 'true' ? { billingOverride: { is: { aiPlatformFeeExempt: true } } } : {}),
    };
    const items = await this.prisma.user.findMany({ where, take: limit, orderBy: { createdAt: 'desc' }, include: { wallet: true, billingOverride: true } });
    return { items: items.map((u) => ({ userId: u.id, email: u.email, displayName: u.displayName ?? null, walletCurrency: u.wallet?.currency ?? 'RUB', balanceKopecks: u.wallet?.balanceKopecks ?? 0, aiPlatformFeeExempt: u.billingOverride?.aiPlatformFeeExempt ?? false, aiMarkupPercentOverride: u.billingOverride?.aiMarkupPercentOverride ?? null, billingOverrideReason: u.billingOverride?.reason ?? null, createdAt: u.createdAt.toISOString(), lastLoginAt: u.lastLoginAt?.toISOString() ?? null })) };
  }

  async createAdminWalletAdjustmentForCurrentSession(session: CurrentSessionSnapshot, request?: Partial<AdminWalletAdjustmentRequest>): Promise<AdminWalletAdjustmentResult> {
    this.requireSystemAdmin(session);
    if (!request || (request.direction !== 'credit' && request.direction !== 'debit')) throw new BadRequestException('direction must be credit or debit.');
    if (request.currency !== 'RUB') throw new BadRequestException('currency must be RUB.');
    if (!request.idempotencyKey?.trim()) throw new BadRequestException('idempotencyKey is required.');
    if (!Number.isInteger(request.amountKopecks) || request.amountKopecks <= 0) throw new BadRequestException('amountKopecks must be positive integer.');
    if (typeof request.reason === 'string' && request.reason.trim().length > 500) throw new BadRequestException('reason length must be at most 500.');
    let userIds: string[] = [];
    if (request.target?.type === 'selected_users') {
      userIds = request.target.userIds ?? [];
      if (userIds.length === 0) throw new BadRequestException('selected_users requires non-empty userIds.');
    } else if (request.target?.type === 'all_users') {
      if (request.target.confirmationText !== 'CREDIT ALL USERS') throw new BadRequestException('Invalid confirmationText.');
      const users = await this.prisma.user.findMany({ select: { id: true } });
      userIds = users.map((u) => u.id);
    } else throw new BadRequestException('target is required.');
    const result = await this.walletRepository.manualAdjustWallets({ actorId: session.user.id, targetType: request.target.type, userIds, direction: request.direction, amountKopecks: request.amountKopecks, currency: 'RUB', reason: request.reason, idempotencyKey: request.idempotencyKey, allowNegative: request.allowNegative });
    this.logAdminUserMutation('admin.wallet_adjustment_created', { actorUserId: session.user.id, targetType: request.target.type, affectedCount: result.affectedCount, batchId: result.batchId });
    return result;
  }

  private requireSystemAdmin(session: CurrentSessionSnapshot): void {
    if (!session.principal.systemRoles.includes('admin')) {
      throw new ForbiddenException('Admin access is required.');
    }
  }

  async getRetentionPolicyForCurrentSession(session: CurrentSessionSnapshot): Promise<PlatformRetentionPolicySnapshot> {
    this.requireSystemAdmin(session);
    return this.retentionSettingsService.getRetentionPolicy();
  }

  async updateRetentionPolicyForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<PlatformRetentionPolicyUpdateRequest>,
  ): Promise<PlatformRetentionPolicySnapshot> {
    this.requireSystemAdmin(session);
    return this.retentionSettingsService.updateRetentionPolicy(session, request);
  }

  async getAiPricingPolicyForCurrentSession(session: CurrentSessionSnapshot): Promise<PlatformAiPricingPolicySnapshot> {
    this.requireSystemAdmin(session);
    return this.aiPricingSettingsService.getPricingPolicy();
  }

  async updateAiPricingPolicyForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<PlatformAiPricingPolicyUpdateRequest>,
  ): Promise<PlatformAiPricingPolicySnapshot> {
    this.requireSystemAdmin(session);
    return this.aiPricingSettingsService.updatePricingPolicy(session, request);
  }

  async getHealth() {
    const [postgresHealth, postgresSchemaHealth, redisHealth] = await Promise.all([
      this.infrastructureHealthService.checkDatabaseConnection(this.env.runtimeMode),
      this.infrastructureHealthService.checkDatabaseSchema(this.env.runtimeMode),
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
        trustProxyHops: this.env.trustProxyHops,
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
          service: 'postgres_schema',
          status: postgresSchemaHealth.status,
          url: this.env.databaseUrl,
          latencyMs: postgresSchemaHealth.latencyMs,
          error: postgresSchemaHealth.error,
        },
        {
          service: 'queues',
          status: this.env.runtimeMode === 'connected' ? 'ready_for_workers' : 'dry_run',
          queues: await this.queueDispatchService.listQueueDefinitions(),
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
      permissions: listPrincipalPermissions(persona.principal),
    };
  }

  listWorkspaces(personaKey?: string) {
    const persona = getPersona(personaKey);

    return {
      personaKey: persona.key,
      items: [],
    };
  }

  private logAdminUserMutation(eventType: string, metadata: Record<string, unknown>): void {
    console.info(
      JSON.stringify({
        eventType,
        occurredAt: new Date().toISOString(),
        ...metadata,
      }),
    );
  }

  private buildFoundationRemoteConfigVersions(
    activeLayers: RemoteConfigSnapshot['activeLayers'],
  ): RemoteConfigSnapshot['versions'] {
    const actor = getPersona('platform-admin');

    return [
      {
        id: 'foundation-global-active',
        versionLabel: 'foundation-default',
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
        id: 'foundation-global-previous',
        versionLabel: 'foundation-previous',
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

    return this.buildFoundationRemoteConfigVersions(activeLayers).find((version) => version.id === versionId) ?? null;
  }

  async listWorkspacesForCurrentSession(session: CurrentSessionSnapshot) {
    const items = await this.workspaceRepository.findByUserId(session.user.id);

    return {
      personaKey: 'connected-user',
      items: items.map((workspace) => ({
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        role: 'workspace_owner' as const,
      })),
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

    if ('uiPreferences' in request) {
      updateData.uiPreferences = normalizeUiPreferences(request.uiPreferences ?? null);
      mutationCount += 1;
    }

    if (mutationCount === 0) {
      throw new BadRequestException(
        'At least one profile field must be provided: displayName, avatarUrl, locale, timezone, uiPreferences.',
      );
    }

    const updated = await this.userRepository.update(session.user.id, updateData);

    return mapUserRecordToProfile(updated);
  }

  getUsage(personaKey?: string): WorkspaceUsageSnapshot {
    const persona = getPersona(personaKey);
    const accessDecision = canReadUsage(persona.principal as SessionPrincipal);
    const exportDecision = canExportUsage(persona.principal as SessionPrincipal);
    const currentPeriodStart = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const currentPeriodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const quotas = buildUsageQuotas({
      seatCount: 2,
      currentPeriodStart,
      currentPeriodEnd,
      counters: [
        {
          key: 'limit.requests_per_day',
          consumed: 312,
          periodStart: new Date(Date.now() - 10 * 60 * 60 * 1000),
          periodEnd: new Date(Date.now() + 14 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
      ],
    });
    const installations = mapUsageInstallations([
      {
        installationId: 'inst_foundation_chrome',
        browser: 'chrome',
        extensionVersion: '1.7.0',
        schemaVersion: '2',
        capabilitiesJson: ['quiz-capture', 'history-sync', 'remote-sync'],
        lastSeenAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    ]);
    const recentEvents = buildRecentUsageEvents({
      telemetry: [
        {
          id: 'demo:telemetry:1',
          eventType: 'extension.quiz_answer_requested',
          severity: 'info',
          payloadJson: {
            questionType: 'multiple_choice',
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
          id: 'demo:activity:1',
          actorId: persona.user.id,
          eventType: 'usage.dashboard_opened',
          metadataJson: {
            route: '/app/usage',
          },
          createdAt: new Date(Date.now() - 30 * 60 * 1000),
        },
      ],
      aiRequests: [],
    });

    return {
      accessDecision,
      exportDecision,
      currentPeriodStart: currentPeriodStart.toISOString(),
      currentPeriodEnd: currentPeriodEnd.toISOString(),
      quotas,
      installations,
      recentEvents,
    };
  }

  async getUsageForCurrentSession(
    session: CurrentSessionSnapshot,
  ): Promise<WorkspaceUsageSnapshot> {
    const accessDecision = canReadUsage(session.principal as SessionPrincipal);
    const exportDecision = canExportUsage(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const userId = session.user.id;
    const [installations, telemetry, activity, aiRequests] = await Promise.all([
      this.usageRepository.listInstallationsByUserId(userId),
      this.usageRepository.listRecentTelemetryByUserId(userId),
      this.usageRepository.listRecentActivityByUserId(userId),
      this.usageRepository.listRecentAiRequestsByUserId(userId),
    ]);

    return {
      accessDecision,
      exportDecision,
      quotas: [],
      installations: mapUsageInstallations(installations),
      recentEvents: buildRecentUsageEvents({
        telemetry,
        activity,
        aiRequests,
      }),
    };
  }

  listUsageHistory(
    personaKey?: string,
    request?: Partial<UsageHistoryRequest>,
  ): WorkspaceUsageHistorySnapshot {
    const persona = getPersona(personaKey);
    const accessDecision = canReadUsage(persona.principal as SessionPrincipal);
    const exportDecision = canExportUsage(persona.principal as SessionPrincipal);
    const summary = this.getUsage(personaKey);
    const filters = this.normalizeUsageHistoryFilters({
      source: request?.source,
      eventType: request?.eventType,
      installationId: request?.installationId,
      actorId: request?.actorId,
      limit: request?.limit,
    });

    return {
      accessDecision,
      exportDecision,
      filters,
      items: this.filterUsageHistoryItems(summary.recentEvents, filters),
      permissions: listPrincipalPermissions(persona.principal),
    };
  }

  async listUsageHistoryForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<UsageHistoryRequest>,
  ): Promise<WorkspaceUsageHistorySnapshot> {
    const accessDecision = canReadUsage(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const exportDecision = canExportUsage(session.principal as SessionPrincipal);
    const userId = session.user.id;

    const filters = this.normalizeUsageHistoryFilters({
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
        : this.usageRepository.listTelemetryHistoryByUserId({
            userId,
            limit: fetchLimit,
            ...(filters.eventType ? { eventType: filters.eventType } : {}),
            ...(filters.installationId ? { installationId: filters.installationId } : {}),
          });
    const activityPromise =
      filters.source === 'telemetry' || filters.source === 'ai'
        ? Promise.resolve([])
        : this.usageRepository.listActivityHistoryByUserId({
            userId,
            limit: fetchLimit,
            ...(filters.eventType ? { eventType: filters.eventType } : {}),
            ...(filters.actorId ? { actorId: filters.actorId } : {}),
          });
    const aiRequestsPromise =
      filters.source === 'telemetry' || filters.source === 'activity'
        ? Promise.resolve([])
        : this.usageRepository.listAiRequestHistoryByUserId({
            userId,
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
      accessDecision,
      exportDecision,
      filters,
      items: this.filterUsageHistoryItems(items, filters),
      permissions: listPrincipalPermissions(session.principal),
    };
  }

  private normalizeUsageHistoryFilters(input: {
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

  exportUsage(personaKey?: string, request?: Partial<UsageExportRequest>): UsageExportResult {
    const summary = this.getUsage(personaKey);

    return this.buildUsageExportResult(summary, request);
  }

  async exportUsageForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<UsageExportRequest>,
  ): Promise<UsageExportResult> {
    const accessDecision = canExportUsage(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const exportResult = this.buildUsageExportResult(
      await this.getUsageForCurrentSession(session),
      request,
    );
    const queuePayload: AuditExportJobPayload = {
      exportType: 'usage',
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
    const accessDecision = canExportAuditLogs(persona.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    return this.buildAdminLogExportResult(snapshot, request);
  }

  async exportAdminLogsForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<AdminLogExportRequest>,
  ): Promise<AdminLogExportResult> {
    const accessDecision = canExportAuditLogs(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const exportResult = this.buildAdminLogExportResult(
      await this.listAdminLogsForCurrentSession(session, request),
      request,
    );
    const queuePayload: AuditExportJobPayload = {
      exportType: 'admin_logs',
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
    const normalizedFilters = this.normalizeAdminExtensionFleetFilters(filters);
    const accessDecision = canReadExtensionInstallations(persona.principal);
    const manageDecision = canWriteExtensionInstallations(persona.principal);
    const baseItems = accessDecision.allowed
      ? this.buildFoundationAdminExtensionFleetItems(persona.key)
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
      manageDecision,
      filters: normalizedFilters,
      items: filtered.items,
      counts: filtered.counts,
      ...(normalizedFilters.installationId ? { selectedInstallationId: normalizedFilters.installationId } : {}),
      ...(selectedInstallation ? { selectedInstallation } : {}),
      permissions: listPrincipalPermissions(persona.principal),
    };
  }

  async listAdminExtensionFleetForCurrentSession(
    session: CurrentSessionSnapshot,
    filters?: Partial<AdminExtensionFleetFilters>,
  ): Promise<AdminExtensionFleetSnapshot> {
    const accessDecision = canReadExtensionInstallations(session.principal as SessionPrincipal);
    const manageDecision = canWriteExtensionInstallations(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const normalizedFilters = this.normalizeAdminExtensionFleetFilters(filters);

    const [installations, compatibilityRule] = await Promise.all([
      this.extensionInstallationRepository.listAll(),
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
      this.mapAdminExtensionFleetItem(installation, compatibilityPolicy, sessionStats),
    );
    const filtered = this.filterAdminExtensionFleetItems(allItems, normalizedFilters);
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
      manageDecision,
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
      queues: this.buildAdminQueueSummariesFromDefinitions(listQueueDefinitions()),
      permissions: listPrincipalPermissions(persona.principal),
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
      queues: await this.buildAdminQueueSummaries(),
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
    const normalizedFilters = this.normalizeAdminLogFilters(filters);
    const accessDecision = canReadAuditLogs(persona.principal);
    const exportDecision = canExportAuditLogs(persona.principal);
    const permissions = listPrincipalPermissions(persona.principal);
    const baseItems = accessDecision.allowed ? this.buildFoundationAdminLogEntries() : [];
    const filtered = this.filterAdminLogEntries(baseItems, normalizedFilters);

    return {
      personaKey: persona.key,
      accessDecision,
      exportDecision,
      filters: normalizedFilters,
      items: filtered.items,
      streamCounts: filtered.streamCounts,
      categoryCounts: filtered.categoryCounts,
      total: filtered.total,
      hasNext: filtered.hasNext,
      permissions,
    };
  }

  async listAdminLogsForCurrentSession(
    session: CurrentSessionSnapshot,
    filters?: Partial<AdminLogFilters>,
  ): Promise<AdminLogsSnapshot> {
    const normalizedFilters = this.normalizeAdminLogFilters(filters);
    const accessDecision = canReadAuditLogs(session.principal as SessionPrincipal);
    const exportDecision = canExportAuditLogs(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const records = await this.adminLogRepository.listPage({
      stream: normalizedFilters.stream,
      severity: normalizedFilters.severity,
      search: normalizedFilters.search,
      ...(normalizedFilters.category && normalizedFilters.category !== 'all' ? { category: normalizedFilters.category } : {}),
      ...(normalizedFilters.source && normalizedFilters.source !== 'all' ? { source: normalizedFilters.source } : {}),
      ...(normalizedFilters.status && normalizedFilters.status !== 'all' ? { status: normalizedFilters.status } : {}),
      eventType: normalizedFilters.eventType,
      from: normalizedFilters.from,
      to: normalizedFilters.to,
      limit: normalizedFilters.limit,
      cursor: normalizedFilters.cursor,
    });
    const items = records.items.map((item) => this.mapConnectedAdminLogListItem(item));
    const streamCounts = {
      audit: items.filter((item) => item.stream === 'audit').length,
      activity: items.filter((item) => item.stream === 'activity').length,
      security: items.filter((item) => item.stream === 'security').length,
      domain: items.filter((item) => item.stream === 'domain').length,
    };
    const categoryCounts = {
      auth: items.filter((item) => item.category === 'auth').length,
      extension: items.filter((item) => item.category === 'extension').length,
      ai: items.filter((item) => item.category === 'ai').length,
      admin: items.filter((item) => item.category === 'admin').length,
      system: items.filter((item) => item.category === 'system').length,
    };

    return {
      personaKey: 'connected-user',
      accessDecision,
      exportDecision,
      filters: normalizedFilters,
      items,
      streamCounts,
      categoryCounts,
      hasNext: records.hasNext,
      nextCursor: records.nextCursor,
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

  async getAdminLogEntryForCurrentSession(
    session: CurrentSessionSnapshot,
    id: string,
  ): Promise<AdminLogEntry> {
    const accessDecision = canReadAuditLogs(session.principal as SessionPrincipal);
    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const result = await this.adminLogRepository.findOne(id);
    if (!result) {
      throw new NotFoundException('Log entry not found.');
    }

    const technicalMetadata = {
      ...(result.metadata ?? {}),
      sourceRecordId: result.item.sourceRecordId,
      targetType: result.item.targetType,
      targetId: result.item.targetId,
    };
    const mapped = this.mapConnectedAdminLogListItem(result.item, technicalMetadata);
    const candidates = this.resolveAdminAiRequestCandidateIds(result.item, technicalMetadata);
    if (candidates.length === 0) return mapped;
    const aiDetail = await this.aiHistoryService.getDetailForAdminByAnyId(candidates);
    if (!aiDetail) return mapped;

    return {
      ...mapped,
      aiRequest: {
        id: aiDetail.id,
        provider: aiDetail.provider,
        model: aiDetail.model,
        status: aiDetail.status,
        requestType: aiDetail.requestType,
        estimatedCostUsd: normalizeAdminAiEstimatedCostUsd(aiDetail.estimatedCostUsd),
        durationMs: aiDetail.durationMs,
        promptTokens: aiDetail.promptTokens,
        completionTokens: aiDetail.completionTokens,
        totalTokens: aiDetail.totalTokens,
        promptExcerpt: aiDetail.promptExcerpt,
        responseExcerpt: aiDetail.responseExcerpt,
        promptContentJson: aiDetail.promptContentJson,
        responseContentJson: aiDetail.responseContentJson,
        contentAvailability: this.resolveAiContentAvailability(aiDetail.promptContentJson, aiDetail.responseContentJson),
        contentMessage: this.resolveAiContentMessage(aiDetail.promptContentJson, aiDetail.responseContentJson),
        attachments: aiDetail.attachments,
      },
    };
  }

  async getAdminLogAttachmentForCurrentSession(
    session: CurrentSessionSnapshot,
    id: string,
    attachmentId: string,
  ): Promise<{ bytes: Buffer; mimeType: string; originalName: string; expired: boolean } | null> {
    const accessDecision = canReadAuditLogs(session.principal as SessionPrincipal);
    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }
    const result = await this.adminLogRepository.findOne(id);
    if (!result) throw new NotFoundException('Log entry not found.');
    const candidates = this.resolveAdminAiRequestCandidateIds(result.item, result.metadata);
    if (candidates.length === 0) return null;
    const aiDetail = await this.aiHistoryService.getDetailForAdminByAnyId(candidates);
    if (!aiDetail?.id) return null;
    return this.aiHistoryService.getAttachmentForAdmin({
      aiRequestEventId: aiDetail.id,
      attachmentId,
    });
  }

  listFeatureFlags(personaKey?: string) {
    const persona = getPersona(personaKey);
    const foundation = getFoundationOverview();

    return {
      personaKey: persona.key,
      flags: foundation.featureFlags,
      writeDecision: canWriteFeatureFlags(persona.principal),
      permissions: listPrincipalPermissions(persona.principal),
    };
  }

  listUsers(personaKey?: string): AdminUserDirectorySnapshot {
    const persona = getPersona(personaKey);
    const accessDecision = canReadUsers(persona.principal);
    const writeDecision = canUpdateUsers(persona.principal);

    return {
      personaKey: persona.key,
      accessDecision,
      writeDecision,
      items: accessDecision.allowed ? listFoundationUsers() : [],
      permissions: listPrincipalPermissions(persona.principal),
    };
  }

  async listUsersForCurrentSession(
    session: CurrentSessionSnapshot,
    rawFilters?: {
      query?: string;
      role?: string;
      banned?: string;
      verified?: string;
      sort?: string;
      page?: string;
      cursor?: string;
      limit?: string;
    },
  ): Promise<AdminUserDirectorySnapshot> {
    const accessDecision = canReadUsers(session.principal as SessionPrincipal);
    const writeDecision = canUpdateUsers(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const page =
      typeof rawFilters?.page === 'string' && rawFilters.page.trim()
        ? Math.max(1, Number(rawFilters.page) || 1)
        : undefined;
    const cursor = typeof rawFilters?.cursor === 'string' && rawFilters.cursor.trim()
      ? rawFilters.cursor.trim()
      : undefined;
    const limit = Math.min(100, Math.max(1, Number(rawFilters?.limit) || 25));
    const roleFilter =
      rawFilters?.role === 'admin' ? 'admin' : rawFilters?.role === 'user' ? 'user' : undefined;
    const bannedFilter =
      rawFilters?.banned === 'banned' ? true : rawFilters?.banned === 'not-banned' ? false : undefined;
    const verifiedFilter =
      rawFilters?.verified === 'verified' ? true : rawFilters?.verified === 'unverified' ? false : undefined;
    const validSorts = ['created-desc', 'created-asc', 'login-desc', 'email-asc'] as const;
    type SortKey = typeof validSorts[number];
    const sortFilter: SortKey = (validSorts as readonly string[]).includes(rawFilters?.sort ?? '')
      ? (rawFilters!.sort as SortKey)
      : 'created-desc';

    const { items, total, hasNext, nextCursor } = await this.userRepository.listWithFilters({
      query: rawFilters?.query,
      role: roleFilter,
      banned: bannedFilter,
      verified: verifiedFilter,
      sort: sortFilter,
      ...(typeof page === 'number' ? { page } : {}),
      cursor,
      limit,
    });

    return {
      personaKey: 'connected-user',
      accessDecision,
      writeDecision,
      items: items.map(mapUserRecordToDirectoryEntry),
      ...(typeof total === 'number' ? { total, ...(typeof page === 'number' ? { page } : {}) } : {}),
      hasNext,
      nextCursor,
      limit,
      permissions: session.permissions,
    };
  }

  async deleteUserForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: { userId?: string },
  ): Promise<{ userId: string }> {
    const writeDecision = canUpdateUsers(session.principal as SessionPrincipal);

    if (!writeDecision.allowed) {
      throw new ForbiddenException(writeDecision.reasons.join('; '));
    }

    const userId = typeof request?.userId === 'string' ? request.userId.trim() : '';

    if (!userId) {
      throw new BadRequestException('userId is required.');
    }

    if (userId === session.user.id) {
      throw new BadRequestException('Cannot delete your own account.');
    }

    const existingUser = await this.userRepository.findById(userId);

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    if (existingUser.systemRoleAssignments.length > 0) {
      const adminCount = await this.userRepository.countAdmins();
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the last remaining admin account.');
      }
    }

    await this.userRepository.delete(userId);

    this.logAdminUserMutation('admin.user_deleted', {
      actorUserId: session.user.id,
      targetUserId: userId,
      email: existingUser.email,
    });

    return { userId };
  }

  async createUserForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<AdminUserCreateRequest>,
  ): Promise<AdminUserMutationResult> {
    const writeDecision = canUpdateUsers(session.principal as SessionPrincipal);

    if (!writeDecision.allowed) {
      throw new ForbiddenException(writeDecision.reasons.join('; '));
    }

    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw new BadRequestException('Request body is required.');
    }

    const email = normalizeAdminEmail(request.email);
    const password = normalizeAdminPassword(request.password);
    const displayName = normalizeAdminDisplayName(request.displayName, 'displayName', false);
    const systemRoles = normalizeOptionalAdminSystemRoles(request.systemRoles, 'systemRoles') ?? [];
    const passwordHash = await hashPassword(password);
    const emailVerifiedAt = request.emailVerified === true ? new Date() : undefined;

    try {
      const createdUser = await this.userRepository.create({
        email,
        passwordHash,
        ...(displayName ? { displayName } : {}),
        ...(emailVerifiedAt ? { emailVerifiedAt } : {}),
        ...(systemRoles.length > 0
          ? {
              systemRoleAssignments: {
                create: [{ role: 'admin' }],
              },
            }
          : {}),
      });

      this.logAdminUserMutation('admin.user_created', {
        actorUserId: session.user.id,
        targetUserId: createdUser.id,
        email: createdUser.email,
        isAdmin: createdUser.systemRoleAssignments.length > 0,
      });

      return {
        user: mapUserRecordToDirectoryEntry(createdUser),
        updatedAt: createdUser.updatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('A user with this email already exists.');
      }

      throw error;
    }
  }

  async updateUserAccessForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<AdminUserAccessUpdateRequest>,
  ): Promise<AdminUserMutationResult> {
    const writeDecision = canUpdateUsers(session.principal as SessionPrincipal);

    if (!writeDecision.allowed) {
      throw new ForbiddenException(writeDecision.reasons.join('; '));
    }

    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw new BadRequestException('Request body is required.');
    }

    const userId = typeof request.userId === 'string' ? request.userId.trim() : '';

    if (!userId) {
      throw new BadRequestException('userId is required.');
    }

    const existingUser = await this.userRepository.findById(userId);

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    const displayName = normalizeAdminDisplayName(request.displayName, 'displayName', true);
    const systemRoles = normalizeOptionalAdminSystemRoles(request.systemRoles, 'systemRoles');
    const suspendReason = normalizeAdminSuspendReason(request.suspendReason);

    if (typeof request.suspend === 'undefined' && typeof suspendReason !== 'undefined') {
      throw new BadRequestException('suspendReason can only be set when suspend is provided.');
    }

    const updateData: Prisma.UserUpdateInput = {};
    let mutationCount = 0;

    if (typeof displayName !== 'undefined') {
      updateData.displayName = displayName;
      mutationCount += 1;
    }

    if (systemRoles) {
      const isDemotion = systemRoles.length === 0 && existingUser.systemRoleAssignments.length > 0;
      if (isDemotion) {
        const adminCount = await this.userRepository.countAdmins();
        if (adminCount <= 1) {
          throw new BadRequestException('Cannot remove admin access from the last remaining admin.');
        }
      }
      updateData.systemRoleAssignments = {
        deleteMany: {},
        ...(systemRoles.length > 0
          ? { create: [{ role: 'admin' }] }
          : {}),
      };
      mutationCount += 1;
    }

    if (typeof request.suspend === 'boolean') {
      if (request.suspend) {
        updateData.suspendedAt = new Date();
        updateData.suspendReason = suspendReason ?? 'Suspended by admin action.';
      } else {
        updateData.suspendedAt = null;
        updateData.suspendReason = null;
      }

      mutationCount += 1;
    }

    if (mutationCount === 0) {
      throw new BadRequestException(
        'Provide at least one mutable field: displayName, systemRoles, suspend.',
      );
    }

    try {
      const updatedUser = await this.userRepository.update(userId, updateData);

      this.logAdminUserMutation('admin.user_access_updated', {
        actorUserId: session.user.id,
        targetUserId: updatedUser.id,
        email: updatedUser.email,
        suspendedAt: updatedUser.suspendedAt?.toISOString() ?? null,
        suspendReason: updatedUser.suspendReason ?? null,
        isAdmin: updatedUser.systemRoleAssignments.length > 0,
      });

      return {
        user: mapUserRecordToDirectoryEntry(updatedUser),
        updatedAt: updatedUser.updatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('User not found.');
      }

      throw error;
    }
  }

  async updateUserBillingOverrideForCurrentSession(
    session: CurrentSessionSnapshot,
    userId: string,
    request?: Partial<UserBillingOverrideRequest>,
  ): Promise<UserBillingOverrideSnapshot> {
    this.requireSystemAdmin(session);
    if (!userId?.trim()) throw new BadRequestException('userId is required.');
    if (typeof request?.reason === 'string' && request.reason.trim().length > 500) throw new BadRequestException('reason length must be at most 500.');
    const row = await this.userBillingOverrideRepository.updateOverride(userId, request as UserBillingOverrideRequest, session.user.id);
    this.logAdminUserMutation('admin.user_billing_override_updated', { actorUserId: session.user.id, targetUserId: userId });
    return { userId: row.userId, aiPlatformFeeExempt: row.aiPlatformFeeExempt, aiMarkupPercentOverride: row.aiMarkupPercentOverride, reason: row.reason ?? null, updatedAt: row.updatedAt.toISOString() };
  }

  async deleteUserBillingOverrideForCurrentSession(session: CurrentSessionSnapshot, userId: string): Promise<{ success: true }> {
    this.requireSystemAdmin(session);
    if (!userId?.trim()) throw new BadRequestException('userId is required.');
    await this.userBillingOverrideRepository.deleteOverride(userId, session.user.id);
    this.logAdminUserMutation('admin.user_billing_override_deleted', { actorUserId: session.user.id, targetUserId: userId });
    return { success: true };
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
      writeDecision: canWriteFeatureFlags(session.principal as SessionPrincipal),
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
      permissions: listPrincipalPermissions(persona.principal),
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
        allowUsers: normalized.allowUsers,
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

  listRemoteConfig(personaKey?: string): RemoteConfigSnapshot {
    const persona = getPersona(personaKey);
    const previewContext: RemoteConfigPreviewRequest['context'] = {
      environment: 'development',
      userId: persona.user.id,
      activeFlags: persona.principal.featureFlags,
    };
    const activeLayers = getFoundationOverview().remoteConfigLayers;

    return {
      personaKey: persona.key,
      publishDecision: canPublishRemoteConfig(persona.principal),
      activeLayers,
      versions: this.buildFoundationRemoteConfigVersions(activeLayers),
      previewContext,
      preview: previewRemoteConfig({
        layers: activeLayers,
        context: previewContext,
      }),
      permissions: listPrincipalPermissions(persona.principal),
    };
  }

  async listRemoteConfigForCurrentSession(
    session: CurrentSessionSnapshot,
  ): Promise<RemoteConfigSnapshot> {
    const accessDecision = canPublishRemoteConfig(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const [activeLayerRecords, recentVersions] = await Promise.all([
      this.remoteConfigRepository.findActiveLayers(),
      this.remoteConfigRepository.findRecentVersions(),
    ]);
    const activeLayers = activeLayerRecords.map(mapRemoteConfigLayerRecordToDefinition);
    const previewContext: RemoteConfigPreviewRequest['context'] = {
      environment: 'development',
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
    };
    const previewRequest: RemoteConfigPreviewRequest = {
      layers: publishRequest.layers,
      context: {
        environment: 'development',
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
    };

    const persistedVersion = await this.remoteConfigRepository.publishVersion({
      actorId: publishRequest.actorId,
      layers: publishRequest.layers,
      versionLabel: publishRequest.versionLabel,
    });
    const previewRequest: RemoteConfigPreviewRequest = {
      layers: publishRequest.layers,
      context: {
        environment: 'development',
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
      environment: request?.environment ?? 'development',
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
    const [compatibilityRule, featureFlags, remoteConfigLayers] = await Promise.all([
      this.extensionCompatibilityRepository.findLatest(),
      this.featureFlagRepository.findAll(),
      this.remoteConfigRepository.findActiveLayers(),
    ]);

    return resolveExtensionBootstrap(
      request,
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
      ...(normalized.allowUsers.length > 0 ? { allowUsers: normalized.allowUsers } : {}),
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
  ): AdminExtensionFleetFilters {
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
      compatibility,
      connection,
      ...(installationId ? { installationId } : {}),
      ...(search ? { search } : {}),
      limit,
    };
  }

  private buildFoundationAdminExtensionFleetItems(
    personaKey: string | undefined,
  ): AdminExtensionFleetItem[] {
    const persona = getPersona(personaKey);
    const usageSummary = this.getUsage(persona.key);
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

  private async buildAdminQueueSummaries(): Promise<AdminQueueSummary[]> {
    const queueDefinitions = await this.queueDispatchService.listQueueDefinitions();
    return this.buildAdminQueueSummariesFromDefinitions(queueDefinitions);
  }

  private buildAdminQueueSummariesFromDefinitions(queueDefinitions: QueueDefinition[]): AdminQueueSummary[] {
    return queueDefinitions.map((definition) => ({
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
        provider: 'yookassa',
        externalEventId: 'evt_foundation_failed',
        eventType: 'payment.canceled',
        status: 'failed',
        queue: 'billing-webhooks',
        retryable: true,
        receivedAt: '2026-03-24T12:00:00.000Z',
        providerCreatedAt: '2026-03-24T11:59:20.000Z',
        processedAt: null,
        lastError: 'Wallet context could not be resolved for the incoming payment.',
      },
      {
        id: 'webhook_foundation_processed',
        provider: 'yookassa',
        externalEventId: 'evt_foundation_processed',
        eventType: 'payment.succeeded',
        status: 'processed',
        queue: 'billing-webhooks',
        retryable: false,
        receivedAt: '2026-03-24T11:25:00.000Z',
        providerCreatedAt: '2026-03-24T11:24:44.000Z',
        processedAt: '2026-03-24T11:25:04.000Z',
      },
      {
        id: 'webhook_foundation_received',
        provider: 'yookassa',
        externalEventId: 'evt_foundation_received',
        eventType: 'payment.waiting_for_capture',
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

  private normalizeAdminLogFilters(filters?: Partial<AdminLogFilters>): AdminLogFilters {
    const stream =
      typeof filters?.stream === 'string' && validAdminLogStreams.has(filters.stream) ? filters.stream : 'all';
    const severity =
      typeof filters?.severity === 'string' && validAdminLogSeverityFilters.has(filters.severity)
        ? filters.severity
        : 'all';
    const search = filters?.search?.trim() || undefined;
    const limit =
      typeof filters?.limit === 'number' && Number.isFinite(filters.limit)
        ? Math.min(Math.max(Math.trunc(filters.limit), 1), 100)
        : 25;
    const category =
      typeof filters?.category === 'string' && validAdminLogCategoryFilters.has(filters.category) && filters.category !== 'all'
        ? (filters.category as Exclude<AdminLogCategoryFilter, 'all'>)
        : undefined;
    const source =
      typeof filters?.source === 'string' && validAdminLogSourceFilters.has(filters.source) && filters.source !== 'all'
        ? (filters.source as Exclude<AdminLogSourceFilter, 'all'>)
        : undefined;
    const status =
      typeof filters?.status === 'string' && validAdminLogStatusFilters.has(filters.status) && filters.status !== 'all'
        ? (filters.status as Exclude<AdminLogFilters['status'], 'all' | undefined>)
        : undefined;
    const eventType = filters?.eventType?.trim() || undefined;
    const from = filters?.from?.trim() || undefined;
    const to = filters?.to?.trim() || undefined;
    const page =
      typeof filters?.page === 'number' && Number.isFinite(filters.page)
        ? Math.max(Math.trunc(filters.page), 1)
        : 1;
    const cursor = filters?.cursor?.trim() || undefined;

    return {
      stream,
      severity,
      ...(search ? { search } : {}),
      limit,
      ...(category ? { category } : {}),
      ...(source ? { source } : {}),
      ...(status ? { status } : {}),
      ...(eventType ? { eventType } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      page,
      ...(cursor ? { cursor } : {}),
    };
  }

  private buildFoundationAdminLogEntries(): AdminLogEntry[] {
    const platformAdmin = getPersona('platform-admin');
    const supportAdmin = getPersona('support-admin');
    const workspaceViewer = getPersona('workspace-viewer');

    return [
      {
        id: 'audit:platform:provider-policy',
        stream: 'audit',
        eventType: 'ai_provider_policy.updated',
        summary: 'Updated the AI provider policy and narrowed the allowed provider set for the selected scope.',
        occurredAt: '2026-03-24T13:40:00.000Z',
        severity: 'info',
        status: 'success',
        category: 'admin' as const,
        source: 'web' as const,
        actor: {
          id: platformAdmin.user.id,
          email: platformAdmin.user.email,
          displayName: platformAdmin.user.displayName,
        },
        targetType: 'ai_provider_policy',
        targetId: 'global',
        metadata: {
          mode: 'platform_only',
          providers: ['openrouter', 'openai'],
        },
      },
      {
        id: 'activity:platform:usage-dashboard',
        stream: 'activity',
        eventType: 'usage.dashboard_opened',
        summary: 'Opened the usage explorer and reviewed the latest quota counters.',
        occurredAt: '2026-03-24T13:28:00.000Z',
        category: 'admin' as const,
        source: 'web' as const,
        actor: {
          id: platformAdmin.user.id,
          email: platformAdmin.user.email,
          displayName: platformAdmin.user.displayName,
        },
        metadata: {
          route: '/app/usage',
          source: 'dashboard',
        },
      },
      {
        id: 'security:platform:auth-login-failed',
        stream: 'security',
        eventType: 'auth.login_failed',
        summary: 'Blocked a sign-in attempt after the submitted password did not match the stored account credentials.',
        occurredAt: '2026-03-24T12:58:00.000Z',
        severity: 'warn',
        status: 'failure',
        category: 'auth' as const,
        actor: {
          id: workspaceViewer.user.id,
          email: workspaceViewer.user.email,
          displayName: workspaceViewer.user.displayName,
        },
        targetType: 'auth_session',
        targetId: workspaceViewer.user.id,
        metadata: {
          reason: 'invalid_password',
        },
      },
      {
        id: 'audit:platform:support-ticket',
        stream: 'audit',
        eventType: 'support.ticket_workflow_updated',
        summary: 'Assigned the support ticket, moved it into progress, and attached a handoff note for the next operator.',
        occurredAt: '2026-03-24T12:12:00.000Z',
        severity: 'info',
        status: 'success',
        category: 'admin' as const,
        source: 'web' as const,
        actor: {
          id: supportAdmin.user.id,
          email: supportAdmin.user.email,
          displayName: supportAdmin.user.displayName,
        },
        targetType: 'support_ticket',
        targetId: 'support-ticket-demo-1',
        metadata: {
          nextStatus: 'in_progress',
        },
      },
    ];
  }

  private mapConnectedAdminLogListItem(
    item: Awaited<ReturnType<AdminLogRepository['listPage']>>['items'][number],
    metadata?: Record<string, unknown>,
  ): AdminLogEntry {
    return {
      id: item.id,
      stream: item.stream,
      eventType: item.eventType,
      summary: item.summary,
      occurredAt: item.occurredAt.toISOString(),
      ...(item.severity ? { severity: item.severity } : {}),
      ...(item.status ? { status: item.status } : {}),
      ...(item.actorId
        ? {
            actor: {
              id: item.actorId,
              ...(item.actorEmail ? { email: item.actorEmail } : {}),
              ...(item.actorDisplayName ? { displayName: item.actorDisplayName } : {}),
            },
          }
        : {}),
      ...(item.targetType ? { targetType: item.targetType } : {}),
      ...(item.targetId ? { targetId: item.targetId } : {}),
      ...(item.category ? { category: item.category } : {}),
      ...(item.source ? { source: item.source } : {}),
      ...(item.installationId ? { installationId: item.installationId } : {}),
      ...(item.provider ? { provider: item.provider } : {}),
      ...(item.model ? { model: item.model } : {}),
      ...(typeof item.durationMs === 'number' ? { durationMs: item.durationMs } : {}),
      ...(typeof item.costUsd === 'number' ? { costUsd: item.costUsd } : {}),
      ...(typeof item.promptTokens === 'number' ? { promptTokens: item.promptTokens } : {}),
      ...(typeof item.completionTokens === 'number' ? { completionTokens: item.completionTokens } : {}),
      ...(typeof item.totalTokens === 'number' ? { totalTokens: item.totalTokens } : {}),
      ...(item.errorSummary ? { errorSummary: item.errorSummary } : {}),
      ...(metadata ? { metadata } : {}),
    };
  }

  private resolveAdminAiRequestCandidateIds(
    item: Awaited<ReturnType<AdminLogRepository['listPage']>>['items'][number],
    metadata?: Record<string, unknown>,
  ): string[] {
    return collectAdminAiRequestCandidateIds({
      targetType: item.targetType,
      targetId: item.targetId,
      sourceRecordId: item.sourceRecordId,
      metadata,
    });
  }

  private resolveAiContentAvailability(promptContentJson: unknown, responseContentJson: unknown): 'available' | 'expired' | 'missing' {
    const text = [promptContentJson, responseContentJson]
      .filter((value) => typeof value === 'string')
      .join(' ')
      .toLowerCase();
    if (text.includes('expired after the retention window')) return 'expired';
    if (text.includes('not available')) return 'missing';
    return 'available';
  }

  private resolveAiContentMessage(promptContentJson: unknown, responseContentJson: unknown): string | undefined {
    if (typeof promptContentJson === 'string' && promptContentJson.includes('retention window')) return promptContentJson;
    if (typeof responseContentJson === 'string' && responseContentJson.includes('retention window')) return responseContentJson;
    if (typeof promptContentJson === 'string' && promptContentJson.includes('not available')) return promptContentJson;
    if (typeof responseContentJson === 'string' && responseContentJson.includes('not available')) return responseContentJson;
    return undefined;
  }

  private filterAdminLogEntries(items: AdminLogEntry[], filters: AdminLogFilters): {
    items: AdminLogEntry[];
    streamCounts: AdminLogsSnapshot['streamCounts'];
    categoryCounts: AdminLogCategoryCounts;
    total: number;
    hasNext: boolean;
  } {
    const afterBaseFilters = items.filter((item) => {
      if (filters.severity !== 'all' && item.severity !== filters.severity) return false;

      if (filters.status && item.status !== filters.status) return false;

      if (filters.eventType && !item.eventType.toLowerCase().includes(filters.eventType.toLowerCase())) return false;

      if (filters.from) {
        const fromMs = Date.parse(filters.from);
        if (Number.isFinite(fromMs) && Date.parse(item.occurredAt) < fromMs) return false;
      }

      if (filters.to) {
        const toMs = Date.parse(filters.to);
        if (Number.isFinite(toMs) && Date.parse(item.occurredAt) > toMs) return false;
      }

      if (!filters.search) return true;

      return this.matchesAdminLogSearch(item, filters.search);
    });

    const streamCounts: AdminLogsSnapshot['streamCounts'] = {
      audit: afterBaseFilters.filter((item) => item.stream === 'audit').length,
      activity: afterBaseFilters.filter((item) => item.stream === 'activity').length,
      security: afterBaseFilters.filter((item) => item.stream === 'security').length,
      domain: afterBaseFilters.filter((item) => item.stream === 'domain').length,
    };

    const categoryCounts: AdminLogCategoryCounts = {
      auth: afterBaseFilters.filter((item) => item.category === 'auth').length,
      extension: afterBaseFilters.filter((item) => item.category === 'extension').length,
      ai: afterBaseFilters.filter((item) => item.category === 'ai').length,
      admin: afterBaseFilters.filter((item) => item.category === 'admin').length,
      system: afterBaseFilters.filter((item) => item.category === 'system').length,
    };

    const afterStreamFilter =
      filters.stream === 'all'
        ? afterBaseFilters
        : afterBaseFilters.filter((item) => item.stream === filters.stream);

    const afterCategoryFilter =
      filters.category
        ? afterStreamFilter.filter((item) => item.category === filters.category)
        : afterStreamFilter;

    const afterSourceFilter =
      filters.source
        ? afterCategoryFilter.filter((item) => item.source === filters.source)
        : afterCategoryFilter;

    const total = afterSourceFilter.length;
    const page = filters.page ?? 1;
    const offset = (page - 1) * filters.limit;
    const hasNext = total > offset + filters.limit;

    return {
      items: afterSourceFilter.slice(offset, offset + filters.limit),
      streamCounts,
      categoryCounts,
      total,
      hasNext,
    };
  }

  private buildAdminSecuritySnapshot(snapshot: AdminLogsSnapshot): AdminSecuritySnapshot {
    return {
      personaKey: snapshot.personaKey,
      accessDecision: snapshot.accessDecision,
      exportDecision: snapshot.exportDecision,
      filters: snapshot.filters,
      items: snapshot.items,
      streamCounts: snapshot.streamCounts,
      categoryCounts: snapshot.categoryCounts,
      total: snapshot.total ?? snapshot.items.length,
      hasNext: snapshot.hasNext,
      findings: this.buildAdminSecurityFindings(snapshot.items),
      lifecycleTrend: this.buildAdminSecurityLifecycleTrend(snapshot.items),
      controls: this.buildAdminSecurityControls(),
      permissions: snapshot.permissions,
    };
  }

  private buildAdminSecurityLifecycleTrend(items: AdminLogEntry[]): AdminSecuritySnapshot['lifecycleTrend'] {
    const windowHours = 24;
    const bucketHours = 6;
    const bucketMs = bucketHours * 60 * 60 * 1000;
    const windowMs = windowHours * 60 * 60 * 1000;
    const observedTimestamps = items
      .map((item) => Date.parse(item.occurredAt))
      .filter((timestamp) => Number.isFinite(timestamp));
    const referenceTime =
      observedTimestamps.length > 0 ? new Date(Math.max(...observedTimestamps)) : new Date();
    const endExclusive = new Date(referenceTime);

    endExclusive.setUTCMinutes(0, 0, 0);
    endExclusive.setUTCHours(endExclusive.getUTCHours() + 1);

    const windowStart = new Date(endExclusive.getTime() - windowMs);
    const buckets: AdminSecuritySnapshot['lifecycleTrend']['buckets'] = [];

    for (let cursor = windowStart.getTime(); cursor < endExclusive.getTime(); cursor += bucketMs) {
      buckets.push({
        bucketStart: new Date(cursor).toISOString(),
        extensionBootstrapRefreshFailures: 0,
        extensionReconnectRequests: 0,
        extensionReconnectRecoveries: 0,
        extensionSessionRevocations: 0,
        extensionSessionRotations: 0,
        extensionRuntimeErrors: 0,
      });
    }

    for (const item of items) {
      const occurredAt = Date.parse(item.occurredAt);

      if (!Number.isFinite(occurredAt)) {
        continue;
      }

      if (occurredAt < windowStart.getTime() || occurredAt >= endExclusive.getTime()) {
        continue;
      }

      const bucketIndex = Math.floor((occurredAt - windowStart.getTime()) / bucketMs);
      const bucket = buckets[bucketIndex];

      if (!bucket) {
        continue;
      }

      if (item.eventType === 'extension.bootstrap_refresh_failed') {
        bucket.extensionBootstrapRefreshFailures += 1;
      } else if (item.eventType === 'extension.installation_reconnect_requested') {
        bucket.extensionReconnectRequests += 1;
      } else if (item.eventType === 'extension.installation_reconnected') {
        bucket.extensionReconnectRecoveries += 1;
      } else if (item.eventType === 'extension.installation_session_revoked') {
        bucket.extensionSessionRevocations += 1;
      } else if (item.eventType === 'extension.installation_session_rotated') {
        bucket.extensionSessionRotations += 1;
      } else if (item.eventType === 'extension.runtime_error') {
        bucket.extensionRuntimeErrors += 1;
      }
    }

    return {
      windowHours,
      bucketHours,
      buckets,
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
    const extensionBootstrapRefreshFailures = items.filter(
      (item) => item.eventType === 'extension.bootstrap_refresh_failed',
    ).length;
    const extensionReconnectRequests = items.filter(
      (item) => item.eventType === 'extension.installation_reconnect_requested',
    ).length;
    const extensionReconnectRecoveries = items.filter(
      (item) => item.eventType === 'extension.installation_reconnected',
    ).length;
    const extensionReconnectOutstanding = Math.max(extensionReconnectRequests - extensionReconnectRecoveries, 0);
    const extensionSessionRevocations = items.filter(
      (item) => item.eventType === 'extension.installation_session_revoked',
    ).length;
    const extensionSessionRotations = items.filter(
      (item) => item.eventType === 'extension.installation_session_rotated',
    ).length;
    const extensionRuntimeErrors = items.filter((item) => item.eventType === 'extension.runtime_error').length;
    const totalFailures = items.filter((item) => item.status === 'failure' || item.severity === 'error').length;

    return {
      suspiciousAuthFailures,
      impersonationEvents,
      providerCredentialEvents,
      privilegedActionEvents,
      extensionBootstrapRefreshFailures,
      extensionReconnectRequests,
      extensionReconnectRecoveries,
      extensionReconnectOutstanding,
      extensionSessionRevocations,
      extensionSessionRotations,
      extensionRuntimeErrors,
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
      item.category,
      item.source,
      item.actor?.id,
      item.actor?.email,
      item.actor?.displayName,
      item.targetType,
      item.targetId,
      item.installationId,
      item.provider,
      item.model,
      item.errorSummary,
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

  private deriveAdminLogCategory(
    eventType: string,
    stream: string,
    metadata?: Record<string, unknown>,
  ): Exclude<AdminLogCategoryFilter, 'all'> {
    const et = eventType.toLowerCase();

    // auth: login/logout/password/session/mfa/otp events
    if (
      et.startsWith('auth.') ||
      et.includes('.login') ||
      et.includes('.logout') ||
      et.includes('login_failed') ||
      et.includes('login_success') ||
      et.includes('password_reset') ||
      et.includes('session_expired') ||
      et.includes('session_revoked') ||
      et.includes('.otp') ||
      et.includes('.mfa')
    ) {
      return 'auth';
    }

    // extension: installation lifecycle
    if (
      et.startsWith('extension.') ||
      et.includes('installation') ||
      et.includes('bootstrap')
    ) {
      return 'extension';
    }

    // ai: proxy/quiz requests, provider/model metadata present
    if (
      et.startsWith('ai.') ||
      et.includes('quiz_answer') ||
      et.includes('ai_request') ||
      et.includes('proxy_request') ||
      (typeof metadata?.provider === 'string' && metadata.provider.length > 0) ||
      (typeof metadata?.model === 'string' && metadata.model.length > 0)
    ) {
      return 'ai';
    }

    // admin: audit-stream actions — provider policy, feature flags, users, remote config, compatibility, support, impersonation
    if (
      stream === 'audit' ||
      et.startsWith('admin.') ||
      et.includes('user.') ||
      et.includes('ai_provider') ||
      et.includes('feature_flag') ||
      et.includes('remote_config') ||
      et.includes('compatibility_rule') ||
      et.includes('support.') ||
      et.includes('impersonation')
    ) {
      return 'admin';
    }

    // system: webhooks, jobs, runtime failures, uncategorised domain events
    return 'system';
  }

  private deriveAdminLogSource(
    eventType: string,
    metadata?: Record<string, unknown>,
  ): Exclude<AdminLogSourceFilter, 'all'> | undefined {
    const raw = metadata?.source ?? metadata?.origin ?? metadata?.platform ?? metadata?.client ?? metadata?.requestSource;
    const surface = metadata?.surface;

    if (typeof raw === 'string') {
      const s = raw.toLowerCase();
      if (s === 'web' || s === 'web_app' || s === 'dashboard') return 'web';
      if (s === 'extension' || s === 'content_script' || s === 'extension_popup') return 'extension';
      if (s === 'api') return 'api';
      if (s === 'worker' || s === 'queue') return 'worker';
      if (s === 'webhook') return 'webhook';
    }

    if (typeof surface === 'string') {
      const sf = surface.toLowerCase();
      if (sf === 'web_app' || sf === 'dashboard') return 'web';
      if (sf === 'content_script' || sf === 'extension_popup') return 'extension';
    }

    const et = eventType.toLowerCase();
    if (et.startsWith('webhook.') || et.includes('webhook_')) return 'webhook';

    return undefined;
  }

  private extractAdminLogRichFields(metadata?: Record<string, unknown>): Partial<AdminLogEntry> {
    if (!metadata) return {};

    const result: Partial<AdminLogEntry> = {};

    if (typeof metadata.installationId === 'string') result.installationId = metadata.installationId;
    if (typeof metadata.provider === 'string') result.provider = metadata.provider;
    if (typeof metadata.model === 'string') result.model = metadata.model;
    if (typeof metadata.durationMs === 'number') result.durationMs = metadata.durationMs;
    if (typeof metadata.costUsd === 'number') result.costUsd = metadata.costUsd;
    if (typeof metadata.promptTokens === 'number') result.promptTokens = metadata.promptTokens;
    if (typeof metadata.completionTokens === 'number') result.completionTokens = metadata.completionTokens;
    if (typeof metadata.totalTokens === 'number') result.totalTokens = metadata.totalTokens;

    const errorText =
      typeof metadata.errorMessage === 'string' ? metadata.errorMessage :
      typeof metadata.error === 'string' ? metadata.error :
      typeof metadata.errorSummary === 'string' ? metadata.errorSummary :
      undefined;
    if (errorText) result.errorSummary = errorText.slice(0, 200);

    return result;
  }

  private buildAdminLogExportResult(
    snapshot: AdminLogsSnapshot,
    request?: Partial<AdminLogExportRequest>,
  ): AdminLogExportResult {
    const format = this.normalizeAdminLogExportFormat(request?.format);
    const exportedAt = new Date().toISOString();
    const fileStem = `audit-logs-platform-${exportedAt.slice(0, 10)}`;

    if (format === 'json') {
      return {
        format,
        fileName: `${fileStem}.json`,
        contentType: 'application/json',
        exportedAt,
        itemCount: snapshot.items.length,
        content: JSON.stringify(
          {
            exportedAt,
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
      'stream,category,source,eventType,summary,occurredAt,severity,status,' +
      'actorId,actorEmail,actorDisplayName,targetType,targetId,' +
      'installationId,provider,model,durationMs,costUsd,' +
      'promptTokens,completionTokens,totalTokens,errorSummary,metadata';
    const rows = snapshot.items.map((item) =>
      [
        item.stream,
        item.category ?? '',
        item.source ?? '',
        item.eventType,
        item.summary,
        item.occurredAt,
        item.severity ?? '',
        item.status ?? '',
        item.actor?.id ?? '',
        item.actor?.email ?? '',
        item.actor?.displayName ?? '',
        item.targetType ?? '',
        item.targetId ?? '',
        item.installationId ?? '',
        item.provider ?? '',
        item.model ?? '',
        item.durationMs !== undefined ? String(item.durationMs) : '',
        item.costUsd !== undefined ? String(item.costUsd) : '',
        item.promptTokens !== undefined ? String(item.promptTokens) : '',
        item.completionTokens !== undefined ? String(item.completionTokens) : '',
        item.totalTokens !== undefined ? String(item.totalTokens) : '',
        item.errorSummary ?? '',
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

    const fileStem = `usage-${scope}-${exportedAt.slice(0, 10)}`;

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
        format,
        scope,
        fileName: `${fileStem}.json`,
        contentType: 'application/json',
        exportedAt,
        content: JSON.stringify(payload, null, 2),
      };
    }

    return {
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
            reason: 'Investigating why a viewer lost access to billing pages.',
            createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
            endedAt: null,
          },
        ]
      : [];

    return buildSupportImpersonationHistorySnapshot({
      personaKey: persona.key,
      accessDecision,
      items,
      permissions: listPrincipalPermissions(persona.principal),
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
      permissions: listPrincipalPermissions(persona.principal),
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

  async getReady() {
    const health = await this.getHealth();
    const validationIssues = health.configuration.validationIssues;
    const postgres = health.infrastructure.find((item) => item.service === 'postgres');
    const postgresSchema = health.infrastructure.find((item) => item.service === 'postgres_schema');
    const redis = health.infrastructure.find((item) => item.service === 'redis');
    const runtimeConnected = this.env.runtimeMode === 'connected';
    const checks = {
      runtimeConnected,
      validationIssues: validationIssues.length === 0,
      postgresReachable: postgres?.status === 'reachable',
      postgresSchemaReady: postgresSchema?.status === 'reachable',
      redisReachable: redis?.status === 'reachable',
    };
    const failures = [
      ...(!checks.runtimeConnected
        ? [
            {
              key: 'runtime_mode',
              message: 'QUIZMIND_RUNTIME_MODE must be "connected" for readiness.',
            },
          ]
        : []),
      ...(!checks.validationIssues
        ? [
            {
              key: 'configuration',
              message: 'API environment validation issues must be resolved before readiness.',
            },
          ]
        : []),
      ...(!checks.postgresReachable
        ? [
            {
              key: 'postgres',
              message: postgres?.error ?? 'PostgreSQL is not reachable.',
            },
          ]
        : []),
      ...(!checks.postgresSchemaReady
        ? [
            {
              key: 'postgres_schema',
              message: postgresSchema?.error ?? 'PostgreSQL schema is not ready. Apply Prisma migrations.',
            },
          ]
        : []),
      ...(!checks.redisReachable
        ? [
            {
              key: 'redis',
              message: redis?.error ?? 'Redis is not reachable.',
            },
          ]
        : []),
    ];

    return {
      status: failures.length === 0 ? 'ready' : 'not_ready',
      timestamp: health.timestamp,
      checks,
      validationIssues,
      failures,
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
      reason: request?.reason ?? 'Investigating a user access issue in local foundation mode.',
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
      reason: request?.reason?.trim() || 'Investigating a user access issue in connected runtime mode.',
      supportTicketId: request?.supportTicketId?.trim() || undefined,
      operatorNote: request?.operatorNote?.trim() || undefined,
    });

    try {
      await this.supportImpersonationRepository.createSessionWithLogs({
        impersonationSessionId: result.result.impersonationSessionId,
        supportActorId: result.result.supportActorId,
        targetUserId: result.result.targetUserId,
        supportTicketId: request?.supportTicketId?.trim() || undefined,
        reason: result.result.reason,
        operatorNote: request?.operatorNote?.trim() || undefined,
        createdAt: new Date(result.result.createdAt),
        auditLog: result.auditLog,
        securityLog: result.securityLog,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException('Support actor, target user, or support ticket not found for impersonation.');
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
      reason: 'Investigating why a viewer lost access to billing pages.',
      closeReason,
    });

    return {
      impersonationSessionId,
      targetUserId: targetPersona.user.id,
      reason: 'Investigating why a viewer lost access to billing pages.',
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
