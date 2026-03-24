import assert from 'node:assert/strict';
import test from 'node:test';

import { UnauthorizedException } from '@nestjs/common';
import { signStripeWebhookPayload } from '@quizmind/billing';

import { type CurrentSessionSnapshot } from '../src/auth/auth.types';
import {
  BillingRepository,
  type BillingInvoiceRecord,
  type BillingPlanCatalogRecord,
  type BillingWorkspaceContextRecord,
} from '../src/billing/billing.repository';
import { BillingService } from '../src/billing/billing.service';
import { type BillingWebhookRepository } from '../src/billing/billing-webhook.repository';

function createCurrentSession(): CurrentSessionSnapshot {
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
      workspaceMemberships: [
        {
          workspaceId: 'ws_1',
          role: 'workspace_owner',
        },
      ],
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
    permissions: ['subscriptions:read', 'subscriptions:update'],
  };
}

function createAdminSession(): CurrentSessionSnapshot {
  return {
    ...createCurrentSession(),
    principal: {
      ...createCurrentSession().principal,
      systemRoles: ['platform_admin'],
    },
    permissions: ['plans:manage', 'subscriptions:read', 'subscriptions:update'],
  };
}

function createPlanCatalogRecord(): BillingPlanCatalogRecord {
  return {
    id: 'plan_pro',
    code: 'pro',
    name: 'Pro',
    description: 'Expanded limits and controls.',
    isActive: true,
    createdAt: new Date('2026-03-24T12:00:00.000Z'),
    updatedAt: new Date('2026-03-24T12:00:00.000Z'),
    entitlements: [
      {
        id: 'ent_1',
        planId: 'plan_pro',
        key: 'feature.text_answering',
        enabled: true,
        limitValue: null,
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
      },
    ],
    prices: [
      {
        id: 'price_row_1',
        planId: 'plan_pro',
        intervalCode: 'monthly',
        currency: 'usd',
        amount: 900,
        isDefault: true,
        providerMappings: [
          {
            id: 'ppm_1',
            planPriceId: 'price_row_1',
            provider: 'stripe',
            providerPriceId: 'price_pro_monthly',
            isActive: true,
            createdAt: new Date('2026-03-24T12:00:00.000Z'),
            updatedAt: new Date('2026-03-24T12:00:00.000Z'),
          },
        ],
        stripePriceId: 'price_pro_monthly',
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
      },
      {
        id: 'price_row_2',
        planId: 'plan_pro',
        intervalCode: 'yearly',
        currency: 'usd',
        amount: 9000,
        isDefault: false,
        providerMappings: [
          {
            id: 'ppm_2',
            planPriceId: 'price_row_2',
            provider: 'stripe',
            providerPriceId: 'price_pro_yearly',
            isActive: true,
            createdAt: new Date('2026-03-24T12:00:00.000Z'),
            updatedAt: new Date('2026-03-24T12:00:00.000Z'),
          },
        ],
        stripePriceId: 'price_pro_yearly',
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
      },
    ],
    subscriptions: [],
  } as unknown as BillingPlanCatalogRecord;
}

