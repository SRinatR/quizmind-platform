import assert from 'node:assert/strict';
import test from 'node:test';

import { processBillingWebhookJob, type BillingWebhookProcessingRepository } from '../src/jobs/process-billing-webhook';

function createBaseRepository(
  overrides: Partial<BillingWebhookProcessingRepository> = {},
): BillingWebhookProcessingRepository {
  return {
    async findWebhookEventById() {
      return {
        id: 'wh_1',
        provider: 'stripe',
        externalEventId: 'evt_1',
        eventType: 'customer.subscription.updated',
        payloadJson: {},
        status: 'received',
        receivedAt: new Date('2026-03-24T12:00:00.000Z'),
        processedAt: null,
      };
    },
    async markWebhookEventProcessed() {},
    async markWebhookEventFailed() {},
    async findWorkspaceById() {
      return {
        id: 'ws_1',
        stripeCustomerId: null,
      };
    },
    async findWorkspaceByStripeCustomerId() {
      return null;
    },
    async setWorkspaceStripeCustomerId() {},
    async findPlanByCode(planCode) {
      return {
        id: `plan_${planCode}`,
        code: planCode,
      };
    },
    async findSubscriptionByStripeSubscriptionId() {
      return null;
    },
    async findCurrentSubscriptionByWorkspaceId() {
      return null;
    },
    async upsertStripeSubscriptionForWorkspace(input) {
      return {
        id: 'sub_local_1',
        workspaceId: input.workspaceId,
        planId: input.planId,
        status: input.status,
        billingInterval: input.billingInterval,
        seatCount: input.seatCount,
        stripeCustomerId: input.stripeCustomerId,
        stripePriceId: input.stripePriceId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        trialStartAt: input.trialStartAt,
      };
    },
    async updateSubscriptionStatus() {},
    async upsertInvoice() {
      return {
        id: 'invoice_local_1',
      };
    },
    async upsertPayment() {
      return {
        id: 'payment_local_1',
      };
    },
    ...overrides,
  };
}

