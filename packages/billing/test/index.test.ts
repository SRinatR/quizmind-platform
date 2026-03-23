import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlan } from '../../testing/src';
import {
  assertSubscriptionStatus,
  buildSubscriptionSummary,
  canConsumeQuota,
  incrementUsage,
  isActiveSubscription,
  resolveEntitlements,
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
