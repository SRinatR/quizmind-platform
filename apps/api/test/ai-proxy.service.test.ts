import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDefaultAiAccessPolicy } from '@quizmind/providers';
import { type AiProviderPolicySnapshot } from '@quizmind/contracts';
import { encryptSecret } from '@quizmind/secrets';

import { type CurrentSessionSnapshot } from '../src/auth/auth.types';
import { AiProxyRepository } from '../src/ai/ai-proxy.repository';
import { AiProxyService } from '../src/ai/ai-proxy.service';
import { type OpenRouterCatalogService } from '../src/ai/openrouter-catalog.service';
import { normalizeRouterAiCatalogPayload, type RouterAiCatalogService } from '../src/ai/routerai-catalog.service';
import { type AiHistoryService } from '../src/history/ai-history.service';
import { type AiProviderPolicyService } from '../src/providers/ai-provider-policy.service';
import { type WalletRepository } from '../src/wallet/wallet.repository';
import { type AiPricingService } from '../src/ai/ai-pricing.service';

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
  overrides?: {
    walletRepository?: Partial<WalletRepository>;
    aiPricingService?: Partial<AiPricingService>;
  },
) {
  const repository: Partial<AiProxyRepository> = {
    findWorkspacePlanCode: async () => 'pro',
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
    findLatestPlatformCredential: async () => null,
    recordProxyFailure: async () => undefined,
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
  const aiHistoryService: Partial<AiHistoryService> = {
    persistContent: async () => undefined,
  };
  const openRouterCatalogService: Partial<OpenRouterCatalogService> = {
    getLiveModels: async () => [],
  };
  const routerAiCatalogService: Partial<RouterAiCatalogService> = {
    getLiveModels: async () => [],
  };
  const walletRepository: Partial<WalletRepository> = {
    findBalanceForUser: async () => 1000,
    findOrCreateWalletForUser: async () => ({
      id: 'wallet_1',
      userId: 'user_1',
      currency: 'RUB',
      balanceKopecks: 1000,
      createdAt: new Date('2026-03-24T12:00:00.000Z'),
      updatedAt: new Date('2026-03-24T12:00:00.000Z'),
    }),
    debitUsage: async () => ({
      ledgerEntryId: 'ledger_1',
      newBalanceKopecks: 900,
      alreadyProcessed: false,
    }),
    ...overrides?.walletRepository,
  };
  const aiPricingService: Partial<AiPricingService> = {
    getEffectivePolicy: async () => ({
      enabled: false,
      markupPercent: 25,
      minimumFeeUsd: 0.0005,
      roundingUsd: 0.000001,
      maxChargeUsd: null,
      chargeFailedRequests: 'never',
      chargeUserKeyRequests: 'platform_fee_only',
      displayEstimatedPriceToUser: false,
    }),
    calculate: async () => ({
      providerCostUsd: 0,
      platformFeeUsd: 0,
      chargedCostUsd: 0,
      pricingSource: 'estimated',
      policySnapshot: {
        enabled: false,
        markupPercent: 25,
        minimumFeeUsd: 0.0005,
        roundingUsd: 0.000001,
        maxChargeUsd: null,
        chargeFailedRequests: 'never',
        chargeUserKeyRequests: 'platform_fee_only',
        displayEstimatedPriceToUser: false,
      },
      chargeable: false,
      reason: 'pricing_disabled',
    }),
    ...overrides?.aiPricingService,
  };
  const service = new AiProxyService(
    aiProviderPolicyService as AiProviderPolicyService,
    repository as AiProxyRepository,
    aiHistoryService as AiHistoryService,
    openRouterCatalogService as OpenRouterCatalogService,
    routerAiCatalogService as RouterAiCatalogService,
    walletRepository as WalletRepository,
    aiPricingService as AiPricingService,
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
    platformAiProvider: 'openrouter',
    routerAiApiUrl: 'https://routerai.ru/api/v1',
    routerAiApiKey: 'routerai-test_123456789',
    routerAiTimeoutMs: 30000,
    polzaApiUrl: 'https://api.polza.ai/v1',
    polzaApiKey: undefined,
    polzaTimeoutMs: 30000,
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
  assert.equal(typeof (recordInput as any).durationMs, 'number');
  assert.ok((recordInput as any).durationMs >= 0);
});

test('AiProxyService falls back to persisted platform credential when env key is missing', async (t) => {
  let observedAuthorization = '';
  const credentialEnvelope = encryptSecret({
    plaintext: 'sk-or-persisted_987654321',
    secret: 'provider-secret',
  });
  const { service } = createService({
    findLatestPlatformCredential: async () =>
      ({
        id: 'cred_platform_1',
        provider: 'openrouter',
        ownerType: 'platform',
        ownerId: 'platform',
        userId: null,
        workspaceId: null,
        encryptedSecretJson: credentialEnvelope,
        createdAt: new Date('2026-03-24T10:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
      }) as any,
  });
  (service as any).env.openRouterApiKey = undefined;
  const previousFetch = globalThis.fetch;

  globalThis.fetch = (async (_url, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    observedAuthorization = headers?.Authorization ?? headers?.authorization ?? '';

    return new Response(
      JSON.stringify({
        id: 'gen_credential_1',
        model: 'openrouter/auto',
        usage: {
          prompt_tokens: 3,
          completion_tokens: 4,
          total_tokens: 7,
        },
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hi.',
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
    );
  }) as typeof fetch;
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
  assert.match(observedAuthorization, /^Bearer sk-or-persisted_/);
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

test('AiProxyService routes direct OpenAI BYOK requests when direct provider mode is enabled', async (t) => {
  let recordInput: unknown;
  let observedUrl = '';
  let observedAuthorization = '';
  const credentialEnvelope = encryptSecret({
    plaintext: 'sk-openai-test_123456789',
    secret: 'provider-secret',
  });
  const { service } = createService({
    findWorkspacePlanCode: async () => 'pro',
    findBestUserCredential: async () =>
      ({
        id: 'cred_openai_1',
        provider: 'openai',
        ownerType: 'user',
        ownerId: null,
        userId: 'user_1',
        workspaceId: 'ws_1',
        encryptedSecretJson: credentialEnvelope,
        createdAt: new Date('2026-03-24T10:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
      }) as any,
    recordProxyEvent: async (input: any) => {
      recordInput = input;

      return {
        id: 'quota_1',
        workspaceId: 'ws_1',
        key: 'limit.requests_per_day',
        consumed: 1,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      } as any;
    },
  }, {
    mode: 'user_key_optional',
    providers: ['openrouter', 'openai'],
    defaultProvider: 'openai',
    allowBringYourOwnKey: true,
    allowDirectProviderMode: true,
    allowVisionOnUserKeys: true,
  });
  const previousFetch = globalThis.fetch;

  globalThis.fetch = (async (url, init) => {
    observedUrl = String(url);
    const headers = init?.headers as Record<string, string> | undefined;
    observedAuthorization = headers?.Authorization ?? headers?.authorization ?? '';

    return new Response(
      JSON.stringify({
        id: 'chatcmpl_openai_1',
        model: 'gpt-4.1-mini',
        usage: {
          prompt_tokens: 9,
          completion_tokens: 6,
          total_tokens: 15,
        },
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello from OpenAI.',
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
    );
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const result = await service.proxyForCurrentSession(createSession(), {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    useOwnKey: true,
    messages: [
      {
        role: 'user',
        content: 'Hello!',
      },
    ],
  });

  assert.equal(result.provider, 'openai');
  assert.equal(result.keySource, 'user');
  assert.equal(result.usage?.totalTokens, 15);
  assert.equal(result.quota.decremented, false);
  assert.equal((recordInput as any).consumeQuota, false);
  assert.match(observedUrl, /^https:\/\/api\.openai\.com\/v1\/chat\/completions$/);
  assert.match(observedAuthorization, /^Bearer sk-openai-test_/);
});

test('AiProxyService routes direct Polza BYOK requests and normalizes polza model ids', async (t) => {
  let recordInput: unknown;
  let observedUrl = '';
  let observedAuthorization = '';
  let observedBody: Record<string, unknown> | null = null;
  const credentialEnvelope = encryptSecret({
    plaintext: 'plza_test_1234567890',
    secret: 'provider-secret',
  });
  const { service } = createService({
    findWorkspacePlanCode: async () => 'pro',
    findBestUserCredential: async () =>
      ({
        id: 'cred_polza_1',
        provider: 'polza',
        ownerType: 'user',
        ownerId: null,
        userId: 'user_1',
        workspaceId: 'ws_1',
        encryptedSecretJson: credentialEnvelope,
        createdAt: new Date('2026-03-24T10:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
      }) as any,
    recordProxyEvent: async (input: any) => {
      recordInput = input;

      return {
        id: 'quota_1',
        workspaceId: 'ws_1',
        key: 'limit.requests_per_day',
        consumed: 1,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      } as any;
    },
  }, {
    mode: 'user_key_optional',
    providers: ['openrouter', 'polza'],
    defaultProvider: 'polza',
    allowBringYourOwnKey: true,
    allowDirectProviderMode: true,
    allowVisionOnUserKeys: true,
  });
  const previousFetch = globalThis.fetch;

  globalThis.fetch = (async (url, init) => {
    observedUrl = String(url);
    const headers = init?.headers as Record<string, string> | undefined;
    observedAuthorization = headers?.Authorization ?? headers?.authorization ?? '';
    observedBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;

    return new Response(
      JSON.stringify({
        id: 'chatcmpl_polza_1',
        model: 'gpt-4o-mini',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello from Polza.',
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
    );
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const result = await service.proxyForCurrentSession(createSession(), {
    provider: 'polza',
    model: 'polza/gpt-4o-mini',
    useOwnKey: true,
    messages: [
      {
        role: 'user',
        content: 'Hello!',
      },
    ],
  });

  assert.equal(result.provider, 'polza');
  assert.equal(result.keySource, 'user');
  assert.equal(result.usage?.totalTokens, 18);
  assert.equal(result.quota.decremented, false);
  assert.equal((recordInput as any).consumeQuota, false);
  assert.match(observedUrl, /^https:\/\/api\.polza\.ai\/v1\/chat\/completions$/);
  assert.match(observedAuthorization, /^Bearer plza_test_/);
  assert.equal(observedBody?.model, 'gpt-4o-mini');
});

test('AiProxyService routes platform-managed RouterAI requests with RouterAI-safe body and headers', async (t) => {
  let recordInput: unknown;
  let observedUrl = '';
  let observedHeaders: Record<string, string> = {};
  let observedBody: Record<string, unknown> | null = null;
  const { service } = createService({
    findWorkspacePlanCode: async () => 'pro',
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
  }, {
    mode: 'platform_only',
    providers: ['routerai'],
    defaultProvider: 'routerai',
    defaultModel: 'openai/gpt-4o-mini',
    allowPlatformManaged: true,
    allowBringYourOwnKey: false,
    allowDirectProviderMode: false,
    allowVisionOnUserKeys: true,
  });
  const previousFetch = globalThis.fetch;

  globalThis.fetch = (async (url, init) => {
    observedUrl = String(url);
    observedHeaders = init?.headers as Record<string, string>;
    observedBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;

    return new Response(
      JSON.stringify({
        id: 'chatcmpl_routerai_1',
        model: 'openai/gpt-4o-mini',
        usage: {
          prompt_tokens: 11,
          completion_tokens: 13,
          total_tokens: 24,
        },
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello from RouterAI.',
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
    );
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const result = await service.proxyForCurrentSession(createSession(), {
    model: 'openai/gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 77,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this.' },
          { type: 'image_url', image_url: { url: 'https://example.test/image.png' } },
        ],
      },
    ],
  });

  assert.equal(result.provider, 'routerai');
  assert.equal(result.keySource, 'platform');
  assert.equal(result.usage?.totalTokens, 24);
  assert.equal(result.quota.decremented, true);
  assert.equal((recordInput as any).consumeQuota, true);
  assert.match(observedUrl, /^https:\/\/routerai\.ru\/api\/v1\/chat\/completions$/);
  assert.equal(observedHeaders.Authorization, 'Bearer routerai-test_123456789');
  assert.equal(observedHeaders['Content-Type'], 'application/json');
  assert.equal(observedHeaders['HTTP-Referer'], undefined);
  assert.equal(observedHeaders['X-OpenRouter-Title'], undefined);
  assert.equal(observedHeaders['X-Title'], undefined);
  assert.equal(observedBody?.model, 'openai/gpt-4o-mini');
  assert.equal(observedBody?.stream, false);
  assert.equal(observedBody?.temperature, 0.2);
  assert.equal(observedBody?.max_tokens, 77);
  assert.equal(observedBody?.max_completion_tokens, undefined);
  assert.equal(observedBody?.max_output_tokens, undefined);
  assert.deepEqual((observedBody?.messages as any[])[0]?.content?.[1], {
    type: 'image_url',
    image_url: { url: 'https://example.test/image.png' },
  });
});

test('AiProxyService rejects direct provider requests when allowDirectProviderMode is disabled', async (t) => {
  const { service } = createService(
    {
      findWorkspacePlanCode: async () => 'pro',
    },
    {
      mode: 'user_key_optional',
      providers: ['openrouter', 'openai'],
      defaultProvider: 'openai',
      allowBringYourOwnKey: true,
      allowDirectProviderMode: false,
    },
  );
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
        provider: 'openai',
        model: 'gpt-4.1-mini',
        useOwnKey: true,
        messages: [
          {
            role: 'user',
            content: 'Hello!',
          },
        ],
      }),
    /Direct provider mode is disabled/i,
  );
  assert.equal(fetchCalled, false);
});

test('AiProxyService enforces user_key_required mode for platform-managed requests', async (t) => {
  const { service } = createService(undefined, {
    mode: 'user_key_required',
    providers: ['openrouter'],
    defaultProvider: 'openrouter',
    allowBringYourOwnKey: true,
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
    /requires bring-your-own-key/i,
  );
  assert.equal(fetchCalled, false);
});

test('AiProxyService blocks vision models for BYOK when allowVisionOnUserKeys is disabled', async (t) => {
  const { service } = createService(
    {
      findWorkspacePlanCode: async () => 'pro',
    },
    {
      mode: 'user_key_optional',
      providers: ['openrouter', 'openai'],
      defaultProvider: 'openai',
      allowBringYourOwnKey: true,
      allowDirectProviderMode: true,
      allowVisionOnUserKeys: false,
    },
  );
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
        provider: 'openai',
        model: 'gpt-4.1-mini',
        useOwnKey: true,
        messages: [
          {
            role: 'user',
            content: 'Hello!',
          },
        ],
      }),
    /vision support.*disabled for user keys/i,
  );
  assert.equal(fetchCalled, false);
});

test('AiProxyService blocks proxy calls when requests-per-day quota is exhausted', async (t) => {
  let failureInput: unknown;
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
    recordProxyFailure: async (input: any) => {
      failureInput = input;
    },
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
  assert.equal((failureInput as any).status, 'quota_exceeded');
  assert.equal((failureInput as any).errorCode, 'quota_exhausted');
  assert.equal(typeof (failureInput as any).durationMs, 'number');
  assert.ok((failureInput as any).durationMs >= 0);
});

test('AiProxyService records upstream proxy failures in ai request telemetry', async (t) => {
  let failureInput: unknown;
  const { service } = createService({
    recordProxyFailure: async (input: any) => {
      failureInput = input;
    },
  });
  const previousFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          message: 'upstream unavailable',
        },
      }),
      {
        status: 502,
        headers: {
          'content-type': 'application/json',
        },
      },
    )) as typeof fetch;
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
    /OpenRouter request failed with status 502/i,
  );

  assert.equal((failureInput as any).status, 'error');
  assert.equal((failureInput as any).errorCode, 'upstream_bad_gateway');
  assert.equal(typeof (failureInput as any).durationMs, 'number');
  assert.ok((failureInput as any).durationMs >= 0);
});

test('AiProxyService rejects models that are not available for the workspace plan and policy', async (t) => {
  const { service } = createService(
    {
      findWorkspacePlanCode: async () => 'free',
    },
    {
      providers: ['openrouter', 'openai'],
    },
  );
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
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'user',
            content: 'Hello!',
          },
        ],
      }),
    /not available for the current plan and AI provider policy/i,
  );
  assert.equal(fetchCalled, false);
});