function createWorkspaceContext(overrides: Partial<BillingWorkspaceContextRecord> = {}): BillingWorkspaceContextRecord {
  return {
    id: 'ws_1',
    slug: 'demo-workspace',
    name: 'Demo Workspace',
    billingEmail: 'billing@quizmind.dev',
    billingProvider: 'stripe',
    providerCustomerId: null,
    stripeCustomerId: null,
    createdAt: new Date('2026-03-24T12:00:00.000Z'),
    updatedAt: new Date('2026-03-24T12:00:00.000Z'),
    memberships: [],
    invitations: [],
    entitlementOverrides: [],
    featureFlagOverrides: [],
    remoteConfigVersions: [],
    extensionInstallations: [],
    auditLogs: [],
    activityLogs: [],
    securityEvents: [],
    domainEvents: [],
    supportTickets: [],
    supportImpersonationSessions: [],
    subscriptions: [
      {
        id: 'sub_local_1',
        workspaceId: 'ws_1',
        planId: 'plan_free',
        provider: 'stripe',
        providerCustomerId: null,
        providerPriceId: null,
        providerSubscriptionId: null,
        externalId: null,
        stripeCustomerId: null,
        stripePriceId: null,
        stripeSubscriptionId: null,
        status: 'trialing',
        billingInterval: 'monthly',
        seatCount: 1,
        trialStartAt: new Date('2026-03-20T12:00:00.000Z'),
        currentPeriodStart: new Date('2026-03-20T12:00:00.000Z'),
        currentPeriodEnd: new Date('2026-04-03T12:00:00.000Z'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
        invoices: [],
        payments: [],
        plan: {
          id: 'plan_free',
          code: 'free',
          name: 'Free',
          description: 'Starter',
          isActive: true,
          createdAt: new Date('2026-03-24T12:00:00.000Z'),
          updatedAt: new Date('2026-03-24T12:00:00.000Z'),
          prices: [],
          entitlements: [],
          subscriptions: [],
        },
      },
    ],
    ...overrides,
  } as unknown as BillingWorkspaceContextRecord;
}

function createBillingService() {
  const billingWebhookRepository = {
    recordReceivedEvent: async () => ({
      duplicate: false,
      record: {
        id: 'webhook_1',
        provider: 'stripe',
        externalEventId: 'evt_123',
        eventType: 'invoice.payment_succeeded',
        status: 'received',
        payloadJson: {},
        providerCreatedAt: new Date('2026-03-24T12:00:00.000Z'),
        processedAt: null,
        lastError: null,
        createdAt: new Date('2026-03-24T12:00:01.000Z'),
        updatedAt: new Date('2026-03-24T12:00:01.000Z'),
        receivedAt: new Date('2026-03-24T12:00:01.000Z'),
      },
    }),
  } as unknown as BillingWebhookRepository;
  const billingRepository = {
    listAllPlans: async () => [],
    listActivePlans: async () => [],
    listInvoicesByWorkspaceId: async () => [],
    findInvoiceExportContext: async () => null,
    findPlanByCode: async () => null,
    findActivePlanByCode: async () => null,
    findWorkspaceBillingContext: async () => null,
    replacePlanCatalogEntry: async () => null,
    updateWorkspaceStripeCustomerId: async () => undefined,
    updateSubscriptionLifecycle: async () => undefined,
  } as unknown as BillingRepository;
  const queueDispatchService = {
    dispatch: async (input: { queue: string; dedupeKey?: string }) => ({
      id: `${input.queue}:${input.dedupeKey ?? 'job'}`,
      queue: input.queue,
    }),
  };
  const service = new BillingService(billingWebhookRepository, billingRepository, queueDispatchService as any);

  service['env'] = {
    nodeEnv: 'test',
    appUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:4000',
    databaseUrl: 'postgresql://postgres:postgres@localhost:5432/quizmind',
    redisUrl: 'redis://localhost:6379',
    runtimeMode: 'connected',
    port: 4000,
    corsAllowedOrigins: ['http://localhost:3000'],
    jwtSecret: 'test-jwt-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    extensionTokenSecret: 'test-extension-secret',
    extensionSessionTtlMinutes: 30,
    providerCredentialSecret: 'test-provider-secret',
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

  return { service, billingWebhookRepository, billingRepository, queueDispatchService };
}

function createJsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

test('BillingService.listPlans maps the connected billing catalog from Prisma records', async () => {
  const { service, billingRepository } = createBillingService();

  billingRepository.listActivePlans = async () => [createPlanCatalogRecord()];

  const result = await service.listPlans();

  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0]?.plan.code, 'pro');
  assert.equal(result.plans[0]?.prices[0]?.amount, 900);
  assert.equal(result.plans[0]?.prices[0]?.stripePriceId, 'price_pro_monthly');
});

test('BillingService.listAdminPlans returns the full billing catalog for plan managers', async () => {
  const { service, billingRepository } = createBillingService();

  billingRepository.listAllPlans = async () => [
    createPlanCatalogRecord(),
    {
      ...createPlanCatalogRecord(),
      id: 'plan_legacy',
      code: 'legacy',
      name: 'Legacy',
      isActive: false,
    },
  ];

  const result = await service.listAdminPlans(createAdminSession());

  assert.equal(result.plans.length, 2);
  assert.equal(result.plans[0]?.plan.code, 'pro');
  assert.equal(result.plans[1]?.isActive, false);
});

