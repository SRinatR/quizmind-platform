import { randomUUID } from 'node:crypto';

import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  type AiAccessPolicyMode,
  type AiProvider,
  type AiProviderPolicyHistoryEntry,
  type AiProviderPolicySnapshot,
  type AiProviderPolicyResetRequest,
  type AiProviderPolicyResetResult,
  type AiProviderPolicyUpdateRequest,
  type AiProviderPolicyUpdateResult,
} from '@quizmind/contracts';
import { Prisma } from '@quizmind/database';
import { createLogEvent } from '@quizmind/logger';
import { buildDefaultAiAccessPolicy, providerRegistry } from '@quizmind/providers';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { canManageAiProviders } from '../services/access-service';
import {
  AiProviderPolicyRepository,
  type AiProviderPolicyHistoryActorRecord,
  type AiProviderPolicyHistoryRecord,
  type AiProviderPolicyRecord,
} from './ai-provider-policy.repository';

function readJsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeProviderList(value: AiProvider[] | undefined, fallback: AiProvider[]): AiProvider[] {
  const allowedProviders = new Set(providerRegistry.map((provider) => provider.provider));
  const nextProviders = (value ?? fallback).filter((provider): provider is AiProvider => allowedProviders.has(provider));

  return Array.from(new Set(nextProviders)).sort();
}