test('AiProxyService.listModelsForCurrentSession returns plan-aware models filtered by policy providers', async () => {
  const { service } = createService(
    {
      findWorkspacePlanCode: async () => 'pro',
    },
    {
      providers: ['openrouter', 'openai', 'anthropic'],
      defaultProvider: 'openrouter',
      defaultModel: 'openrouter/auto',
    },
  );

  const result = await service.listModelsForCurrentSession(createSession());

  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.planCode, 'pro');
  assert.equal(result.defaultProvider, 'openrouter');
  assert.equal(result.defaultModel, 'openrouter/auto');
  assert.deepEqual(
    result.models.map((entry) => entry.modelId),
    ['openrouter/auto', 'gpt-4.1-mini', 'claude-sonnet-4'],
  );
});

test('AiProxyService converts USD charges into RUB kopecks before wallet debit', async (t) => {
  let debitInput: any;
  const previousRate = process.env.BILLING_USD_TO_RUB_RATE;
  process.env.BILLING_USD_TO_RUB_RATE = '100';
  t.after(() => {
    process.env.BILLING_USD_TO_RUB_RATE = previousRate;
  });

  const { service } = createService(
    {},
    { providers: ['openrouter'] },
    {
      aiPricingService: {
        getEffectivePolicy: async () => ({
          enabled: true,
          markupPercent: 25,
          minimumFeeUsd: 0.0005,
          roundingUsd: 0.000001,
          maxChargeUsd: null,
          chargeFailedRequests: 'never',
          chargeUserKeyRequests: 'platform_fee_only',
          displayEstimatedPriceToUser: false,
        }),
        calculate: async () => ({
          providerCostUsd: 0.01,
          platformFeeUsd: 0.005,
          chargedCostUsd: 0.015,
          pricingSource: 'estimated',
          policySnapshot: {
            enabled: true,
            markupPercent: 25,
            minimumFeeUsd: 0.0005,
            roundingUsd: 0.000001,
            maxChargeUsd: null,
            chargeFailedRequests: 'never',
            chargeUserKeyRequests: 'platform_fee_only',
            displayEstimatedPriceToUser: false,
          },
          chargeable: true,
        }),
      },
      walletRepository: {
        findOrCreateWalletForUser: async () => ({
          id: 'wallet_1',
          userId: 'user_1',
          currency: 'RUB',
          balanceKopecks: 5000,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        debitUsage: async (input: any) => {
          debitInput = input;
          return { ledgerEntryId: 'ledger_1', newBalanceKopecks: 4900, alreadyProcessed: false };
        },
      },
    },
  );

  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: 'resp_1', choices: [{ message: { content: 'ok' } }] }), { status: 200 })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  await service.proxyForCurrentSession(createSession(), {
    model: 'openrouter/auto',
    messages: [{ role: 'user', content: 'Hello!' }],
  });

  assert.equal(debitInput.amountKopecks, 150);
  assert.equal(debitInput.currency, 'RUB');
});

