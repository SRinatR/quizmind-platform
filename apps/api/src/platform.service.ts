import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { loadApiEnv, validateApiEnv } from '@quizmind/config';
import { createNoopEmailAdapter, sendTemplatedEmail, verifyEmailTemplate } from '@quizmind/email';
import { createLogEvent } from '@quizmind/logger';
import { buildQueueJob, listQueueDefinitions } from '@quizmind/queue';
import { type SessionPrincipal } from '@quizmind/auth';
import {
  type AdminUserDirectorySnapshot,
  type AuthLoginRequest,
  type ExtensionBootstrapRequest,
  type RemoteConfigPublishRequest,
  type RemoteConfigPreviewRequest,
  type SupportImpersonationEndRequest,
  type SupportImpersonationEndResult,
  type SupportImpersonationHistorySnapshot,
  type SupportImpersonationRequest,
  type SupportImpersonationSessionSnapshot,
  type SupportTicketQueueSnapshot,
  type SupportTicketWorkflowUpdateRequest,
  type SupportTicketWorkflowUpdateResult,
  type UsageEventPayload,
} from '@quizmind/contracts';

import {
  canEndSupportImpersonation,
  canReadFeatureFlags,
  canReadSupportImpersonationSessions,
  canReadSupportTickets,
  canReadUsers,
  canStartSupportImpersonation,
  canPublishRemoteConfig,
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
  mapExtensionCompatibilityRuleToPolicy,
  resolveExtensionBootstrap,
} from './services/extension-bootstrap-service';
import { InfrastructureHealthService } from './services/infrastructure-health-service';
import {
  mapRemoteConfigLayerRecordToDefinition,
  previewRemoteConfig,
  publishRemoteConfigVersion,
} from './services/remote-config-service';
import {
  buildSupportImpersonationHistorySnapshot,
  buildSupportTicketQueueSnapshot,
  endSupportImpersonation as buildSupportImpersonationEnd,
  mapSupportImpersonationRecordToEndResult,
  mapSupportImpersonationRecordToSnapshot,
  mapSupportTicketRecordToSnapshot,
  startSupportImpersonation,
} from './services/support-service';
import { mapFeatureFlagRecordToDefinition } from './services/feature-flags-service';
import { type CurrentSessionSnapshot } from './auth/auth.types';
import { mapUserRecordToDirectoryEntry } from './services/users-service';
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
import { ExtensionCompatibilityRepository } from './extension/extension-compatibility.repository';
import { FeatureFlagRepository } from './feature-flags/feature-flag.repository';
import { RemoteConfigRepository } from './remote-config/remote-config.repository';
import { SupportImpersonationRepository } from './support/support-impersonation.repository';
import { SupportTicketRepository } from './support/support-ticket.repository';
import { WorkspaceRepository } from './workspaces/workspace.repository';

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
    @Inject(FeatureFlagRepository)
    private readonly featureFlagRepository: FeatureFlagRepository,
    @Inject(RemoteConfigRepository)
    private readonly remoteConfigRepository: RemoteConfigRepository,
    @Inject(WorkspaceRepository)
    private readonly workspaceRepository: WorkspaceRepository,
    @Inject(UserRepository)
    private readonly userRepository: UserRepository,
    @Inject(SupportTicketRepository)
    private readonly supportTicketRepository: SupportTicketRepository,
    @Inject(SupportImpersonationRepository)
    private readonly supportImpersonationRepository: SupportImpersonationRepository,
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
        emailProvider: 'noop',
        templates: ['auth.verify-email', 'auth.password-reset', 'workspace.invitation'],
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

      return {
        ...publishRemoteConfigVersion(publishRequest, {
          publishedAt: persistedVersion.createdAt.toISOString(),
        }),
        preview: previewRemoteConfig(previewRequest),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException('Workspace not found for remote config publication.');
      }

      throw error;
    }
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

  ingestUsageEvent(event?: Partial<UsageEventPayload>) {
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

    const queueJob = buildQueueJob({
      queue: 'usage-events',
      payload: usageEvent,
      dedupeKey: `${usageEvent.installationId}:${usageEvent.occurredAt}`,
    });

    return {
      queued: true,
      queue: queueJob.queue,
      job: queueJob,
      handler: 'worker.process-usage-event',
      logEvent: createLogEvent({
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
      }),
    };
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

  listSupportTickets(personaKey?: string): SupportTicketQueueSnapshot {
    const persona = getPersona(personaKey);
    const accessDecision = canReadSupportTickets(persona.principal);

    return buildSupportTicketQueueSnapshot({
      personaKey: persona.key,
      accessDecision,
      items: accessDecision.allowed ? listFoundationSupportTickets() : [],
      permissions: listPrincipalPermissions(persona.principal, persona.preferredWorkspaceId),
    });
  }

  async listSupportTicketsForCurrentSession(session: CurrentSessionSnapshot): Promise<SupportTicketQueueSnapshot> {
    const accessDecision = canReadSupportTickets(session.principal as SessionPrincipal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const items = await this.supportTicketRepository.listRecent();

    return buildSupportTicketQueueSnapshot({
      personaKey: 'connected-user',
      accessDecision,
      items: items.map(mapSupportTicketRecordToSnapshot),
      permissions: session.permissions,
    });
  }

  updateSupportTicket(request?: Partial<SupportTicketWorkflowUpdateRequest>): SupportTicketWorkflowUpdateResult {
    const fallbackTicket =
      listFoundationSupportTickets().find((ticket) => ticket.id === request?.supportTicketId?.trim()) ??
      listFoundationSupportTickets()[0];

    if (!fallbackTicket) {
      throw new NotFoundException('Support ticket not found.');
    }

    const supportPersona = getPersona('support-admin');
    const normalizedAssignedToUserId =
      request?.assignedToUserId === undefined
        ? fallbackTicket.assignedTo?.id
        : request.assignedToUserId?.trim() || null;
    const normalizedHandoffNote =
      request?.handoffNote === undefined
        ? fallbackTicket.handoffNote
        : request.handoffNote?.trim() || undefined;

    return {
      ...fallbackTicket,
      status: request?.status ?? fallbackTicket.status,
      updatedAt: new Date().toISOString(),
      ...(normalizedAssignedToUserId
        ? {
            assignedTo: {
              id: normalizedAssignedToUserId,
              email: supportPersona.user.email,
              displayName: supportPersona.user.displayName,
            },
          }
        : {}),
      ...(normalizedHandoffNote ? { handoffNote: normalizedHandoffNote } : {}),
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
      const updatedTicket = await this.supportTicketRepository.updateWorkflow({
        supportTicketId,
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
        ...(effectiveAssignedToUserId !== undefined ? { assignedToUserId: effectiveAssignedToUserId } : {}),
        ...(normalizedHandoffNote !== undefined ? { handoffNote: normalizedHandoffNote } : {}),
      });

      return mapSupportTicketRecordToSnapshot(updatedTicket);
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
