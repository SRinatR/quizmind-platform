import assert from 'node:assert/strict';
import test from 'node:test';

import { type AiProviderPolicySnapshot } from '@quizmind/contracts';
import { buildDefaultAiAccessPolicy } from '@quizmind/providers';
import { decryptSecret, type EncryptedSecretEnvelope } from '@quizmind/secrets';

import { type CurrentSessionSnapshot } from '../src/auth/auth.types';
import { type AiProviderPolicyService } from '../src/providers/ai-provider-policy.service';
import { ProviderCredentialService } from '../src/providers/provider-credential.service';
import { type ProviderCredentialRepository } from '../src/providers/provider-credential.repository';

function createSession(role: 'workspace_owner' | 'workspace_admin' | 'workspace_member' = 'workspace_owner'): CurrentSessionSnapshot {
  return {
    personaKey: 'connected-user',
    personaLabel: 'Connected User',
    notes: [],
    user: {
      id: 'user_1',
      email: 'owner@quizmind.dev',
      displayName: 'Workspace User',
      emailVerifiedAt: '2026-03-24T12:00:00.000Z',
    },
    principal: {
      userId: 'user_1',
      email: 'owner@quizmind.dev',
      systemRoles: [],
      workspaceMemberships: [{ workspaceId: 'ws_1', role }],
      entitlements: [],
      featureFlags: [],
    },
    workspaces: [
      {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
        role,
      },
    ],
    permissions: [],
  };
}

function createPolicy(overrides?: Partial<AiProviderPolicySnapshot>): AiProviderPolicySnapshot {
  return {
    scopeType: 'workspace',
    scopeKey: 'workspace:ws_1',
    workspaceId: 'ws_1',
    updatedById: 'user_1',
    createdAt: '2026-03-24T12:00:00.000Z',
    updatedAt: '2026-03-24T12:00:00.000Z',
    ...buildDefaultAiAccessPolicy({
      mode: 'user_key_optional',
      providers: ['openrouter', 'openai'],
      defaultProvider: 'openrouter',
      defaultModel: 'openrouter/auto',
      allowWorkspaceSharedCredentials: true,
      allowVisionOnUserKeys: true,
      reason: 'Workspace BYOK is enabled for this test policy.',
    }),
    ...overrides,
  };
}

function createService(
  overrides?: Partial<ProviderCredentialRepository>,
  policyOverrides?: Partial<AiProviderPolicySnapshot>,
) {
  const repository: Partial<ProviderCredentialRepository> = {
    listAccessible: async () => [],
    listForGovernance: async () => [],
    findById: async () => null,
    createWithLogs: async (input: any) =>
      ({
        id: 'cred_1',
        provider: input.provider,
        ownerType: input.ownerType,
        ownerId: input.ownerId ?? null,
        userId: input.userId ?? null,
        workspaceId: input.workspaceId ?? null,
        validationStatus: input.validationStatus,
        scopesJson: input.scopesJson ?? [],
        metadataJson: input.metadataJson ?? null,
        lastValidatedAt: input.lastValidatedAt ?? null,
        disabledAt: null,
        revokedAt: null,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      }) as any,
    rotateWithLogs: async (input: any) =>
      ({
        id: input.credentialId,
        provider: 'openrouter',
        ownerType: 'user',
        ownerId: 'user_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        validationStatus: input.validationStatus,
        scopesJson: input.scopesJson ?? [],
        metadataJson: input.metadataJson ?? null,
        lastValidatedAt: input.lastValidatedAt ?? null,
        disabledAt: null,
        revokedAt: null,
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: input.occurredAt,
      }) as any,
    revokeWithLogs: async (input: any) =>
      ({
        id: input.credentialId,
        provider: 'openrouter',
        ownerType: 'user',
        ownerId: 'user_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        validationStatus: input.validationStatus,
        scopesJson: ['chat'],
        metadataJson: input.metadataJson ?? null,
        lastValidatedAt: new Date('2026-03-24T12:00:00.000Z'),
        disabledAt: null,
        revokedAt: input.revokedAt,
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: input.occurredAt,
      }) as any,
    ...overrides,
  };
  const aiProviderPolicyService: Partial<AiProviderPolicyService> = {
    resolvePolicyForWorkspace: async () => createPolicy(policyOverrides),
    listHistoryForCurrentSession: async () => [
      {
        id: 'audit_1',
        eventType: 'ai_provider_policy.updated',
        summary: 'Workspace override updated to user_key_optional across openai, openrouter.',
        scopeType: 'workspace',
        scopeKey: 'workspace:ws_1',
        workspaceId: 'ws_1',
        actor: {
          id: 'user_1',
          email: 'owner@quizmind.dev',
          displayName: 'Workspace User',
        },
        occurredAt: '2026-03-24T12:00:00.000Z',
        mode: 'user_key_optional',
        providers: ['openai', 'openrouter'],
      },
    ],
  };
  const service = new ProviderCredentialService(
    aiProviderPolicyService as AiProviderPolicyService,
    repository as ProviderCredentialRepository,
  );

  service['env'] = {
    nodeEnv: 'test',
    appUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:4000',
    databaseUrl: 'postgresql://postgres:postgres@localhost:5432/quizmind',
    redisUrl: 'redis://localhost:6379',
    runtimeMode: 'connected',
    port: 4000,
    corsAllowedOrigins: ['http://localhost:3000'],
    jwtSecret: 'jwt-secret',
    jwtRefreshSecret: 'refresh-secret',
    extensionTokenSecret: 'extension-secret',
    extensionSessionTtlMinutes: 30,
    providerCredentialSecret: 'provider-secret',
    jwtIssuer: 'http://localhost:4000',
    jwtAudience: 'http://localhost:3000',
    emailProvider: 'noop',
    emailFrom: 'noreply@quizmind.local',
    billingProvider: 'stripe',
    stripeSecretKey: 'sk_test_secret',
    stripeWebhookSecret: 'whsec_test_secret',
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 120,
    authRateLimitWindowMs: 900000,
    authRateLimitMaxRequests: 10,
  };

  return {
    service,
    repository,
  };
}

