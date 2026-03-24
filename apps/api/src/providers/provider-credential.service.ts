import { randomUUID } from 'node:crypto';

import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import { type CredentialOwnerType as DatabaseCredentialOwnerType, Prisma } from '@quizmind/database';
import {
  type AdminProviderGovernanceSnapshot,
  type AiProvider,
  type CredentialOwnerType,
  type ProviderCatalogPayload,
  type ProviderCredentialCreateRequest,
  type ProviderCredentialInventory,
  type ProviderCredentialOwnerBreakdown,
  type ProviderCredentialProviderBreakdown,
  type ProviderCredentialMutationResult,
  type ProviderCredentialRevokeRequest,
  type ProviderCredentialRevokeResult,
  type ProviderCredentialRotateRequest,
  type ProviderCredentialStatusBreakdown,
  type ProviderCredentialSummary,
} from '@quizmind/contracts';
import { createLogEvent, redactSecrets } from '@quizmind/logger';
import {
  getProviderCatalog,
  providerRegistry,
  validateProviderSecretShape,
} from '@quizmind/providers';
import { buildSecretMetadata, encryptSecret, redactSecretValue } from '@quizmind/secrets';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import {
  canManageAiProviders,
  canReadProviderCredentials,
  canRotateProviderCredentials,
  canWriteProviderCredentials,
} from '../services/access-service';
import { AiProviderPolicyService } from './ai-provider-policy.service';
import { ProviderCredentialRepository, type ProviderCredentialRecord } from './provider-credential.repository';

function readJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readJsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeScopes(value: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? [])
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ).sort();
}

function createOwnerBreakdown(): ProviderCredentialOwnerBreakdown {
  return {
    platform: 0,
    workspace: 0,
    user: 0,
  };
}

function createStatusBreakdown(): ProviderCredentialStatusBreakdown {
  return {
    pending: 0,
    valid: 0,
    invalid: 0,
    revoked: 0,
  };
}

