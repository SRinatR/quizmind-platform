import assert from 'node:assert/strict';
import test from 'node:test';

import { type CurrentSessionSnapshot } from '../src/auth/auth.types';
import { AiProviderPolicyService } from '../src/providers/ai-provider-policy.service';
import { type AiProviderPolicyRepository } from '../src/providers/ai-provider-policy.repository';

function createSession(): CurrentSessionSnapshot {
  return {
    personaKey: 'connected-user',
    personaLabel: 'Connected User',
    notes: [],
    user: {
      id: 'user_1',
      email: 'admin@quizmind.dev',
      displayName: 'Platform Admin',
      emailVerifiedAt: '2026-03-24T12:00:00.000Z',
    },
    principal: {
      userId: 'user_1',
      email: 'admin@quizmind.dev',
      systemRoles: ['platform_admin'],
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_owner' }],
      entitlements: [],
      featureFlags: [],
    },
    workspaces: [
      {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
        role: 'workspace_owner',
      },
    ],
    permissions: ['ai_providers:manage', 'credentials:write', 'credentials:rotate'],
  };
}

function createService(overrides?: Partial<AiProviderPolicyRepository>) {
  const repository: Partial<AiProviderPolicyRepository> = {
    findGlobal: async () => null,
    findByWorkspaceId: async () => null,
    listHistory: async () => ({ records: [], actors: [] }),
    upsertWithLogs: async (input: any) =>
      ({
        id: 'policy_1',
        scopeKey: input.scopeKey,
        scopeType: input.scopeType,
        workspaceId: input.workspaceId ?? null,
        mode: input.mode,
        allowPlatformManaged: input.allowPlatformManaged,
        allowBringYourOwnKey: input.allowBringYourOwnKey,
        allowDirectProviderMode: input.allowDirectProviderMode,
        allowWorkspaceSharedCredentials: input.allowWorkspaceSharedCredentials,
        requireAdminApproval: input.requireAdminApproval,
        allowVisionOnUserKeys: input.allowVisionOnUserKeys,
        providersJson: input.providersJson,
        allowedModelTagsJson: input.allowedModelTagsJson ?? [],
        defaultProvider: input.defaultProvider ?? null,
        defaultModel: input.defaultModel ?? null,
        reason: input.reason ?? null,
        updatedById: input.updatedById ?? null,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      }) as any,
    deleteWorkspaceOverrideWithLogs: async () => null,
    ...overrides,
  };

  return {
    repository,
    service: new AiProviderPolicyService(repository as AiProviderPolicyRepository),
  };
}

test('AiProviderPolicyService.resolvePolicyForWorkspace falls back to the global platform-only default', async () => {
  const { service } = createService();

  const policy = await service.resolvePolicyForWorkspace('ws_1');

  assert.equal(policy.scopeType, 'global');
  assert.equal(policy.scopeKey, 'global');
  assert.equal(policy.mode, 'platform_only');
  assert.equal(policy.allowBringYourOwnKey, false);
  assert.equal(policy.defaultProvider, 'openrouter');
});

test('AiProviderPolicyService.updatePolicyForCurrentSession persists a workspace-scoped override', async () => {
  let upsertInput: any;
  const { service } = createService({
    upsertWithLogs: async (input: any) => {
      upsertInput = input;

      return {
        id: 'policy_ws_1',
        scopeKey: input.scopeKey,
        scopeType: input.scopeType,
        workspaceId: input.workspaceId ?? null,
        mode: input.mode,
        allowPlatformManaged: input.allowPlatformManaged,
        allowBringYourOwnKey: input.allowBringYourOwnKey,
        allowDirectProviderMode: input.allowDirectProviderMode,
        allowWorkspaceSharedCredentials: input.allowWorkspaceSharedCredentials,
        requireAdminApproval: input.requireAdminApproval,
        allowVisionOnUserKeys: input.allowVisionOnUserKeys,
        providersJson: input.providersJson,
        allowedModelTagsJson: input.allowedModelTagsJson ?? [],
        defaultProvider: input.defaultProvider ?? null,
        defaultModel: input.defaultModel ?? null,
        reason: input.reason ?? null,
        updatedById: input.updatedById ?? null,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      } as any;
    },
  });

  const result = await service.updatePolicyForCurrentSession(createSession(), {
    workspaceId: 'ws_1',
    mode: 'user_key_optional',
    providers: ['openrouter', 'openai'],
    defaultProvider: 'openai',
    defaultModel: 'gpt-4.1-mini',
    allowWorkspaceSharedCredentials: true,
    allowVisionOnUserKeys: true,
    allowedModelTags: ['vision', 'text'],
    reason: 'Workspace override for premium provider access.',
  });

  assert.equal(upsertInput.scopeKey, 'workspace:ws_1');
  assert.equal(upsertInput.scopeType, 'workspace');
  assert.equal(upsertInput.allowBringYourOwnKey, true);
  assert.equal(upsertInput.allowWorkspaceSharedCredentials, true);
  assert.equal(upsertInput.auditLog.eventType, 'ai_provider_policy.updated');
  assert.equal(result.policy.scopeType, 'workspace');
  assert.equal(result.policy.defaultProvider, 'openai');
  assert.deepEqual(result.policy.allowedModelTags, ['text', 'vision']);
});