test('ProviderCredentialService lists only credentials visible to the requested workspace', async () => {
  const session = createSession();
  let listInput: unknown;
  const { service } = createService({
    listAccessible: async (input) => {
      listInput = input;

      return [
        {
          id: 'cred_user_ws1',
          provider: 'openrouter',
          ownerType: 'user',
          ownerId: 'user_1',
          userId: 'user_1',
          workspaceId: 'ws_1',
          validationStatus: 'valid',
          scopesJson: ['chat'],
          metadataJson: { secretPreview: '******7890', validationMessage: 'Shape check passed.' },
          lastValidatedAt: new Date('2026-03-24T12:00:00.000Z'),
          disabledAt: null,
          revokedAt: null,
          createdAt: new Date('2026-03-24T12:00:00.000Z'),
          updatedAt: new Date('2026-03-24T12:05:00.000Z'),
        },
        {
          id: 'cred_user_ws2',
          provider: 'openai',
          ownerType: 'user',
          ownerId: 'user_1',
          userId: 'user_1',
          workspaceId: 'ws_2',
          validationStatus: 'valid',
          scopesJson: ['chat'],
          metadataJson: { secretPreview: '******9999', validationMessage: 'Shape check passed.' },
          lastValidatedAt: new Date('2026-03-24T12:00:00.000Z'),
          disabledAt: null,
          revokedAt: null,
          createdAt: new Date('2026-03-24T12:00:00.000Z'),
          updatedAt: new Date('2026-03-24T12:06:00.000Z'),
        },
      ] as any;
    },
  });

  const inventory = await service.listCredentialInventoryForCurrentSession(session, 'ws_1');

  assert.deepEqual(listInput, {
    userId: 'user_1',
    workspaceIds: ['ws_1'],
    includePlatform: false,
  });
  assert.equal(inventory.workspace?.id, 'ws_1');
  assert.equal(inventory.aiAccessPolicy.mode, 'user_key_optional');
  assert.equal(inventory.policy.allowWorkspaceSharedCredentials, true);
  assert.equal(inventory.items.length, 1);
  assert.equal(inventory.items[0]?.id, 'cred_user_ws1');
});