test('BillingService.updatePlanCatalogEntry persists active state, prices, and entitlements for plan managers', async () => {
  const { service, billingRepository } = createBillingService();
  let capturedInput: any = null;

  billingRepository.findPlanByCode = async () => createPlanCatalogRecord();
  billingRepository.replacePlanCatalogEntry = async (input) => {
    capturedInput = input;

    return {
      ...createPlanCatalogRecord(),
      name: input.name,
      description: input.description,
      isActive: input.isActive,
      updatedAt: new Date('2026-03-24T13:15:00.000Z'),
      entitlements: input.entitlements.map((entitlement, index) => ({
        id: `ent_${index + 1}`,
        planId: 'plan_pro',
        key: entitlement.key,
        enabled: entitlement.enabled,
        limitValue: entitlement.limitValue,
        createdAt: new Date('2026-03-24T13:15:00.000Z'),
        updatedAt: new Date('2026-03-24T13:15:00.000Z'),
      })),
      prices: input.prices.map((price, index) => ({
        id: `price_${index + 1}`,
        planId: 'plan_pro',
        intervalCode: price.intervalCode,
        currency: price.currency,
        amount: price.amount,
        isDefault: price.isDefault,
        stripePriceId: price.stripePriceId,
        createdAt: new Date('2026-03-24T13:15:00.000Z'),
      })),
    };
  };

  const result = await service.updatePlanCatalogEntry(createAdminSession(), {
    planCode: 'pro',
    name: 'Pro Plus',
    description: 'Expanded limits, analytics, and control-plane access.',
    isActive: false,
    prices: [
      {
        interval: 'monthly',
        currency: 'USD',
        amount: 1900,
        isDefault: true,
        providerMappings: [{ provider: 'stripe', providerPriceId: 'price_pro_plus_monthly', isActive: true }],
        stripePriceId: 'price_pro_plus_monthly',
      },
      {
        interval: 'yearly',
        currency: 'usd',
        amount: 19000,
        isDefault: false,
        providerMappings: [{ provider: 'stripe', providerPriceId: 'price_pro_plus_yearly', isActive: true }],
        stripePriceId: 'price_pro_plus_yearly',
      },
    ],
    entitlements: [
      {
        key: 'feature.remote_config',
        enabled: true,
      },
      {
        key: 'limit.requests_per_day',
        enabled: true,
        limit: 1500,
      },
    ],
  });

  assert.deepEqual(capturedInput, {
    planCode: 'pro',
    name: 'Pro Plus',
    description: 'Expanded limits, analytics, and control-plane access.',
    isActive: false,
    entitlements: [
      {
        key: 'feature.remote_config',
        enabled: true,
        limitValue: null,
      },
      {
        key: 'limit.requests_per_day',
        enabled: true,
        limitValue: 1500,
      },
    ],
    prices: [
      {
        intervalCode: 'monthly',
        currency: 'usd',
        amount: 1900,
        isDefault: true,
        providerMappings: [{ provider: 'stripe', providerPriceId: 'price_pro_plus_monthly', isActive: true }],
        stripePriceId: 'price_pro_plus_monthly',
      },
      {
        intervalCode: 'yearly',
        currency: 'usd',
        amount: 19000,
        isDefault: false,
        providerMappings: [{ provider: 'stripe', providerPriceId: 'price_pro_plus_yearly', isActive: true }],
        stripePriceId: 'price_pro_plus_yearly',
      },
    ],
  });
  assert.equal(result.plan.plan.name, 'Pro Plus');
  assert.equal(result.plan.isActive, false);
  assert.equal(result.plan.prices[0]?.amount, 1900);
  assert.equal(result.plan.plan.entitlements[1]?.limit, 1500);
  assert.equal(result.updatedAt, '2026-03-24T13:15:00.000Z');
});