function normalizeStringList(value: string[] | undefined, fallback: string[]): string[] {
  return Array.from(
    new Set(
      (value ?? fallback)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ).sort();
}

function normalizeMode(value: AiAccessPolicyMode | undefined, fallback: AiAccessPolicyMode): AiAccessPolicyMode {
  if (
    value === 'platform_only' ||
    value === 'user_key_optional' ||
    value === 'user_key_required' ||
    value === 'admin_approved_user_key' ||
    value === 'enterprise_managed'
  ) {
    return value;
  }

  return fallback;
}

function readJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readJsonString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readJsonBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function createVirtualPolicy(): AiProviderPolicySnapshot {
  return {
    scopeType: 'global',
    scopeKey: 'global',
    updatedById: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...buildDefaultAiAccessPolicy({
      mode: 'platform_only',
      providers: ['openrouter'],
      defaultProvider: 'openrouter',
      defaultModel: 'openrouter/auto',
      reason: 'No persisted AI provider policy exists yet, so the global platform-only default applies.',
    }),
  };
}

@Injectable()
export class AiProviderPolicyService {
  constructor(
    @Inject(AiProviderPolicyRepository)
    private readonly aiProviderPolicyRepository: AiProviderPolicyRepository,
  ) {}

  async resolvePolicyForWorkspace(): Promise<AiProviderPolicySnapshot> {
    const globalPolicy = await this.aiProviderPolicyRepository.findGlobal();

    if (globalPolicy) {
      return this.mapRecordToSnapshot(globalPolicy);
    }

    return createVirtualPolicy();
  }

  async listHistoryForCurrentSession(
    session: CurrentSessionSnapshot,
  ): Promise<AiProviderPolicyHistoryEntry[]> {
    this.assertCanManageAiProviders(session);

    const scopeKeys = ['global'];
    const { records, actors } = await this.aiProviderPolicyRepository.listHistory(scopeKeys);

    return records.map((record) => this.mapHistoryRecordToEntry(record, actors));
  }

  async updatePolicyForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<AiProviderPolicyUpdateRequest>,
  ): Promise<AiProviderPolicyUpdateResult> {
    this.assertCanManageAiProviders(session);

    const basePolicy = await this.resolvePolicyForWorkspace();
    const mode = normalizeMode(request?.mode, basePolicy.mode);
    const providers = normalizeProviderList(request?.providers, basePolicy.providers);

    if (providers.length === 0) {
      throw new BadRequestException('At least one provider must remain enabled in AI provider policy.');
    }

    const requestedDefaultProvider = request?.defaultProvider === null ? undefined : request?.defaultProvider;
    const defaultProvider =
      requestedDefaultProvider && providers.includes(requestedDefaultProvider)
        ? requestedDefaultProvider
        : basePolicy.defaultProvider && providers.includes(basePolicy.defaultProvider)
          ? basePolicy.defaultProvider
          : providers[0];
    const allowPlatformManaged = request?.allowPlatformManaged ?? basePolicy.allowPlatformManaged;
    const allowBringYourOwnKey =
      request?.allowBringYourOwnKey ?? (mode === 'platform_only' ? false : true);
    const allowDirectProviderMode = request?.allowDirectProviderMode ?? basePolicy.allowDirectProviderMode;
    const allowWorkspaceSharedCredentials =
      request?.allowWorkspaceSharedCredentials ?? basePolicy.allowWorkspaceSharedCredentials ?? false;
    const requireAdminApproval =
      request?.requireAdminApproval ?? (mode === 'admin_approved_user_key' ? true : false);
    const allowVisionOnUserKeys = request?.allowVisionOnUserKeys ?? basePolicy.allowVisionOnUserKeys ?? false;
    const defaultModel =
      request?.defaultModel === null
        ? undefined
        : request?.defaultModel?.trim() || basePolicy.defaultModel || undefined;
    const allowedModelTags = normalizeStringList(request?.allowedModelTags, basePolicy.allowedModelTags ?? []);
    const reason =
      request?.reason === null ? undefined : request?.reason?.trim() || basePolicy.reason || undefined;
    const scopeType = 'global';
    const scopeKey = 'global';
    const occurredAt = new Date();
    const metadata = {
      scopeKey,
      scopeType,
      mode,
      allowPlatformManaged,
      allowBringYourOwnKey,
      allowDirectProviderMode,
      allowWorkspaceSharedCredentials,
      requireAdminApproval,
      allowVisionOnUserKeys,
      providers,
      allowedModelTags,
      defaultProvider,
      defaultModel: defaultModel ?? null,
      reason: reason ?? null,
    };
    const auditLog = createLogEvent({
      category: 'audit',
      eventId: randomUUID(),
      eventType: 'ai_provider_policy.updated',
      actorId: session.user.id,
      actorType: 'user',
      targetType: 'ai_provider_policy',
      targetId: scopeKey,
      occurredAt: occurredAt.toISOString(),
      severity: 'info',
      status: 'success',
      metadata,
    });
    const securityLog = createLogEvent({
      category: 'security',
      eventId: randomUUID(),
      eventType: 'ai_provider_policy.changed',
      actorId: session.user.id,
      actorType: 'user',
      targetType: 'ai_provider_policy',
      targetId: scopeKey,
      occurredAt: occurredAt.toISOString(),
      severity: 'warn',
      status: 'success',
      metadata,
    });
    const record = await this.aiProviderPolicyRepository.upsertWithLogs({
      scopeKey,
      scopeType,
      mode,
      allowPlatformManaged,
      allowBringYourOwnKey,
      allowDirectProviderMode,
      allowWorkspaceSharedCredentials,
      requireAdminApproval,
      allowVisionOnUserKeys,
      providersJson: providers,
      allowedModelTagsJson: allowedModelTags,
      defaultProvider,
      defaultModel: defaultModel ?? null,
      reason: reason ?? null,
      updatedById: session.user.id,
      occurredAt,
      auditLog,
      securityLog,
      domainEventType: 'ai_provider_policy.updated',
      domainPayload: metadata as Prisma.InputJsonValue,
    });

    return {
      policy: this.mapRecordToSnapshot(record),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async resetPolicyForCurrentSession(
    session: CurrentSessionSnapshot,
    _request?: Partial<AiProviderPolicyResetRequest>,
  ): Promise<AiProviderPolicyResetResult> {
    this.assertCanManageAiProviders(session);

    return {
      scopeKey: 'global',
      resetApplied: false,
      policy: await this.resolvePolicyForWorkspace(),
      resetAt: new Date().toISOString(),
    };
  }

  private mapRecordToSnapshot(record: AiProviderPolicyRecord): AiProviderPolicySnapshot {
    return {
      scopeType: record.scopeType,
      scopeKey: record.scopeKey,
      updatedById: record.updatedById,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      mode: record.mode,
      allowPlatformManaged: record.allowPlatformManaged,
      allowBringYourOwnKey: record.allowBringYourOwnKey,
      allowDirectProviderMode: record.allowDirectProviderMode,
      allowWorkspaceSharedCredentials: record.allowWorkspaceSharedCredentials,
      requireAdminApproval: record.requireAdminApproval,
      allowVisionOnUserKeys: record.allowVisionOnUserKeys,
      providers: normalizeProviderList(readJsonStringArray(record.providersJson) as AiProvider[], ['openrouter']),
      allowedModelTags: normalizeStringList(readJsonStringArray(record.allowedModelTagsJson), []),
      defaultProvider:
        record.defaultProvider && providerRegistry.some((provider) => provider.provider === record.defaultProvider)
          ? (record.defaultProvider as AiProvider)
          : undefined,
      defaultModel: record.defaultModel ?? undefined,
      reason: record.reason ?? undefined,
    };
  }

  private assertCanManageAiProviders(session: CurrentSessionSnapshot): void {
    const accessDecision = canManageAiProviders(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }
  }


  private mapHistoryRecordToEntry(
    record: AiProviderPolicyHistoryRecord,
    actors: AiProviderPolicyHistoryActorRecord[],
  ): AiProviderPolicyHistoryEntry {
    const metadata = readJsonObject(record.metadataJson);
    const scopeKey = readJsonString(metadata?.scopeKey) ?? record.targetId;
    const scopeType: 'global' | 'workspace' =
      readJsonString(metadata?.scopeType) === 'workspace' || scopeKey.startsWith('workspace:')
        ? 'workspace'
        : 'global';
    const providers = normalizeProviderList(
      readJsonStringArray((metadata?.providers ?? metadata?.previousProviders) as Prisma.JsonValue | undefined) as AiProvider[],
      [],
    );
    const allowedModelTags = normalizeStringList(
      readJsonStringArray((metadata?.allowedModelTags ?? []) as Prisma.JsonValue | undefined),
      [],
    );
    const actor = record.actorId ? actors.find((entry) => entry.id === record.actorId) ?? null : null;
    const rawDefaultProvider = readJsonString(metadata?.defaultProvider ?? metadata?.previousDefaultProvider);
    const modeValue = readJsonString(metadata?.mode ?? metadata?.previousMode);

    return {
      id: record.id,
      eventType: record.action,
      summary: this.buildHistorySummary(
        record.action,
        scopeType,
        providers,
        normalizeMode(modeValue as AiAccessPolicyMode | undefined, 'platform_only'),
      ),
      scopeType,
      scopeKey,
      actor: actor
        ? {
            id: actor.id,
            email: actor.email,
            displayName: actor.displayName,
          }
        : record.actorId
          ? {
              id: record.actorId,
            }
          : null,
      occurredAt: record.createdAt.toISOString(),
      mode: modeValue ? normalizeMode(modeValue as AiAccessPolicyMode, 'platform_only') : undefined,
      providers,
      allowBringYourOwnKey: readJsonBoolean(metadata?.allowBringYourOwnKey),
      allowWorkspaceSharedCredentials: readJsonBoolean(metadata?.allowWorkspaceSharedCredentials),
      requireAdminApproval: readJsonBoolean(metadata?.requireAdminApproval),
      defaultProvider:
        rawDefaultProvider && providerRegistry.some((provider) => provider.provider === rawDefaultProvider)
          ? (rawDefaultProvider as AiProvider)
          : undefined,
      defaultModel: readJsonString(metadata?.defaultModel ?? metadata?.previousDefaultModel),
      allowedModelTags,
      reason: readJsonString(metadata?.reason ?? metadata?.previousReason),
    };
  }

  private buildHistorySummary(
    action: string,
    scopeType: 'global' | 'workspace',
    providers: AiProvider[],
    mode: AiAccessPolicyMode,
  ): string {
    const scopeLabel = scopeType === 'workspace' ? 'Workspace override' : 'Global policy';

    if (action === 'ai_provider_policy.reset') {
      return `${scopeLabel} was reset and now inherits the global policy.`;
    }

    const providerSummary = providers.length > 0 ? providers.join(', ') : 'no providers';

    return `${scopeLabel} updated to ${mode} across ${providerSummary}.`;
  }
}