test('ProviderCredentialService.listAdminProviderGovernanceForCurrentSession returns platform and workspace governance breakdowns', async () => {
  const session = {
    ...createSession(),
    principal: {
      ...createSession().principal,
      systemRoles: ['platform_admin'],
    },
    permissions: ['ai_providers:manage', 'credentials:rotate', 'credentials:write'],
  };
  let governanceInput: unknown;
  const { service } = createService(
    {
      listForGovernance: async (input: any) => {
        governanceInput = input;

        return [
          {
            id: 'cred_platform_1',
            provider: 'openrouter',
            ownerType: 'platform',
            ownerId: 'platform',
            userId: null,
            workspaceId: null,
            validationStatus: 'valid',
            scopesJson: ['chat'],
            metadataJson: { secretPreview: '******7890', validationMessage: 'Shape check passed.' },
            lastValidatedAt: new Date('2026-03-24T12:00:00.000Z'),
            disabledAt: null,
            revokedAt: null,
            createdAt: new Date('2026-03-24T12:00:00.000Z'),
            updatedAt: new Date('2026-03-24T12:05:00.000Z'),
          },
          {
            id: 'cred_workspace_1',
            provider: 'openrouter',
            ownerType: 'workspace',
            ownerId: 'ws_1',
            userId: null,
            workspaceId: 'ws_1',
            validationStatus: 'revoked',
            scopesJson: ['vision'],
            metadataJson: { secretPreview: '******4567', validationMessage: 'Revoked.' },
            lastValidatedAt: new Date('2026-03-24T12:00:00.000Z'),
            disabledAt: null,
            revokedAt: new Date('2026-03-24T13:00:00.000Z'),
            createdAt: new Date('2026-03-24T12:00:00.000Z'),
            updatedAt: new Date('2026-03-24T13:00:00.000Z'),
          },
        ] as any;
      },
    },
    {
      ...createPolicy({
        scopeType: 'workspace',
        scopeKey: 'workspace:ws_1',
        workspaceId: 'ws_1',
      }),
      mode: 'admin_approved_user_key',
      requireAdminApproval: true,
      allowWorkspaceSharedCredentials: false,
      reason: 'Admin approval is required for workspace BYOK.',
    },
  );

  const snapshot = await service.listAdminProviderGovernanceForCurrentSession(session, 'ws_1');

  assert.deepEqual(governanceInput, {
    workspaceId: 'ws_1',
    includePlatform: true,
  });
  assert.equal(snapshot.workspace?.id, 'ws_1');
  assert.equal(snapshot.aiAccessPolicy.mode, 'admin_approved_user_key');
  assert.equal(snapshot.policy.requireAdminApproval, true);
  assert.equal(snapshot.policyHistory.length, 1);
  assert.equal(snapshot.ownerBreakdown.platform, 1);
  assert.equal(snapshot.ownerBreakdown.workspace, 1);
  assert.equal(snapshot.statusBreakdown.valid, 1);
  assert.equal(snapshot.statusBreakdown.revoked, 1);
  assert.equal(snapshot.providerBreakdown.find((entry) => entry.provider === 'openrouter')?.totalCredentials, 2);
});

test('ProviderCredentialService.listAdminProviderGovernanceForCurrentSession denies sessions without ai provider permissions', async () => {
  const { service } = createService();

  await assert.rejects(
    () => service.listAdminProviderGovernanceForCurrentSession(createSession(), 'ws_1'),
    /Missing permission: ai_providers:manage/,
  );
});

test('ProviderCredentialService.createCredentialForCurrentSession encrypts the provider secret before storing it', async () => {
  const session = createSession();
  let createInput: any;
  const { service } = createService({
    createWithLogs: async (input) => {
      createInput = input;

      return {
        id: 'cred_1',
        provider: input.provider,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        userId: input.userId,
        workspaceId: input.workspaceId,
        validationStatus: input.validationStatus,
        scopesJson: input.scopesJson,
        metadataJson: input.metadataJson,
        lastValidatedAt: input.lastValidatedAt,
        disabledAt: null,
        revokedAt: null,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      } as any;
    },
  });

  const result = await service.createCredentialForCurrentSession(session, {
    provider: 'openrouter',
    ownerType: 'user',
    workspaceId: 'ws_1',
    secret: 'sk-or-1234567890',
    scopes: ['chat', 'vision'],
  });

  const decryptedSecret = decryptSecret({
    envelope: createInput.encryptedSecretJson as EncryptedSecretEnvelope,
    secret: service['env'].providerCredentialSecret,
  });

  assert.equal(decryptedSecret, 'sk-or-1234567890');
  assert.equal(createInput.ownerType, 'user');
  assert.equal(createInput.userId, 'user_1');
  assert.equal(createInput.workspaceId, 'ws_1');
  assert.equal(createInput.auditLog.eventType, 'provider_credential.created');
  assert.equal(createInput.securityLog.eventType, 'provider_credential.secret_added');
  assert.equal(result.credential.secretPreview?.endsWith('7890'), true);
  assert.deepEqual(result.credential.scopes, ['chat', 'vision']);
});