test('BillingService.listInvoices returns workspace invoices with derived statuses', async () => {
  const { service, billingRepository } = createBillingService();
  const session = createCurrentSession();

  billingRepository.findWorkspaceBillingContext = async () => createWorkspaceContext();
  billingRepository.listInvoicesByWorkspaceId = async () =>
    [
      {
        id: 'invoice_paid',
        subscriptionId: 'sub_local_1',
        externalId: 'in_paid',
        amountDue: 900,
        amountPaid: 900,
        currency: 'usd',
        issuedAt: new Date('2026-03-20T12:00:00.000Z'),
        dueAt: new Date('2026-03-21T12:00:00.000Z'),
        paidAt: new Date('2026-03-20T13:00:00.000Z'),
      },
      {
        id: 'invoice_open',
        subscriptionId: 'sub_local_1',
        externalId: 'in_open',
        amountDue: 900,
        amountPaid: 0,
        currency: 'usd',
        issuedAt: new Date('2026-04-01T12:00:00.000Z'),
        dueAt: new Date('2026-04-30T12:00:00.000Z'),
        paidAt: null,
      },
    ] as BillingInvoiceRecord[];

  const result = await service.listInvoices(session, 'ws_1');

  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.status, 'paid');
  assert.equal(result.items[1]?.status, 'open');
  assert.equal(result.items[0]?.externalId, 'in_paid');
});

