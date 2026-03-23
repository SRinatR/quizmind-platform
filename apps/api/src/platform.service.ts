import { Injectable } from '@nestjs/common';
import { listPrincipalPermissions, canPublishRemoteConfig, canReadWorkspaceSubscription } from './services/access-service';
import { resolveWorkspaceSubscriptionSummary } from './services/billing-service';
import { resolveExtensionBootstrap } from './services/extension-bootstrap-service';
import { previewRemoteConfig, publishRemoteConfigVersion } from './services/remote-config-service';
import { startSupportImpersonation } from './services/support-service';
import { loadApiEnv } from '@quizmind/config';
import { createLogEvent } from '@quizmind/logger';
import { createNoopEmailAdapter, sendTemplatedEmail, verifyEmailTemplate } from '@quizmind/email';
import { buildQueueJob, listQueueDefinitions } from '@quizmind/queue';
import {
  type AuthLoginRequest,
  type ExtensionBootstrapRequest,
  type RemoteConfigPublishRequest,
  type RemoteConfigPreviewRequest,
  type SupportImpersonationRequest,
  type UsageEventPayload,
} from '@quizmind/contracts';

import {
  buildAuthSession,
  getAccessibleWorkspaces,
  getFoundationOverview,
  getPersona,
  getPlanForWorkspace,
  getWorkspaceSummary,
  matchPersonaFromLogin,
} from './platform-data';

@Injectable()
export class PlatformService {
  private readonly env = loadApiEnv();

  getHealth() {
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
      observability: {
        requestLogging: 'enabled',
        auditLogging: 'enabled',
        securityLogging: 'enabled',
      },
      infrastructure: [
        {
          service: 'postgres',
          status: this.env.runtimeMode === 'connected' ? 'configured' : 'mock',
          url: this.env.databaseUrl,
        },
        {
          service: 'redis',
          status: this.env.runtimeMode === 'connected' ? 'configured' : 'mock',
          url: this.env.redisUrl,
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

  bootstrapExtension(request?: Partial<ExtensionBootstrapRequest>) {
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

    return resolveExtensionBootstrap(bootstrapRequest);
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

  startSupportImpersonation(request?: Partial<SupportImpersonationRequest>) {
    return startSupportImpersonation({
      supportActorId: request?.supportActorId ?? getPersona('support-admin').user.id,
      targetUserId: request?.targetUserId ?? getPersona('workspace-viewer').user.id,
      workspaceId: request?.workspaceId ?? 'ws_alpha',
      reason: request?.reason ?? 'Investigating a workspace access issue in local foundation mode.',
    });
  }
}