test('AiProviderPolicyService.updatePolicyForCurrentSession denies users without ai provider permissions', async () => {
  const session = {
    ...createSession(),
    principal: {
      ...createSession().principal,
      systemRoles: [],
    },
    permissions: [],
  };
  const { service } = createService();

  await assert.rejects(
    () => service.updatePolicyForCurrentSession(session, { mode: 'platform_only' }),
    /Missing permission: ai_providers:manage/,
  );
});

test('AiProviderPolicyService.listHistoryForCurrentSession returns combined global and workspace history entries', async () => {
  const { service } = createService({
    listHistory: async () => ({
      records: [
        {
          id: 'audit_ws_1',
          workspaceId: 'ws_1',
          actorId: 'user_1',
          action: 'ai_provider_policy.reset',
          targetId: 'workspace:ws_1',
          metadataJson: {
            scopeKey: 'workspace:ws_1',
            scopeType: 'workspace',
            workspaceId: 'ws_1',
            previousMode: 'user_key_optional',
            previousProviders: ['openrouter', 'openai'],
          },
          createdAt: new Date('2026-03-24T14:00:00.000Z'),
        },
        {
          id: 'audit_global_1',
          workspaceId: null,
          actorId: 'user_1',
          action: 'ai_provider_policy.updated',
          targetId: 'global',
          metadataJson: {
            scopeKey: 'global',
            scopeType: 'global',
            mode: 'platform_only',
            providers: ['openrouter'],
          },
          createdAt: new Date('2026-03-24T13:00:00.000Z'),
        },
      ] as any,
      actors: [
        {
          id: 'user_1',
          email: 'admin@quizmind.dev',
          displayName: 'Platform Admin',
        },
      ] as any,
    }),
  });

  const history = await service.listHistoryForCurrentSession(createSession(), 'ws_1');

  assert.equal(history.length, 2);
  assert.equal(history[0]?.eventType, 'ai_provider_policy.reset');
  assert.match(history[0]?.summary ?? '', /reset/i);
  assert.equal(history[0]?.actor?.email, 'admin@quizmind.dev');
  assert.equal(history[1]?.scopeType, 'global');
  assert.deepEqual(history[1]?.providers, ['openrouter']);
});

test('AiProviderPolicyService.resetPolicyForCurrentSession removes a workspace override and returns inherited policy', async () => {
  let deletedScopeKey: string | null = null;
  let workspaceOverrideExists = true;
  const { service } = createService({
    findByWorkspaceId: async () =>
      workspaceOverrideExists
        ? ({
            id: 'policy_ws_1',
            scopeKey: 'workspace:ws_1',
            scopeType: 'workspace',
            workspaceId: 'ws_1',
            mode: 'user_key_optional',
            allowPlatformManaged: true,
            allowBringYourOwnKey: true,
            allowDirectProviderMode: false,
            allowWorkspaceSharedCredentials: true,
            requireAdminApproval: false,
            allowVisionOnUserKeys: false,
            providersJson: ['openrouter', 'openai'],
            allowedModelTagsJson: ['text'],
            defaultProvider: 'openai',
            defaultModel: 'gpt-4.1-mini',
            reason: 'Workspace override',
            updatedById: 'user_1',
            createdAt: new Date('2026-03-24T12:00:00.000Z'),
            updatedAt: new Date('2026-03-24T12:00:00.000Z'),
          } as any)
        : null,
    deleteWorkspaceOverrideWithLogs: async (input: any) => {
      deletedScopeKey = input.scopeKey;
      workspaceOverrideExists = false;

      return {
        id: 'policy_ws_1',
        scopeKey: input.scopeKey,
        scopeType: 'workspace',
        workspaceId: 'ws_1',
        mode: 'user_key_optional',
        allowPlatformManaged: true,
        allowBringYourOwnKey: true,
        allowDirectProviderMode: false,
        allowWorkspaceSharedCredentials: true,
        requireAdminApproval: false,
        allowVisionOnUserKeys: false,
        providersJson: ['openrouter', 'openai'],
        allowedModelTagsJson: ['text'],
        defaultProvider: 'openai',
        defaultModel: 'gpt-4.1-mini',
        reason: 'Workspace override',
        updatedById: 'user_1',
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      } as any;
    },
    findGlobal: async () =>
      ({
        id: 'policy_global',
        scopeKey: 'global',
        scopeType: 'global',
        workspaceId: null,
        mode: 'platform_only',
        allowPlatformManaged: true,
        allowBringYourOwnKey: false,
        allowDirectProviderMode: false,
        allowWorkspaceSharedCredentials: false,
        requireAdminApproval: false,
        allowVisionOnUserKeys: false,
        providersJson: ['openrouter'],
        allowedModelTagsJson: [],
        defaultProvider: 'openrouter',
        defaultModel: 'openrouter/auto',
        reason: 'Global fallback',
        updatedById: 'user_1',
        createdAt: new Date('2026-03-24T11:00:00.000Z'),
        updatedAt: new Date('2026-03-24T11:00:00.000Z'),
      }) as any,
  });

  const result = await service.resetPolicyForCurrentSession(createSession(), {
    workspaceId: 'ws_1',
  });

  assert.equal(deletedScopeKey, 'workspace:ws_1');
  assert.equal(result.resetApplied, true);
  assert.equal(result.policy.scopeType, 'global');
  assert.equal(result.policy.allowBringYourOwnKey, false);
});
