import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDefaultAiAccessPolicy } from '@quizmind/providers';
import { type AiProviderPolicySnapshot } from '@quizmind/contracts';

import { type CurrentSessionSnapshot } from '../src/auth/auth.types';
import { AiProxyRepository } from '../src/ai/ai-proxy.repository';
import { AiProxyService } from '../src/ai/ai-proxy.service';
import { type AiProviderPolicyService } from '../src/providers/ai-provider-policy.service';

function createSession(): CurrentSessionSnapshot {
  return {
    personaKey: 'connected-user',
    personaLabel: 'Connected User',
    notes: [],
    user: {
      id: 'user_1',
      email: 'owner@quizmind.dev',
      displayName: 'Workspace Owner',
      emailVerifiedAt: '2026-03-24T12:00:00.000Z',
    },
    principal: {
      userId: 'user_1',
      email: 'owner@quizmind.dev',
      systemRoles: [],
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
      mode: 'platform_only',
      providers: ['openrouter'],
      defaultProvider: 'openrouter',
      defaultModel: 'openrouter/auto',
    }),
    ...overrides,
  };
}

function createService(
  repositoryOverrides?: Partial<AiProxyRepository>,
  policyOverrides?: Partial<AiProviderPolicySnapshot>,
) {
  const repository: Partial<AiProxyRepository> = {
    findUsageLimit: async () => 5,
    findActiveQuotaCounter: async () =>
      ({
        id: 'quota_1',
        workspaceId: 'ws_1',
        key: 'limit.requests_per_day',
        consumed: 1,
        periodStart: new Date('2026-03-24T00:00:00.000Z'),
        periodEnd: new Date('2026-03-25T00:00:00.000Z'),
        createdAt: new Date('2026-03-24T00:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
      }) as any,
    findBestUserCredential: async () => null,
    recordProxyEvent: async () =>
      ({
        id: 'quota_1',
        workspaceId: 'ws_1',
        key: 'limit.requests_per_day',
        consumed: 2,
        periodStart: new Date('2026-03-24T00:00:00.000Z'),
        periodEnd: new Date('2026-03-25T00:00:00.000Z'),
        createdAt: new Date('2026-03-24T00:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:01:00.000Z'),
      }) as any,
    ...repositoryOverrides,
  };
  const aiProviderPolicyService: Partial<AiProviderPolicyService> = {
    resolvePolicyForWorkspace: async () => createPolicy(policyOverrides),
  };
  const service = new AiProxyService(
    aiProviderPolicyService as AiProviderPolicyService,
    repository as AiProxyRepository,
  );

  (service as any).env = {
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
    openRouterApiUrl: 'https://openrouter.ai/api/v1',
    openRouterApiKey: 'sk-or-test_123456789',
    openRouterAppName: 'QuizMind Test',
    openRouterTimeoutMs: 30000,
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

test('AiProxyService proxies via platform key and increments quota', async (t) => {
  let recordInput: unknown;
  const { service } = createService({
    recordProxyEvent: async (input: any) => {
      recordInput = input;

      return {
        id: 'quota_1',
        workspaceId: 'ws_1',
        key: 'limit.requests_per_day',
        consumed: 2,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      } as any;
    },
  });
  const previousFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        id: 'gen_1',
        model: 'openrouter/auto',
        usage: {
          prompt_tokens: 12,
          completion_tokens: 18,
          total_tokens: 30,
        },
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello!',
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      },
    )) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const result = await service.proxyForCurrentSession(createSession(), {
    model: 'openrouter/auto',
    messages: [
      {
        role: 'user',
        content: 'Hello!',
      },
    ],
  });

  assert.equal(result.provider, 'openrouter');
  assert.equal(result.keySource, 'platform');
  assert.equal(result.usage?.totalTokens, 30);
  assert.equal(result.quota.decremented, true);
  assert.equal(result.quota.consumed, 2);
  assert.equal(result.response.id, 'gen_1');
  assert.equal((recordInput as any).consumeQuota, true);
});

test('AiProxyService rejects BYOK requests when policy disables BYOK', async (t) => {
  const { service } = createService(undefined, {
    ...buildDefaultAiAccessPolicy({
      mode: 'platform_only',
      providers: ['openrouter'],
      defaultProvider: 'openrouter',
    }),
    allowBringYourOwnKey: false,
  });
  let fetchCalled = false;
  const previousFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  await assert.rejects(
    () =>
      service.proxyForCurrentSession(createSession(), {
        model: 'openrouter/auto',
        useOwnKey: true,
        messages: [
          {
            role: 'user',
            content: 'Hello!',
          },
        ],
    }),
    /Bring-your-own-key is disabled/i,
  );
  assert.equal(fetchCalled, false);
});

test('AiProxyService blocks proxy calls when requests-per-day quota is exhausted', async (t) => {
  const { service } = createService({
    findUsageLimit: async () => 1,
    findActiveQuotaCounter: async () =>
      ({
        id: 'quota_1',
        workspaceId: 'ws_1',
        key: 'limit.requests_per_day',
        consumed: 1,
        periodStart: new Date('2026-03-24T00:00:00.000Z'),
        periodEnd: new Date('2026-03-25T00:00:00.000Z'),
        createdAt: new Date('2026-03-24T00:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
      }) as any,
  });
  let fetchCalled = false;
  const previousFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  await assert.rejects(
    () =>
      service.proxyForCurrentSession(createSession(), {
        model: 'openrouter/auto',
        messages: [
          {
            role: 'user',
            content: 'Hello!',
          },
        ],
    }),
    /quota has been exhausted/i,
  );
  assert.equal(fetchCalled, false);
});