test('AiProxyService does not debit wallet when pricing is disabled', async (t) => {
  let debitCalled = false;
  const { service } = createService({}, { providers: ['openrouter'] }, {
    walletRepository: {
      debitUsage: async () => {
        debitCalled = true;
        return { ledgerEntryId: 'l', newBalanceKopecks: 0, alreadyProcessed: false };
      },
    },
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: 'resp_1', choices: [{ message: { content: 'ok' } }] }), { status: 200 })) as typeof fetch;
  t.after(() => { globalThis.fetch = previousFetch; });

  await service.proxyForCurrentSession(createSession(), { model: 'openrouter/auto', messages: [{ role: 'user', content: 'Hello!' }] });
  assert.equal(debitCalled, false);
});

test('AiProxyService blocks after provider response when calculated charge exceeds wallet balance', async (t) => {
  const { service } = createService({}, { providers: ['openrouter'] }, {
    aiPricingService: {
      getEffectivePolicy: async () => ({
        enabled: true, markupPercent: 25, minimumFeeUsd: 0.0005, roundingUsd: 0.000001, maxChargeUsd: null, chargeFailedRequests: 'never', chargeUserKeyRequests: 'platform_fee_only', displayEstimatedPriceToUser: false,
      }),
      calculate: async () => ({
        providerCostUsd: 10, platformFeeUsd: 2.5, chargedCostUsd: 12.5, pricingSource: 'provider',
        policySnapshot: { enabled: true, markupPercent: 25, minimumFeeUsd: 0.0005, roundingUsd: 0.000001, maxChargeUsd: null, chargeFailedRequests: 'never', chargeUserKeyRequests: 'platform_fee_only', displayEstimatedPriceToUser: false },
        chargeable: true,
      }),
    },
    walletRepository: {
      findOrCreateWalletForUser: async () => ({ id: 'wallet_1', userId: 'user_1', currency: 'RUB', balanceKopecks: 1, createdAt: new Date(), updatedAt: new Date() }),
    },
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: 'resp_1', usage: { cost: 10 }, choices: [{ message: { content: 'ok' } }] }), { status: 200 })) as typeof fetch;
  t.after(() => { globalThis.fetch = previousFetch; });

  await assert.rejects(
    () => service.proxyForCurrentSession(createSession(), { model: 'openrouter/auto', messages: [{ role: 'user', content: 'Hello!' }] }),
    /Insufficient balance/i,
  );
});