test('processBillingWebhookJob applies customer.subscription.updated to workspace and subscription state', async () => {
  let persistedStripeCustomerId: string | null = null;
  let persistedSubscriptionInput: Record<string, unknown> | null = null;
  const repository = createBaseRepository({
    async findWebhookEventById() {
      return {
        id: 'wh_subscription',
        provider: 'stripe',
        externalEventId: 'evt_subscription',
        eventType: 'customer.subscription.updated',
        payloadJson: {
          id: 'evt_subscription',
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_stripe_1',
              customer: 'cus_123',
              status: 'active',
              cancel_at_period_end: false,
              current_period_start: 1_710_000_000,
              current_period_end: 1_712_592_000,
              metadata: {
                workspaceId: 'ws_1',
                planCode: 'pro',
              },
              items: {
                data: [
                  {
                    quantity: 7,
                    price: {
                      id: 'price_pro_monthly',
                      recurring: {
                        interval: 'month',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        status: 'received',
        receivedAt: new Date('2026-03-24T12:00:00.000Z'),
        processedAt: null,
      };
    },
    async setWorkspaceStripeCustomerId(_workspaceId, stripeCustomerId) {
      persistedStripeCustomerId = stripeCustomerId;
    },
    async upsertStripeSubscriptionForWorkspace(input) {
      persistedSubscriptionInput = input as Record<string, unknown>;

      return {
        id: 'sub_local_1',
        workspaceId: input.workspaceId,
        planId: input.planId,
        status: input.status,
        billingInterval: input.billingInterval,
        seatCount: input.seatCount,
        stripeCustomerId: input.stripeCustomerId,
        stripePriceId: input.stripePriceId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        trialStartAt: input.trialStartAt,
      };
    },
  });

  const result = await processBillingWebhookJob(
    {
      provider: 'stripe',
      webhookEventId: 'wh_subscription',
      externalEventId: 'evt_subscription',
      eventType: 'customer.subscription.updated',
      receivedAt: '2026-03-24T12:00:00.000Z',
    },
    repository,
  );

  assert.equal(result.processed, true);
  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.subscriptionId, 'sub_local_1');
  assert.equal(persistedStripeCustomerId, 'cus_123');
  assert.equal(persistedSubscriptionInput?.status, 'active');
  assert.equal(persistedSubscriptionInput?.billingInterval, 'monthly');
  assert.equal(persistedSubscriptionInput?.seatCount, 7);
  assert.equal(persistedSubscriptionInput?.stripeCustomerId, 'cus_123');
  assert.equal(persistedSubscriptionInput?.stripePriceId, 'price_pro_monthly');
  assert.equal(persistedSubscriptionInput?.stripeSubscriptionId, 'sub_stripe_1');
});

test('processBillingWebhookJob applies checkout.session.completed to workspace and subscription state', async () => {
  let persistedStripeCustomerId: string | null = null;
  let persistedSubscriptionInput: Record<string, unknown> | null = null;
  const repository = createBaseRepository({
    async findWebhookEventById() {
      return {
        id: 'wh_checkout',
        provider: 'stripe',
        externalEventId: 'evt_checkout',
        eventType: 'checkout.session.completed',
        payloadJson: {
          id: 'evt_checkout',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_123',
              mode: 'subscription',
              status: 'complete',
              payment_status: 'paid',
              customer: 'cus_123',
              subscription: 'sub_stripe_checkout',
              client_reference_id: 'ws_1',
              metadata: {
                workspaceId: 'ws_1',
                planCode: 'pro',
                interval: 'monthly',
                stripePriceId: 'price_pro_monthly',
              },
            },
          },
        },
        status: 'received',
        receivedAt: new Date('2026-03-24T12:00:00.000Z'),
        processedAt: null,
      };
    },
    async setWorkspaceStripeCustomerId(_workspaceId, stripeCustomerId) {
      persistedStripeCustomerId = stripeCustomerId;
    },
    async upsertStripeSubscriptionForWorkspace(input) {
      persistedSubscriptionInput = input as Record<string, unknown>;

      return {
        id: 'sub_local_checkout',
        workspaceId: input.workspaceId,
        planId: input.planId,
        status: input.status,
        billingInterval: input.billingInterval,
        seatCount: input.seatCount,
        stripeCustomerId: input.stripeCustomerId,
        stripePriceId: input.stripePriceId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        trialStartAt: input.trialStartAt,
      };
    },
  });

  const result = await processBillingWebhookJob(
    {
      provider: 'stripe',
      webhookEventId: 'wh_checkout',
      externalEventId: 'evt_checkout',
      eventType: 'checkout.session.completed',
      receivedAt: '2026-03-24T12:00:00.000Z',
    },
    repository,
  );

  assert.equal(result.processed, true);
  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.subscriptionId, 'sub_local_checkout');
  assert.equal(persistedStripeCustomerId, 'cus_123');
  assert.equal(persistedSubscriptionInput?.status, 'active');
  assert.equal(persistedSubscriptionInput?.billingInterval, 'monthly');
  assert.equal(persistedSubscriptionInput?.stripeCustomerId, 'cus_123');
  assert.equal(persistedSubscriptionInput?.stripePriceId, 'price_pro_monthly');
  assert.equal(persistedSubscriptionInput?.stripeSubscriptionId, 'sub_stripe_checkout');
});

test('processBillingWebhookJob applies invoice.payment_succeeded to invoice, payment, and subscription state', async () => {
  let persistedInvoiceInput: Record<string, unknown> | null = null;
  let persistedPaymentInput: Record<string, unknown> | null = null;
  let updatedSubscriptionStatus: string | null = null;
  const repository = createBaseRepository({
    async findWebhookEventById() {
      return {
        id: 'wh_invoice',
        provider: 'stripe',
        externalEventId: 'evt_invoice',
        eventType: 'invoice.payment_succeeded',
        payloadJson: {
          id: 'evt_invoice',
          type: 'invoice.payment_succeeded',
          data: {
            object: {
              id: 'in_123',
              subscription: 'sub_stripe_1',
              status: 'paid',
              amount_due: 4900,
              amount_paid: 4900,
              currency: 'usd',
              created: 1_710_000_000,
              due_date: 1_710_086_400,
              payment_intent: 'pi_123',
              status_transitions: {
                paid_at: 1_710_000_600,
              },
            },
          },
        },
        status: 'received',
        receivedAt: new Date('2026-03-24T12:00:00.000Z'),
        processedAt: null,
      };
    },
    async findSubscriptionByStripeSubscriptionId() {
      return {
        id: 'sub_local_1',
        workspaceId: 'ws_1',
        planId: 'plan_pro',
        status: 'trialing',
        billingInterval: 'monthly',
        seatCount: 3,
        stripeCustomerId: 'cus_123',
        stripePriceId: 'price_pro_monthly',
        stripeSubscriptionId: 'sub_stripe_1',
        trialStartAt: new Date('2026-03-20T00:00:00.000Z'),
      };
    },
    async upsertInvoice(input) {
      persistedInvoiceInput = input as Record<string, unknown>;
      return {
        id: 'invoice_local_1',
      };
    },
    async upsertPayment(input) {
      persistedPaymentInput = input as Record<string, unknown>;
      return {
        id: 'payment_local_1',
      };
    },
    async updateSubscriptionStatus(_subscriptionId, status) {
      updatedSubscriptionStatus = status;
    },
  });

  const result = await processBillingWebhookJob(
    {
      provider: 'stripe',
      webhookEventId: 'wh_invoice',
      externalEventId: 'evt_invoice',
      eventType: 'invoice.payment_succeeded',
      receivedAt: '2026-03-24T12:00:00.000Z',
    },
    repository,
  );

  assert.equal(result.processed, true);
  assert.equal(result.subscriptionId, 'sub_local_1');
  assert.equal(result.invoiceId, 'invoice_local_1');
  assert.equal(result.paymentId, 'payment_local_1');
  assert.equal(updatedSubscriptionStatus, 'active');
  assert.equal(persistedInvoiceInput?.externalId, 'in_123');
  assert.equal(persistedInvoiceInput?.amountPaid, 4900);
  assert.equal(persistedPaymentInput?.externalId, 'pi_123');
  assert.equal(persistedPaymentInput?.status, 'succeeded');
});

test('processBillingWebhookJob marks the webhook as failed when required billing metadata is missing', async () => {
  let persistedFailureMessage: string | null = null;
  const repository = createBaseRepository({
    async findWebhookEventById() {
      return {
        id: 'wh_failed',
        provider: 'stripe',
        externalEventId: 'evt_failed',
        eventType: 'customer.subscription.created',
        payloadJson: {
          id: 'evt_failed',
          type: 'customer.subscription.created',
          data: {
            object: {
              id: 'sub_stripe_failed',
              customer: 'cus_missing_workspace',
              status: 'active',
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      id: 'price_pro_monthly',
                      recurring: {
                        interval: 'month',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        status: 'received',
        receivedAt: new Date('2026-03-24T12:00:00.000Z'),
        processedAt: null,
      };
    },
    async findWorkspaceById() {
      return null;
    },
    async findWorkspaceByStripeCustomerId() {
      return null;
    },
    async markWebhookEventFailed(_webhookEventId, lastError) {
      persistedFailureMessage = lastError;
    },
  });

  await assert.rejects(
    () =>
      processBillingWebhookJob(
        {
          provider: 'stripe',
          webhookEventId: 'wh_failed',
          externalEventId: 'evt_failed',
          eventType: 'customer.subscription.created',
          receivedAt: '2026-03-24T12:00:00.000Z',
        },
        repository,
      ),
    /Unable to resolve workspace/,
  );

  assert.match(String(persistedFailureMessage), /Unable to resolve workspace/);
});
