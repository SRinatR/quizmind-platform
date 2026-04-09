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
  type UserApiKeyCreateRequest,
  type UserApiKeyCreateResult,
  type UserApiKeyDeleteResult,
  type UserApiKeyInventoryPayload,
  type UserApiKeySummary,
  type UserApiKeyTestResult,
} from '@quizmind/contracts';
import { createLogEvent, redactSecrets } from '@quizmind/logger';
import {
  getProviderCatalog,
  providerRegistry,
  validateProviderSecretShape,
} from '@quizmind/providers';
import { buildSecretMetadata, decryptSecret, encryptSecret, redactSecretValue, type EncryptedSecretEnvelope } from '@quizmind/secrets';

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

function normalizeLabel(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function readMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readKeyHintFromSecret(secret: string): string | null {
  const normalized = secret.trim();

  if (normalized.length === 0) {
    return null;
  }

  return normalized.slice(-4);
}

function readEncryptedSecretEnvelope(value: Prisma.JsonValue): EncryptedSecretEnvelope {
  const parsed = readJsonObject(value);

  if (!parsed) {
    throw new BadRequestException('Stored provider credential is malformed.');
  }

  const algorithm = parsed.algorithm;
  const keyVersion = parsed.keyVersion;
  const ciphertext = parsed.ciphertext;
  const iv = parsed.iv;
  const authTag = parsed.authTag;

  if (
    algorithm !== 'aes-256-gcm' ||
    keyVersion !== 'v1' ||
    typeof ciphertext !== 'string' ||
    typeof iv !== 'string' ||
    typeof authTag !== 'string'
  ) {
    throw new BadRequestException('Stored provider credential envelope is invalid.');
  }

  return {
    algorithm,
    keyVersion,
    ciphertext,
    iv,
    authTag,
  };
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

    const resolvedWorkspaceId = workspaceId?.trim() || undefined;
    const writeDecision = canWriteProviderCredentials(session.principal);
    const rotateDecision = canRotateProviderCredentials(session.principal);
    const items = await this.providerCredentialRepository.listForGovernance({
      workspaceId: resolvedWorkspaceId ?? '',
      includePlatform: true,
    });
    const mappedItems = items.map((item) => this.mapRecordToSummary(item));
    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace(resolvedWorkspaceId);
    const policyHistory = await this.aiProviderPolicyService.listHistoryForCurrentSession(session, resolvedWorkspaceId);

    return {
      accessDecision,
      writeDecision,
      rotateDecision,
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
  ): Promise<ProviderCredentialInventory> {
    const accessDecision = canReadProviderCredentials(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const includePlatform = canManageAiProviders(session.principal).allowed;
    const writeDecision = canWriteProviderCredentials(session.principal);
    const rotateDecision = canRotateProviderCredentials(session.principal);
    const items = await this.providerCredentialRepository.listAccessible({
      userId: session.user.id,
      includePlatform,
    });
    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace();

    return {
      accessDecision,
      writeDecision,
      rotateDecision,
      permissions: session.permissions,
      ...getProviderCatalog(),
      aiAccessPolicy: policy,
      policy,
      items: items.map((item) => this.mapRecordToSummary(item)),
    };
  }

  async createCredentialForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<ProviderCredentialCreateRequest>,
  ): Promise<ProviderCredentialMutationResult> {
    const provider = this.readProvider(request?.provider);
    const ownerType = this.readOwnerType(request?.ownerType);
    const workspace = null;

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
    const label = normalizeLabel(request?.label);
    const keyHint = readKeyHintFromSecret(secretValidation.normalizedSecret);
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
      ...(label ? { label } : {}),
      ...(keyHint ? { keyHint } : {}),
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

  async listUserApiKeysForCurrentSession(
    session: CurrentSessionSnapshot,
  ): Promise<UserApiKeyInventoryPayload> {
    const accessDecision = canReadProviderCredentials(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace();
    this.assertByokEnabledForUserApiKeys(policy);

    const items = await this.providerCredentialRepository.listAccessible({
      userId: session.user.id,
      includePlatform: false,
    });

    return {
      items: items
        .filter((item) => item.ownerType === 'user' && item.userId === session.user.id)
        .map((item) => this.mapProviderCredentialToUserApiKey(this.mapRecordToSummary(item))),
    };
  }

  async createUserApiKeyForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<UserApiKeyCreateRequest>,
  ): Promise<UserApiKeyCreateResult> {
    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace();
    this.assertByokEnabledForUserApiKeys(policy);

    const provider = this.readProvider(request?.provider);

    if (!policy.providers.includes(provider)) {
      throw new ForbiddenException(`Provider "${provider}" is not enabled by the current AI provider policy.`);
    }

    const result = await this.createCredentialForCurrentSession(session, {
      provider,
      ownerType: 'user',
      ownerId: session.user.id,
      label: request?.label,
      secret: request?.secret ?? '',
    });

    return {
      apiKey: this.mapProviderCredentialToUserApiKey(result.credential),
      ...(typeof result.validationMessage === 'string' ? { validationMessage: result.validationMessage } : {}),
    };
  }

  async deleteUserApiKeyForCurrentSession(
    session: CurrentSessionSnapshot,
    apiKeyId: string,
  ): Promise<UserApiKeyDeleteResult> {
    const credentialId = apiKeyId.trim();

    if (!credentialId) {
      throw new BadRequestException('id is required.');
    }

    const existing = await this.providerCredentialRepository.findById(credentialId);

    if (!existing) {
      throw new NotFoundException('User API key not found.');
    }

    this.assertUserApiKeyOwnership(session, existing);

    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace();
    this.assertByokEnabledForUserApiKeys(policy);

    const revoked = await this.revokeCredentialForCurrentSession(session, {
      credentialId: existing.id,
      reason: 'Deleted via /user/api-keys endpoint.',
    });

    return {
      apiKeyId: revoked.credentialId,
      deletedAt: revoked.revokedAt,
    };
  }

  async testUserApiKeyForCurrentSession(
    session: CurrentSessionSnapshot,
    apiKeyId: string,
  ): Promise<UserApiKeyTestResult> {
    const credentialId = apiKeyId.trim();

    if (!credentialId) {
      throw new BadRequestException('id is required.');
    }

    const existing = await this.providerCredentialRepository.findById(credentialId);

    if (!existing) {
      throw new NotFoundException('User API key not found.');
    }

    this.assertUserApiKeyOwnership(session, existing);
    this.assertCanRotateCredential(session, existing);

    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace(existing.workspaceId ?? undefined);
    this.assertPolicyAllowsCredentialManagement(policy, 'user', existing.provider as AiProvider, 'rotate');

    if (existing.revokedAt) {
      throw new BadRequestException('User API key is revoked and cannot be tested.');
    }

    const provider = this.readProvider(existing.provider as AiProvider);
    const decryptedSecret = this.decryptCredential(existing);
    const validation = validateProviderSecretShape(provider, decryptedSecret);
    const isValid = validation.valid && Boolean(validation.normalizedSecret);
    const occurredAt = new Date();
    const metadata = {
      ...(readJsonObject(existing.metadataJson) ?? {}),
      validationMode: 'shape_check',
      validationMessage: validation.reason ?? (isValid ? 'Provider secret shape check passed.' : 'Provider secret shape check failed.'),
      keyHint: readKeyHintFromSecret(validation.normalizedSecret ?? decryptedSecret),
      lastTestedAt: occurredAt.toISOString(),
    };
    const logMetadata = redactSecrets({
      provider,
      ownerType: existing.ownerType,
      ownerId: existing.ownerId ?? existing.workspaceId ?? existing.userId,
      workspaceId: existing.workspaceId,
      validationStatus: isValid ? 'valid' : 'invalid',
    });
    const auditLog = createLogEvent({
      category: 'audit',
      eventId: randomUUID(),
      eventType: 'provider_credential.tested',
      actorId: session.user.id,
      actorType: 'user',
      workspaceId: existing.workspaceId ?? undefined,
      targetType: 'provider_credential',
      targetId: existing.id,
      occurredAt: occurredAt.toISOString(),
      severity: isValid ? 'info' : 'warn',
      status: 'success',
      metadata: logMetadata,
    });
    const securityLog = createLogEvent({
      category: 'security',
      eventId: randomUUID(),
      eventType: 'provider_credential.validation_tested',
      actorId: session.user.id,
      actorType: 'user',
      workspaceId: existing.workspaceId ?? undefined,
      targetType: 'provider_credential',
      targetId: existing.id,
      occurredAt: occurredAt.toISOString(),
      severity: isValid ? 'info' : 'warn',
      status: 'success',
      metadata: logMetadata,
    });
    const updated = await this.providerCredentialRepository.validateWithLogs({
      credentialId: existing.id,
      validationStatus: isValid ? 'valid' : 'invalid',
      metadataJson: metadata as Prisma.InputJsonValue,
      lastValidatedAt: occurredAt,
      occurredAt,
      auditLog,
      securityLog,
      domainEventType: 'provider_credential.tested',
      domainPayload: {
        credentialId: existing.id,
        provider,
        ownerType: existing.ownerType,
        ownerId: existing.ownerId ?? existing.workspaceId ?? existing.userId,
        workspaceId: existing.workspaceId,
        validationStatus: isValid ? 'valid' : 'invalid',
      },
    });
    const summary = this.mapProviderCredentialToUserApiKey(this.mapRecordToSummary(updated));

    return {
      apiKey: summary,
      valid: isValid,
      ...(typeof summary.validationMessage === 'string' ? { validationMessage: summary.validationMessage } : {}),
      testedAt: occurredAt.toISOString(),
    };
  }

  private mapRecordToSummary(record: ProviderCredentialRecord): ProviderCredentialSummary {
    const metadata = readJsonObject(record.metadataJson);
    const ownerId = record.ownerId ?? record.workspaceId ?? record.userId ?? 'unknown';
    const secretPreview = readMetadataString(metadata, 'secretPreview');
    const keyHint = readMetadataString(metadata, 'keyHint') ?? (secretPreview ? secretPreview.slice(-4) : null);

    return {
      id: record.id,
      provider: record.provider as AiProvider,
      ownerType: record.ownerType as CredentialOwnerType,
      ownerId,
      userId: record.userId,
      workspaceId: record.workspaceId,
      label: readMetadataString(metadata, 'label'),
      keyHint,
      validationStatus: record.validationStatus,
      validationMessage: readMetadataString(metadata, 'validationMessage'),
      scopes: readJsonStringArray(record.scopesJson),
      secretPreview,
      lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
      disabledAt: record.disabledAt?.toISOString() ?? null,
      revokedAt: record.revokedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private mapProviderCredentialToUserApiKey(summary: ProviderCredentialSummary): UserApiKeySummary {
    return {
      id: summary.id,
      provider: summary.provider,
      workspaceId: summary.workspaceId ?? null,
      label: summary.label ?? null,
      keyHint: summary.keyHint ?? null,
      validationStatus: summary.validationStatus,
      validationMessage: summary.validationMessage ?? null,
      lastValidatedAt: summary.lastValidatedAt ?? null,
      revokedAt: summary.revokedAt ?? null,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
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

  private decryptCredential(record: ProviderCredentialRecord): string {
    return decryptSecret({
      envelope: readEncryptedSecretEnvelope(record.encryptedSecretJson),
      secret: this.env.providerCredentialSecret,
    });
  }

  private assertUserApiKeyOwnership(session: CurrentSessionSnapshot, record: ProviderCredentialRecord): void {
    if (record.ownerType !== 'user' || !record.userId || record.userId !== session.user.id) {
      throw new NotFoundException('User API key not found.');
    }
  }

  private assertByokEnabledForUserApiKeys(policy: ProviderCredentialInventory['policy']): void {
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
  }

  private assertPolicyAllowsCredentialManagement(
    policy: ProviderCredentialInventory['policy'],
    ownerType: CredentialOwnerType,
    provider: AiProvider,
    action: 'create' | 'rotate',
  ): void {
    this.assertByokEnabledForUserApiKeys(policy);

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

    const accessDecision = canWriteProviderCredentials(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
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

    const rotateDecision = canRotateProviderCredentials(session.principal);

    if (!rotateDecision.allowed) {
      throw new ForbiddenException(rotateDecision.reasons.join('; '));
    }
  }
}