test('AiProxyService.listModelsForCurrentSession applies allowed model tag filters', async () => {
  const { service } = createService(
    {
      findWorkspacePlanCode: async () => 'pro',
    },
    {
      providers: ['openrouter', 'openai'],
      defaultProvider: 'openai',
      defaultModel: 'gpt-4.1-mini',
      allowedModelTags: ['vision'],
    },
  );

  const result = await service.listModelsForCurrentSession(createSession());

  assert.equal(result.defaultProvider, 'openai');
  assert.equal(result.defaultModel, 'gpt-4.1-mini');
  assert.deepEqual(result.allowedModelTags, ['vision']);
  assert.deepEqual(result.models.map((entry) => entry.modelId), ['gpt-4.1-mini']);
});

test('AiProxyService.listModelsForCurrentSession returns RouterAI models when RouterAI is selected', async () => {
  const { service } = createService(
    {
      findWorkspacePlanCode: async () => 'pro',
    },
    {
      providers: ['routerai'],
      defaultProvider: 'routerai',
      defaultModel: 'openai/gpt-4o-mini',
      allowPlatformManaged: true,
    },
  );

  const result = await service.listModelsForCurrentSession(createSession());

  assert.equal(result.defaultProvider, 'routerai');
  assert.equal(result.defaultModel, 'openai/gpt-4o-mini');
  assert.ok(result.providers.some((entry) => entry.provider === 'routerai'));
  assert.ok(result.models.every((entry) => entry.provider === 'routerai'));
  assert.ok(result.models.some((entry) => entry.modelId === 'openai/gpt-4o-mini'));
});