test('ProviderCredentialService blocks workspace-shared credentials for non-admin workspace members', async () => {
  const session = createSession('workspace_member');
  const { service } = createService();

  await assert.rejects(
    () =>
      service.createCredentialForCurrentSession(session, {
        provider: 'openrouter',
        ownerType: 'workspace',
        workspaceId: 'ws_1',
        secret: 'sk-or-1234567890',
      }),
    /Workspace credentials require workspace owner or admin access\./,
  );
});

test('ProviderCredentialService.rotateCredentialForCurrentSession re-encrypts and logs credential rotation', async () => {
  const session = createSession();
  let rotateInput: any;
  const { service } = createService({
    findById: async () =>
      ({
        id: 'cred_1',
        provider: 'openrouter',
        ownerType: 'user',
        ownerId: 'user_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        validationStatus: 'valid',
        scopesJson: ['chat'],
        metadataJson: { secretPreview: '******7890' },
        lastValidatedAt: new Date('2026-03-24T12:00:00.000Z'),
        disabledAt: null,
        revokedAt: null,
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:01:00.000Z'),
      }) as any,
    rotateWithLogs: async (input) => {
      rotateInput = input;

      return {
        id: 'cred_1',
        provider: 'openrouter',
        ownerType: 'user',
        ownerId: 'user_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        validationStatus: input.validationStatus,
        scopesJson: input.scopesJson,
        metadataJson: input.metadataJson,
        lastValidatedAt: input.lastValidatedAt,
        disabledAt: null,
        revokedAt: null,
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: input.occurredAt,
      } as any;
    },
  });

  const result = await service.rotateCredentialForCurrentSession(session, {
    credentialId: 'cred_1',
    secret: 'sk-or-0987654321',
    scopes: ['vision'],
  });

  const decryptedSecret = decryptSecret({
    envelope: rotateInput.encryptedSecretJson as EncryptedSecretEnvelope,
    secret: service['env'].providerCredentialSecret,
  });

  assert.equal(decryptedSecret, 'sk-or-0987654321');
  assert.equal(rotateInput.auditLog.eventType, 'provider_credential.rotated');
  assert.equal(rotateInput.securityLog.eventType, 'provider_credential.secret_rotated');
  assert.deepEqual(result.credential.scopes, ['vision']);
});

test('ProviderCredentialService.revokeCredentialForCurrentSession marks a credential as revoked', async () => {
  const session = createSession();
  let revokeInput: any;
  const { service } = createService({
    findById: async () =>
      ({
        id: 'cred_1',
        provider: 'openrouter',
        ownerType: 'user',
        ownerId: 'user_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        validationStatus: 'valid',
        scopesJson: ['chat'],
        metadataJson: { secretPreview: '******7890' },
        lastValidatedAt: new Date('2026-03-24T12:00:00.000Z'),
        disabledAt: null,
        revokedAt: null,
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:01:00.000Z'),
      }) as any,
    revokeWithLogs: async (input) => {
      revokeInput = input;

      return {
        id: 'cred_1',
        provider: 'openrouter',
        ownerType: 'user',
        ownerId: 'user_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        validationStatus: input.validationStatus,
        scopesJson: ['chat'],
        metadataJson: input.metadataJson,
        lastValidatedAt: new Date('2026-03-24T12:00:00.000Z'),
        disabledAt: null,
        revokedAt: input.revokedAt,
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: input.occurredAt,
      } as any;
    },
  });

  const result = await service.revokeCredentialForCurrentSession(session, {
    credentialId: 'cred_1',
    reason: 'rotated upstream',
  });

  assert.equal(revokeInput.validationStatus, 'revoked');
  assert.equal(revokeInput.auditLog.eventType, 'provider_credential.revoked');
  assert.equal(revokeInput.securityLog.eventType, 'provider_credential.secret_revoked');
  assert.match(result.revokedAt, /^2026-/);
});
