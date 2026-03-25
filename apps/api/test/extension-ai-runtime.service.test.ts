import assert from 'node:assert/strict';
import test from 'node:test';

import { encryptSecret } from '@quizmind/secrets';

import { ExtensionAiRuntimeService } from '../src/extension/extension-ai-runtime.service';
import { type AiProviderPolicyService } from '../src/providers/ai-provider-policy.service';
import { type ProviderCredentialRepository } from '../src/providers/provider-credential.repository';
import { type QueueDispatchService } from '../src/queue/queue-dispatch.service';

function createService(options?: {
  resolveRuntimeCredential?: ProviderCredentialRepository['resolveRuntimeCredential'];
  policyOverrides?: Partial<Awaited<ReturnType<AiProviderPolicyService['resolvePolicyForWorkspace']>>>;
}) {
  const aiProviderPolicyService: Partial<AiProviderPolicyService> = {
    resolvePolicyForWorkspace: async () => ({
      scopeType: 'global',
      scopeKey: 'global',
      workspaceId: null,
      updatedById: null,
      createdAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
      mode: 'platform_only',
      allowPlatformManaged: true,
      allowBringYourOwnKey: false,
      allowDirectProviderMode: false,
      providers: ['openrouter'],
      defaultProvider: 'openrouter',
      defaultModel: 'openrouter/auto',
      ...(options?.policyOverrides ?? {}),
    }),
  };
  const providerCredentialRepository: Partial<ProviderCredentialRepository> = {
    resolveRuntimeCredential: options?.resolveRuntimeCredential ?? (async () => null),
  };
  const queueDispatchService: Partial<QueueDispatchService> = {
    dispatch: async () => ({
      id: 'job_1',
      queue: 'usage-events',
      dedupeKey: 'dedupe_1',
      createdAt: new Date().toISOString(),
      attempts: 0,
    }),
  };
  const service = new ExtensionAiRuntimeService(
    aiProviderPolicyService as AiProviderPolicyService,
    providerCredentialRepository as ProviderCredentialRepository,
    queueDispatchService as QueueDispatchService,
  );

  service['env'] = {
    providerCredentialSecret: 'provider-secret',
  } as any;

  return service;
}

const installationSession = {
  userId: 'user_1',
  installation: {
    installationId: 'inst_1',
    workspaceId: 'ws_1',
  },
} as any;

test('ExtensionAiRuntimeService uses user credential over workspace/platform fallback', async () => {
  const service = createService({
    resolveRuntimeCredential: async () => ({
      id: 'cred_user',
      provider: 'openrouter',
      ownerType: 'user',
      encryptedSecretJson: encryptSecret({ plaintext: 'sk-or-example123456', secret: 'provider-secret' }),
    } as any),
  });

  const result = await service.executeForInstallationSession(
    installationSession,
    {
      installationId: 'inst_1',
      prompt: 'What is 2 + 2?',
    },
    'answer',
  );

  assert.equal(result.installationId, 'inst_1');
  assert.equal(result.providerSelection.credentialOwnerType, 'user');
  assert.equal(result.operation, 'answer');
  assert.equal(result.metadata.simulated, true);
});

test('ExtensionAiRuntimeService falls back to simulated response without stored credentials', async () => {
  const service = createService();

  const result = await service.executeForInstallationSession(
    installationSession,
    {
      installationId: 'inst_1',
      prompt: 'Summarize this question',
    },
    'chat',
  );

  assert.equal(result.metadata.simulated, true);
  assert.match(result.answer, /handled chat server-side/i);
});

test('ExtensionAiRuntimeService rejects mismatched operation field', async () => {
  const service = createService();

  await assert.rejects(
    () =>
      service.executeForInstallationSession(
        installationSession,
        {
          installationId: 'inst_1',
          prompt: 'test',
          operation: 'multicheck',
        },
        'answer',
      ),
    /operation must match endpoint operation: answer/,
  );
});

test('ExtensionAiRuntimeService throws for failed OpenAI provider responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 502,
      json: async () => ({ error: 'provider unavailable' }),
    }) as Response) as typeof fetch;

  try {
    const service = createService({
      policyOverrides: {
        providers: ['openrouter', 'openai'],
        defaultProvider: 'openai',
      },
      resolveRuntimeCredential: async () => ({
        id: 'cred_openai',
        provider: 'openai',
        ownerType: 'user',
        encryptedSecretJson: encryptSecret({ plaintext: 'sk-test-openai-1234567890', secret: 'provider-secret' }),
      } as any),
    });

    await assert.rejects(
      () =>
        service.executeForInstallationSession(
          installationSession,
          {
            installationId: 'inst_1',
            prompt: 'test',
            requestedProvider: 'openai',
          },
          'chat',
        ),
      /Provider request failed with status 502/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