@Injectable()
export class ProviderCredentialService {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(AiProviderPolicyService)
    private readonly aiProviderPolicyService: AiProviderPolicyService,
    @Inject(ProviderCredentialRepository)
    private readonly providerCredentialRepository: ProviderCredentialRepository,
  ) {}

  getCatalog(): ProviderCatalogPayload {
    return getProviderCatalog();
  }

  async listAdminProviderGovernanceForCurrentSession(
    session: CurrentSessionSnapshot,
    workspaceId?: string,
  ): Promise<AdminProviderGovernanceSnapshot> {
    const accessDecision = canManageAiProviders(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const workspace = this.resolveRequestedWorkspace(session, workspaceId);
    const items = await this.providerCredentialRepository.listForGovernance({
      workspaceId: workspace.id,
      includePlatform: true,
    });
    const mappedItems = items.map((item) => this.mapRecordToSummary(item));
    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace(workspace.id);
    const policyHistory = await this.aiProviderPolicyService.listHistoryForCurrentSession(session, workspace.id);

    return {
      workspace,
      permissions: session.permissions,
      ...getProviderCatalog(),
      aiAccessPolicy: policy,
      policy,
      policyHistory,
      items: mappedItems,
      ownerBreakdown: this.buildOwnerBreakdown(mappedItems),
      statusBreakdown: this.buildStatusBreakdown(mappedItems),
      providerBreakdown: this.buildProviderBreakdown(mappedItems),
    };
  }

  async listCredentialInventoryForCurrentSession(
    session: CurrentSessionSnapshot,
    workspaceId?: string,
  ): Promise<ProviderCredentialInventory> {
    const workspace = this.resolveRequestedWorkspace(session, workspaceId);
    const accessDecision = canReadProviderCredentials(session.principal, workspace.id);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const includePlatform = canManageAiProviders(session.principal).allowed;
    const items = await this.providerCredentialRepository.listAccessible({
      userId: session.user.id,
      workspaceIds: session.workspaces.map((entry) => entry.id),
      includePlatform,
    });
    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace(workspace.id);

    return {
      workspace,
      permissions: session.permissions,
      ...getProviderCatalog(),
      aiAccessPolicy: policy,
      policy,
      items: items
        .filter((item) => this.isVisibleForWorkspace(item, workspace.id))
        .map((item) => this.mapRecordToSummary(item)),
    };
  }

  async createCredentialForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<ProviderCredentialCreateRequest>,
  ): Promise<ProviderCredentialMutationResult> {
    const provider = this.readProvider(request?.provider);
    const ownerType = this.readOwnerType(request?.ownerType);
    const workspace = ownerType === 'platform' ? null : this.resolveRequestedWorkspace(session, request?.workspaceId);

    this.assertCanCreateCredential(session, ownerType, workspace?.id);

    if (ownerType !== 'platform') {
      const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace(workspace?.id);
      this.assertPolicyAllowsCredentialManagement(policy, ownerType, provider, 'create');
    }

    const secretValidation = validateProviderSecretShape(provider, request?.secret ?? '');

    if (!secretValidation.valid || !secretValidation.normalizedSecret) {
      throw new BadRequestException(secretValidation.reason ?? 'Provider secret is invalid.');
    }

    const scopes = normalizeScopes(request?.scopes);
    const occurredAt = new Date();
    const ownerId =
      ownerType === 'platform'
        ? 'platform'
        : ownerType === 'workspace'
          ? workspace!.id
          : request?.ownerId?.trim() || session.user.id;
    const metadata = {
      ...buildSecretMetadata({
        provider,
        ownerType,
        ownerId,
        scopes,
        createdAt: occurredAt.toISOString(),
      }),
      secretPreview: redactSecretValue(secretValidation.normalizedSecret),
      validationMessage: secretValidation.reason,
      validationMode: 'shape_check',
      proxyMode: 'proxy_only',
      ...(workspace ? { workspaceId: workspace.id } : {}),
    };
    const logMetadata = redactSecrets({
      provider,
      ownerType,
      ownerId,
      scopes,
      secretPreview: metadata.secretPreview,
      workspaceId: workspace?.id,
    });
    const auditLog = createLogEvent({
      category: 'audit',
      eventId: randomUUID(),
      eventType: 'provider_credential.created',
      actorId: session.user.id,
      actorType: 'user',
      workspaceId: workspace?.id,
      targetType: 'provider_credential',
      targetId: ownerId,
      occurredAt: occurredAt.toISOString(),
      severity: 'info',
      status: 'success',
      metadata: logMetadata,
    });
    const securityLog = createLogEvent({
      category: 'security',
      eventId: randomUUID(),
      eventType: 'provider_credential.secret_added',
      actorId: session.user.id,
      actorType: 'user',
      workspaceId: workspace?.id,
      targetType: 'provider_credential',
      targetId: ownerId,
      occurredAt: occurredAt.toISOString(),
      severity: 'info',
      status: 'success',
      metadata: logMetadata,
    });
    const record = await this.providerCredentialRepository.createWithLogs({
      provider,
      ownerType: ownerType as DatabaseCredentialOwnerType,
      ownerId,
      userId: ownerType === 'user' ? session.user.id : null,
      workspaceId: workspace?.id ?? null,
      encryptedSecretJson: encryptSecret({
        plaintext: secretValidation.normalizedSecret,
        secret: this.env.providerCredentialSecret,
      }) as unknown as Prisma.InputJsonValue,
      validationStatus: 'valid',
      scopesJson: scopes,
      metadataJson: metadata as Prisma.InputJsonValue,
      lastValidatedAt: occurredAt,
      occurredAt,
      auditLog,
      securityLog,
      domainEventType: 'provider_credential.created',
      domainPayload: {
        provider,
        ownerType,
        ownerId,
        workspaceId: workspace?.id ?? null,
        scopes,
        validationStatus: 'valid',
      },
    });

    return {
      credential: this.mapRecordToSummary(record),
      validationMessage: secretValidation.reason,
    };
  }

  async rotateCredentialForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<ProviderCredentialRotateRequest>,
  ): Promise<ProviderCredentialMutationResult> {
    const credentialId = request?.credentialId?.trim();

    if (!credentialId) {
      throw new BadRequestException('credentialId is required.');
    }

    const existing = await this.providerCredentialRepository.findById(credentialId);

    if (!existing) {
      throw new NotFoundException('Provider credential not found.');
    }

    this.assertCanRotateCredential(session, existing);

    if (existing.ownerType !== 'platform' && !canManageAiProviders(session.principal).allowed) {
      const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace(existing.workspaceId ?? undefined);
      this.assertPolicyAllowsCredentialManagement(policy, existing.ownerType as CredentialOwnerType, existing.provider as AiProvider, 'rotate');
    }

    const provider = this.readProvider(existing.provider as AiProvider);
    const secretValidation = validateProviderSecretShape(provider, request?.secret ?? '');

    if (!secretValidation.valid || !secretValidation.normalizedSecret) {
      throw new BadRequestException(secretValidation.reason ?? 'Provider secret is invalid.');
    }

    const occurredAt = new Date();
    const scopes = request && 'scopes' in request ? normalizeScopes(request.scopes) : readJsonStringArray(existing.scopesJson);
    const metadata = {
      ...(readJsonObject(existing.metadataJson) ?? {}),
      secretPreview: redactSecretValue(secretValidation.normalizedSecret),
      validationMessage: secretValidation.reason,
      validationMode: 'shape_check',
      rotatedAt: occurredAt.toISOString(),
      scopes,
    };
    const logMetadata = redactSecrets({
      provider,
      ownerType: existing.ownerType,
      ownerId: existing.ownerId ?? existing.workspaceId ?? existing.userId,
      secretPreview: metadata.secretPreview,
      workspaceId: existing.workspaceId,
      scopes,
    });
    const auditLog = createLogEvent({
      category: 'audit',
      eventId: randomUUID(),
      eventType: 'provider_credential.rotated',
      actorId: session.user.id,
      actorType: 'user',
      workspaceId: existing.workspaceId ?? undefined,
      targetType: 'provider_credential',
      targetId: existing.id,
      occurredAt: occurredAt.toISOString(),
      severity: 'info',
      status: 'success',
      metadata: logMetadata,
    });
    const securityLog = createLogEvent({
      category: 'security',
      eventId: randomUUID(),
      eventType: 'provider_credential.secret_rotated',
      actorId: session.user.id,
      actorType: 'user',
      workspaceId: existing.workspaceId ?? undefined,
      targetType: 'provider_credential',
      targetId: existing.id,
      occurredAt: occurredAt.toISOString(),
      severity: 'info',
      status: 'success',
      metadata: logMetadata,
    });
    const record = await this.providerCredentialRepository.rotateWithLogs({
      credentialId: existing.id,
      encryptedSecretJson: encryptSecret({
        plaintext: secretValidation.normalizedSecret,
        secret: this.env.providerCredentialSecret,
      }) as unknown as Prisma.InputJsonValue,
      validationStatus: 'valid',
      scopesJson: scopes,
      metadataJson: metadata as Prisma.InputJsonValue,
      lastValidatedAt: occurredAt,
      occurredAt,
      auditLog,
      securityLog,
      domainEventType: 'provider_credential.rotated',
      domainPayload: {
        credentialId: existing.id,
        provider,
        ownerType: existing.ownerType,
        ownerId: existing.ownerId ?? existing.workspaceId ?? existing.userId,
        workspaceId: existing.workspaceId,
        scopes,
        validationStatus: 'valid',
      },
    });

    return {
      credential: this.mapRecordToSummary(record),
      validationMessage: secretValidation.reason,
    };
  }

  async revokeCredentialForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<ProviderCredentialRevokeRequest>,
  ): Promise<ProviderCredentialRevokeResult> {
    const credentialId = request?.credentialId?.trim();

    if (!credentialId) {
      throw new BadRequestException('credentialId is required.');
    }

    const existing = await this.providerCredentialRepository.findById(credentialId);

    if (!existing) {
      throw new NotFoundException('Provider credential not found.');
    }

    this.assertCanRotateCredential(session, existing);

    if (existing.revokedAt) {
      return {
        credentialId: existing.id,
        revokedAt: existing.revokedAt.toISOString(),
      };
    }

    const occurredAt = new Date();
    const metadata = {
      ...(readJsonObject(existing.metadataJson) ?? {}),
      revokedAt: occurredAt.toISOString(),
      revokeReason: request?.reason?.trim() || null,
      validationMessage: 'Provider credential was revoked.',
    };
    const logMetadata = redactSecrets({
      provider: existing.provider,
      ownerType: existing.ownerType,
      ownerId: existing.ownerId ?? existing.workspaceId ?? existing.userId,
      workspaceId: existing.workspaceId,
      reason: request?.reason?.trim() || null,
    });
    const auditLog = createLogEvent({
      category: 'audit',
      eventId: randomUUID(),
      eventType: 'provider_credential.revoked',
      actorId: session.user.id,
      actorType: 'user',
      workspaceId: existing.workspaceId ?? undefined,
      targetType: 'provider_credential',
      targetId: existing.id,
      occurredAt: occurredAt.toISOString(),
      severity: 'warn',
      status: 'success',
      metadata: logMetadata,
    });
    const securityLog = createLogEvent({
      category: 'security',
      eventId: randomUUID(),
      eventType: 'provider_credential.secret_revoked',
      actorId: session.user.id,
      actorType: 'user',
      workspaceId: existing.workspaceId ?? undefined,
      targetType: 'provider_credential',
      targetId: existing.id,
      occurredAt: occurredAt.toISOString(),
      severity: 'warn',
      status: 'success',
      metadata: logMetadata,
    });
    const record = await this.providerCredentialRepository.revokeWithLogs({
      credentialId: existing.id,
      validationStatus: 'revoked',
      metadataJson: metadata as Prisma.InputJsonValue,
      revokedAt: occurredAt,
      occurredAt,
      auditLog,
      securityLog,
      domainEventType: 'provider_credential.revoked',
      domainPayload: {
        credentialId: existing.id,
        provider: existing.provider,
        ownerType: existing.ownerType,
        ownerId: existing.ownerId ?? existing.workspaceId ?? existing.userId,
        workspaceId: existing.workspaceId,
        reason: request?.reason?.trim() || null,
      },
    });

    return {
      credentialId: record.id,
      revokedAt: record.revokedAt?.toISOString() ?? occurredAt.toISOString(),
    };
  }

  private resolveRequestedWorkspace(session: CurrentSessionSnapshot, workspaceId?: string) {
    const resolvedWorkspaceId = workspaceId?.trim() || session.workspaces[0]?.id;

    if (!resolvedWorkspaceId) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const workspace = session.workspaces.find((entry) => entry.id === resolvedWorkspaceId) ?? null;

    if (!workspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    return workspace;
  }

  private isVisibleForWorkspace(record: ProviderCredentialRecord, workspaceId: string): boolean {
    return record.ownerType === 'platform' || record.workspaceId === null || record.workspaceId === workspaceId;
  }

  private mapRecordToSummary(record: ProviderCredentialRecord): ProviderCredentialSummary {
    const metadata = readJsonObject(record.metadataJson);
    const ownerId = record.ownerId ?? record.workspaceId ?? record.userId ?? 'unknown';

    return {
      id: record.id,
      provider: record.provider as AiProvider,
      ownerType: record.ownerType as CredentialOwnerType,
      ownerId,
      userId: record.userId,
      workspaceId: record.workspaceId,
      validationStatus: record.validationStatus,
      validationMessage: typeof metadata?.validationMessage === 'string' ? metadata.validationMessage : null,
      scopes: readJsonStringArray(record.scopesJson),
      secretPreview: typeof metadata?.secretPreview === 'string' ? metadata.secretPreview : null,
      lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
      disabledAt: record.disabledAt?.toISOString() ?? null,
      revokedAt: record.revokedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private buildOwnerBreakdown(items: ProviderCredentialSummary[]): ProviderCredentialOwnerBreakdown {
    const breakdown = createOwnerBreakdown();

    for (const item of items) {
      breakdown[item.ownerType] += 1;
    }

    return breakdown;
  }

  private buildStatusBreakdown(items: ProviderCredentialSummary[]): ProviderCredentialStatusBreakdown {
    const breakdown = createStatusBreakdown();

    for (const item of items) {
      breakdown[item.validationStatus] += 1;
    }

    return breakdown;
  }

  private buildProviderBreakdown(items: ProviderCredentialSummary[]): ProviderCredentialProviderBreakdown[] {
    return providerRegistry.map((provider) => {
      const providerItems = items.filter((item) => item.provider === provider.provider);

      return {
        provider: provider.provider,
        displayName: provider.displayName,
        availability: provider.availability,
        totalCredentials: providerItems.length,
        ownerBreakdown: this.buildOwnerBreakdown(providerItems),
        statusBreakdown: this.buildStatusBreakdown(providerItems),
      };
    });
  }

  private assertPolicyAllowsCredentialManagement(
    policy: ProviderCredentialInventory['policy'],
    ownerType: CredentialOwnerType,
    provider: AiProvider,
    action: 'create' | 'rotate',
  ): void {
    if (!policy.allowBringYourOwnKey) {
      throw new ForbiddenException(
        policy.reason ?? 'Bring-your-own-key is disabled by the current AI provider policy.',
      );
    }

    if (policy.requireAdminApproval) {
      throw new ForbiddenException(
        policy.reason ?? 'Bring-your-own-key currently requires admin approval for this workspace.',
      );
    }

    if (ownerType === 'workspace' && !policy.allowWorkspaceSharedCredentials) {
      throw new ForbiddenException(
        policy.reason ?? 'Workspace-shared provider credentials are disabled by policy.',
      );
    }

    if (!policy.providers.includes(provider)) {
      throw new ForbiddenException(
        `Provider "${provider}" is not enabled by the current AI provider policy for ${action}.`,
      );
    }
  }

  private readProvider(provider?: AiProvider): AiProvider {
    if (!provider) {
      throw new BadRequestException('provider is required.');
    }

    if (!providerRegistry.some((entry) => entry.provider === provider)) {
      throw new BadRequestException(`Unsupported provider "${provider}".`);
    }

    return provider;
  }

  private readOwnerType(ownerType?: CredentialOwnerType): CredentialOwnerType {
    if (ownerType === 'user' || ownerType === 'workspace' || ownerType === 'platform') {
      return ownerType;
    }

    throw new BadRequestException('ownerType must be one of "user", "workspace", or "platform".');
  }

  private assertCanCreateCredential(
    session: CurrentSessionSnapshot,
    ownerType: CredentialOwnerType,
    workspaceId?: string,
  ): void {
    if (ownerType === 'platform') {
      const accessDecision = canManageAiProviders(session.principal);

      if (!accessDecision.allowed) {
        throw new ForbiddenException(accessDecision.reasons.join('; '));
      }

      return;
    }

    if (!workspaceId) {
      throw new BadRequestException('workspaceId is required for user and workspace credentials.');
    }

    const accessDecision = canWriteProviderCredentials(session.principal, workspaceId);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    if (ownerType === 'workspace') {
      const workspaceMembership = session.workspaces.find((entry) => entry.id === workspaceId) ?? null;

      if (!workspaceMembership || (workspaceMembership.role !== 'workspace_owner' && workspaceMembership.role !== 'workspace_admin')) {
        throw new ForbiddenException('Workspace credentials require workspace owner or admin access.');
      }
    }
  }

  private assertCanRotateCredential(session: CurrentSessionSnapshot, record: ProviderCredentialRecord): void {
    if (record.ownerType === 'platform') {
      const accessDecision = canManageAiProviders(session.principal);

      if (!accessDecision.allowed) {
        throw new ForbiddenException(accessDecision.reasons.join('; '));
      }

      return;
    }

    if (record.userId && record.userId !== session.user.id && !canManageAiProviders(session.principal).allowed) {
      throw new ForbiddenException('You cannot manage provider credentials owned by another user.');
    }

    const workspaceId = record.workspaceId ?? session.workspaces[0]?.id;

    if (!workspaceId) {
      throw new ForbiddenException('Provider credential is not attached to an accessible workspace.');
    }

    const rotateDecision = canRotateProviderCredentials(session.principal, workspaceId);

    if (!rotateDecision.allowed) {
      throw new ForbiddenException(rotateDecision.reasons.join('; '));
    }

    if (record.ownerType === 'workspace') {
      const workspaceMembership = session.workspaces.find((entry) => entry.id === workspaceId) ?? null;

      if (!workspaceMembership || (workspaceMembership.role !== 'workspace_owner' && workspaceMembership.role !== 'workspace_admin')) {
        throw new ForbiddenException('Workspace credentials require workspace owner or admin access.');
      }
    }
  }
}