test('BillingService.getInvoicePdf resolves a Stripe-hosted invoice PDF for an accessible workspace invoice', async () => {
  const { service, billingRepository } = createBillingService();
  const session = createCurrentSession();
  const originalFetch = globalThis.fetch;

  billingRepository.findInvoiceExportContext = async () => ({
    id: 'invoice_paid',
    externalId: 'in_stripe_123',
    workspaceId: 'ws_1',
  });
  billingRepository.findWorkspaceBillingContext = async () => createWorkspaceContext();

  globalThis.fetch = (async (input) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (!url.endsWith('/invoices/in_stripe_123')) {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }

    return createJsonResponse({
      id: 'in_stripe_123',
      invoice_pdf: 'https://files.stripe.test/invoices/in_stripe_123.pdf',
    });
  }) as typeof fetch;

  try {
    const result = await service.getInvoicePdf(session, 'invoice_paid');

    assert.equal(result.invoiceId, 'invoice_paid');
    assert.equal(result.workspaceId, 'ws_1');
    assert.equal(result.externalId, 'in_stripe_123');
    assert.equal(result.redirectUrl, 'https://files.stripe.test/invoices/in_stripe_123.pdf');
    assert.equal(result.format, 'pdf');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BillingService.createCheckoutSession creates a Stripe customer when needed and returns a hosted checkout URL', async () => {
  const { service, billingRepository } = createBillingService();
  const session = createCurrentSession();
  let persistedCustomerId: string | null = null;
  const fetchCalls: Array<{ url: string; body: string }> = [];
  const originalFetch = globalThis.fetch;

  billingRepository.findWorkspaceBillingContext = async () => createWorkspaceContext();
  billingRepository.findActivePlanByCode = async () => createPlanCatalogRecord();
  billingRepository.updateWorkspaceStripeCustomerId = async (_workspaceId, stripeCustomerId) => {
    persistedCustomerId = stripeCustomerId;
  };

  globalThis.fetch = (async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push({
      url,
      body: String(init?.body ?? ''),
    });

    if (url.endsWith('/customers')) {
      return createJsonResponse({
        id: 'cus_created_123',
      });
    }

    if (url.endsWith('/checkout/sessions')) {
      return createJsonResponse({
        id: 'cs_test_123',
        customer: 'cus_created_123',
        url: 'https://checkout.stripe.test/session/cs_test_123',
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const result = await service.createCheckoutSession(session, {
      workspaceId: 'ws_1',
      planCode: 'pro',
      interval: 'monthly',
    });

    assert.equal(result.customerId, 'cus_created_123');
    assert.equal(result.sessionId, 'cs_test_123');
    assert.equal(result.redirectUrl, 'https://checkout.stripe.test/session/cs_test_123');
    assert.equal(result.stripePriceId, 'price_pro_monthly');
    assert.equal(persistedCustomerId, 'cus_created_123');
    assert.equal(fetchCalls.length, 2);
    assert.match(fetchCalls[0]?.body ?? '', /metadata%5BworkspaceId%5D=ws_1/);
    assert.match(fetchCalls[1]?.body ?? '', /line_items%5B0%5D%5Bprice%5D=price_pro_monthly/);
    assert.match(fetchCalls[1]?.body ?? '', /subscription_data%5Bmetadata%5D%5BplanCode%5D=pro/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BillingService.cancelSubscription updates Stripe and persists cancelAtPeriodEnd locally', async () => {
  const { service, billingRepository } = createBillingService();
  const session = createCurrentSession();
  const originalFetch = globalThis.fetch;
  let updatedLifecycleInput: Record<string, unknown> | null = null;
  let persistedWorkspaceCustomerId: string | null = null;

  billingRepository.findWorkspaceBillingContext = async () =>
    createWorkspaceContext({
      stripeCustomerId: 'cus_existing',
      subscriptions: [
        {
          ...createWorkspaceContext().subscriptions[0],
          stripeCustomerId: 'cus_existing',
          stripeSubscriptionId: 'sub_stripe_123',
          stripePriceId: 'price_pro_monthly',
          status: 'active',
          cancelAtPeriodEnd: false,
        },
      ],
    });
  billingRepository.updateSubscriptionLifecycle = async (_subscriptionId, input) => {
    updatedLifecycleInput = input as Record<string, unknown>;
  };
  billingRepository.updateWorkspaceStripeCustomerId = async (_workspaceId, stripeCustomerId) => {
    persistedWorkspaceCustomerId = stripeCustomerId;
  };

  globalThis.fetch = (async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (!url.endsWith('/subscriptions/sub_stripe_123')) {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }

    assert.match(String(init?.body ?? ''), /cancel_at_period_end=true/);

    return createJsonResponse({
      id: 'sub_stripe_123',
      customer: 'cus_existing',
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: 1_712_592_000,
      items: {
        data: [
          {
            price: {
              id: 'price_pro_monthly',
            },
          },
        ],
      },
    });
  }) as typeof fetch;

  try {
    const result = await service.cancelSubscription(session, {
      workspaceId: 'ws_1',
    });

    assert.equal(result.cancelAtPeriodEnd, true);
    assert.equal(result.status, 'active');
    assert.equal(result.stripeSubscriptionId, 'sub_stripe_123');
    assert.equal(updatedLifecycleInput?.cancelAtPeriodEnd, true);
    assert.equal(updatedLifecycleInput?.status, 'active');
    assert.equal(updatedLifecycleInput?.stripePriceId, 'price_pro_monthly');
    assert.equal(updatedLifecycleInput?.stripeCustomerId, 'cus_existing');
    assert.equal(persistedWorkspaceCustomerId, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BillingService.resumeSubscription updates Stripe and clears cancelAtPeriodEnd locally', async () => {
  const { service, billingRepository } = createBillingService();
  const session = createCurrentSession();
  const originalFetch = globalThis.fetch;
  let updatedLifecycleInput: Record<string, unknown> | null = null;

  billingRepository.findWorkspaceBillingContext = async () =>
    createWorkspaceContext({
      stripeCustomerId: 'cus_existing',
      subscriptions: [
        {
          ...createWorkspaceContext().subscriptions[0],
          stripeCustomerId: 'cus_existing',
          stripeSubscriptionId: 'sub_stripe_123',
          stripePriceId: 'price_pro_monthly',
          status: 'active',
          cancelAtPeriodEnd: true,
        },
      ],
    });
  billingRepository.updateSubscriptionLifecycle = async (_subscriptionId, input) => {
    updatedLifecycleInput = input as Record<string, unknown>;
  };

  globalThis.fetch = (async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (!url.endsWith('/subscriptions/sub_stripe_123')) {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }

    assert.match(String(init?.body ?? ''), /cancel_at_period_end=false/);

    return createJsonResponse({
      id: 'sub_stripe_123',
      customer: 'cus_existing',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: 1_712_592_000,
      items: {
        data: [
          {
            price: {
              id: 'price_pro_monthly',
            },
          },
        ],
      },
    });
  }) as typeof fetch;

  try {
    const result = await service.resumeSubscription(session, {
      workspaceId: 'ws_1',
    });

    assert.equal(result.cancelAtPeriodEnd, false);
    assert.equal(result.status, 'active');
    assert.equal(updatedLifecycleInput?.cancelAtPeriodEnd, false);
    assert.equal(updatedLifecycleInput?.status, 'active');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BillingService.createPortalSession falls back to the current subscription customer id and returns a portal link', async () => {
  const { service, billingRepository } = createBillingService();
  const session = createCurrentSession();
  let persistedCustomerId: string | null = null;
  const originalFetch = globalThis.fetch;

  billingRepository.findWorkspaceBillingContext = async () =>
    createWorkspaceContext({
      stripeCustomerId: null,
      subscriptions: [
        {
          ...createWorkspaceContext().subscriptions[0],
          stripeCustomerId: 'cus_from_subscription',
        },
      ],
    });
  billingRepository.updateWorkspaceStripeCustomerId = async (_workspaceId, stripeCustomerId) => {
    persistedCustomerId = stripeCustomerId;
  };

  globalThis.fetch = (async (input) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (!url.endsWith('/billing_portal/sessions')) {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }

    return createJsonResponse({
      url: 'https://billing.stripe.test/session/portal_123',
    });
  }) as typeof fetch;

  try {
    const result = await service.createPortalSession(session, {
      workspaceId: 'ws_1',
    });

    assert.equal(result.customerId, 'cus_from_subscription');
    assert.equal(result.redirectUrl, 'https://billing.stripe.test/session/portal_123');
    assert.equal(persistedCustomerId, 'cus_from_subscription');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('BillingService.ingestStripeWebhook verifies signature, persists the event, and queues processing', async () => {
  const { service, billingWebhookRepository } = createBillingService();
  let persistedInput: Record<string, unknown> | null = null;
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      id: 'evt_123',
      type: 'invoice.payment_succeeded',
      created: timestamp,
      data: {
        object: {
          id: 'in_123',
        },
      },
    }),
    'utf8',
  );
  const signature = signStripeWebhookPayload(payload, service['env'].stripeWebhookSecret, timestamp);

  billingWebhookRepository.recordReceivedEvent = async (input: Record<string, unknown>) => {
    persistedInput = input;

    return {
      duplicate: false,
      record: {
        id: 'webhook_1',
        provider: 'stripe',
        externalEventId: 'evt_123',
        eventType: 'invoice.payment_succeeded',
        status: 'received',
        payloadJson: input.payloadJson,
        providerCreatedAt: new Date(timestamp * 1000),
        processedAt: null,
        lastError: null,
        createdAt: new Date('2026-03-24T12:00:01.000Z'),
        updatedAt: new Date('2026-03-24T12:00:01.000Z'),
        receivedAt: new Date('2026-03-24T12:00:01.000Z'),
      },
    };
  };

  const result = await service.ingestStripeWebhook(`t=${timestamp},v1=${signature}`, payload);

  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.provider, 'stripe');
  assert.equal(result.eventId, 'evt_123');
  assert.equal(result.eventType, 'invoice.payment_succeeded');
  assert.equal(result.queue, 'billing-webhooks');
  assert.equal(result.jobId, 'billing-webhooks:stripe:evt_123');
  assert.equal(persistedInput?.provider, 'stripe');
  assert.equal(persistedInput?.externalEventId, 'evt_123');
  assert.equal(persistedInput?.eventType, 'invoice.payment_succeeded');
});

test('BillingService.ingestStripeWebhook returns a duplicate ack without queueing a second job', async () => {
  const { service, billingWebhookRepository } = createBillingService();
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      id: 'evt_duplicate',
      type: 'customer.subscription.updated',
    }),
    'utf8',
  );
  const signature = signStripeWebhookPayload(payload, service['env'].stripeWebhookSecret, timestamp);

  billingWebhookRepository.recordReceivedEvent = async () => ({
    duplicate: true,
    record: {
      id: 'webhook_existing',
      provider: 'stripe',
      externalEventId: 'evt_duplicate',
      eventType: 'customer.subscription.updated',
      status: 'received',
      payloadJson: {},
      providerCreatedAt: null,
      processedAt: null,
      lastError: null,
      createdAt: new Date('2026-03-24T12:00:01.000Z'),
      updatedAt: new Date('2026-03-24T12:00:01.000Z'),
      receivedAt: new Date('2026-03-24T12:00:01.000Z'),
    },
  });

  const result = await service.ingestStripeWebhook(`t=${timestamp},v1=${signature}`, payload);

  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, true);
  assert.equal(result.queue, undefined);
  assert.equal(result.jobId, undefined);
});

test('BillingService.ingestStripeWebhook rejects invalid Stripe signatures', async () => {
  const { service } = createBillingService();
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      id: 'evt_invalid',
      type: 'invoice.payment_failed',
    }),
    'utf8',
  );

  await assert.rejects(
    () => service.ingestStripeWebhook(`t=${timestamp},v1=deadbeef`, payload),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Invalid Stripe signature/);
      return true;
    },
  );
});