test('RouterAI catalog normalizer handles supported response envelopes', () => {
  const payloads = [
    { data: [{ id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', architecture: { input_modalities: ['text', 'image'] } }] },
    [{ data: [{ id: 'google/gemini-2.5-flash', name: 'Gemini', supported_parameters: ['temperature'] }] }],
    [{ id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' }],
  ];

  const normalized = payloads.map((payload) => normalizeRouterAiCatalogPayload(payload));

  assert.equal(normalized[0][0]?.modelId, 'openai/gpt-4o-mini');
  assert.deepEqual(normalized[0][0]?.capabilityTags, ['text', 'vision']);
  assert.equal(normalized[1][0]?.modelId, 'google/gemini-2.5-flash');
  assert.equal(normalized[2][0]?.modelId, 'anthropic/claude-3.5-sonnet');
});

test('AiProxyService streams proxy responses and records usage metadata', async (t) => {
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
  const encoder = new TextEncoder();
  const streamBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode('data: {"id":"gen_stream_1","model":"openrouter/auto","choices":[{"delta":{"content":"Hi"}}]}\n\n'),
      );
      controller.enqueue(
        encoder.encode('data: {"usage":{"prompt_tokens":10,"completion_tokens":12,"total_tokens":22}}\n\n'),
      );
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  globalThis.fetch = (async () =>
    new Response(streamBody, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
      },
    })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const streamResult = await service.proxyStreamForCurrentSession(createSession(), {
    model: 'openrouter/auto',
    stream: true,
    messages: [
      {
        role: 'user',
        content: 'Hello!',
      },
    ],
  });

  const streamedPayload = await new Response(streamResult.stream).text();
  const completion = await streamResult.completion;

  assert.match(streamedPayload, /gen_stream_1/);
  assert.equal(completion.responseId, 'gen_stream_1');
  assert.equal(completion.usage?.totalTokens, 22);
  assert.equal(completion.quota.decremented, true);
  assert.equal(completion.quota.consumed, 2);
  assert.equal((recordInput as any).consumeQuota, true);
  assert.equal(typeof (recordInput as any).durationMs, 'number');
  assert.ok((recordInput as any).durationMs >= 0);
});
