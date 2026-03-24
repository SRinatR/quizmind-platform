import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlan } from '../../testing/src';
import {
  assertSubscriptionStatus,
  buildSubscriptionSummary,
  canConsumeQuota,
  incrementUsage,
  isActiveSubscription,
  mapStripeBillingInterval,
  mapStripeSubscriptionStatus,
  resolveSubscriptionStatusFromStripeEvent,
  resolveEntitlements,
  signStripeWebhookPayload,
  verifyStripeWebhookSignature,
} from '@quizmind/billing';

test('resolveEntitlements lets overrides replace plan defaults', () => {
  const plan = createPlan();

  const resolved = resolveEntitlements(plan, [
    { key: 'limit.requests_per_day', enabled: true, limit: 250 },
    { key: 'feature.screenshot_answering', enabled: true },
  ]);

  assert.deepEqual(resolved.enabled, ['feature.screenshot_answering', 'feature.text_answering', 'limit.requests_per_day']);
  assert.deepEqual(resolved.limits, { 'limit.requests_per_day': 250 });
});

test('subscription helpers cover active states and quotas', () => {
  assert.equal(isActiveSubscription('trialing'), true);
  assert.equal(isActiveSubscription('active'), true);
  assert.equal(isActiveSubscription('grace_period'), true);
  assert.equal(isActiveSubscription('paused'), false);

  assert.equal(canConsumeQuota({ consumed: 9, limit: 10 }), true);
  assert.equal(canConsumeQuota({ consumed: 10, limit: 10 }), false);
  assert.deepEqual(incrementUsage({ consumed: 9, limit: 10 }, 3), { consumed: 12, limit: 10 });
});

test('assertSubscriptionStatus validates supported values', () => {
  assert.equal(assertSubscriptionStatus('active'), 'active');
  assert.throws(() => assertSubscriptionStatus('ghost'), /Unsupported subscription status: ghost/);
});

test('buildSubscriptionSummary merges override limits into response', () => {
  const plan = createPlan();
  const summary = buildSubscriptionSummary({
    workspaceId: 'ws_1',
    plan,
    subscription: {
      planId: plan.id,
      status: 'active',
      interval: 'monthly',
      cancelAtPeriodEnd: false,
      seats: 5,
      trialEndsAt: '2025-01-01T00:00:00.000Z',
    },
    overrides: [{ key: 'limit.requests_per_day', enabled: true, limit: 500 }],
  });

  assert.equal(summary.planCode, 'pro');
  assert.equal(summary.entitlements[0]?.key, 'feature.text_answering');
  assert.equal(summary.entitlements[0]?.enabled, true);
  assert.equal(summary.entitlements[1]?.key, 'limit.requests_per_day');
  assert.equal(summary.entitlements[1]?.enabled, true);
  assert.equal(summary.entitlements[1]?.limit, 500);
});

test('Stripe helpers verify webhook signatures and enforce timestamp tolerance', () => {
  const payload = JSON.stringify({
    id: 'evt_123',
    type: 'invoice.payment_succeeded',
  });
  const secret = 'whsec_test';
  const timestamp = 1_700_000_000;
  const signature = signStripeWebhookPayload(payload, secret, timestamp);

  assert.deepEqual(
    verifyStripeWebhookSignature({
      payload,
      secret,
      signatureHeader: `t=${timestamp},v1=${signature}`,
      now: new Date(timestamp * 1000),
    }),
    { timestamp },
  );
  assert.throws(
    () =>
      verifyStripeWebhookSignature({
        payload,
        secret,
        signatureHeader: `t=${timestamp},v1=${signature}`,
        now: new Date((timestamp + 600) * 1000),
        toleranceSeconds: 300,
      }),
    /outside the allowed tolerance/,
  );
});

test('Stripe billing lifecycle helpers map provider states into internal subscription states', () => {
  assert.equal(mapStripeBillingInterval('month'), 'monthly');
  assert.equal(mapStripeBillingInterval('year'), 'yearly');
  assert.equal(mapStripeSubscriptionStatus('active'), 'active');
  assert.equal(mapStripeSubscriptionStatus('unpaid'), 'past_due');
  assert.equal(
    resolveSubscriptionStatusFromStripeEvent({
      currentStatus: 'trialing',
      eventType: 'invoice.payment_succeeded',
    }),
    'active',
  );
  assert.equal(
    resolveSubscriptionStatusFromStripeEvent({
      currentStatus: 'active',
      eventType: 'customer.subscription.updated',
      stripeStatus: 'paused',
    }),
    'paused',
  );
  assert.equal(
    resolveSubscriptionStatusFromStripeEvent({
      currentStatus: 'active',
      eventType: 'customer.subscription.deleted',
    }),
    'canceled',
  );
});
