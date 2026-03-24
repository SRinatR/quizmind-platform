import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDefaultAiAccessPolicy,
  listAvailableModelsForPlan,
  listModelsForProvider,
  providerRegistry,
  resolveBillingProvider,
} from '../src/index';

test('provider registry exposes starter providers', () => {
  assert.ok(providerRegistry.some((entry) => entry.provider === 'openrouter'));
  assert.ok(providerRegistry.some((entry) => entry.provider === 'internal'));
});

test('model catalog filters by provider and plan', () => {
  assert.equal(listModelsForProvider('openai').length, 1);
  assert.ok(listAvailableModelsForPlan('free').every((entry) => entry.planAvailability?.includes('free') ?? true));
  assert.ok(listAvailableModelsForPlan('business').length >= 2);
});

test('default AI access policy stays proxy-only and provider-routed', () => {
  const policy = buildDefaultAiAccessPolicy({
    defaultModel: 'openrouter/auto',
  });

  assert.equal(policy.mode, 'platform_only');
  assert.equal(policy.allowPlatformManaged, true);
  assert.equal(policy.allowBringYourOwnKey, false);
  assert.equal(policy.allowDirectProviderMode, false);
  assert.equal(policy.defaultProvider, 'openrouter');
  assert.equal(policy.defaultModel, 'openrouter/auto');
});

test('billing provider resolver prefers manual only when explicitly requested', () => {
  assert.equal(resolveBillingProvider({ requestedProvider: 'manual' }), 'manual');
  assert.equal(resolveBillingProvider({ requestedProvider: 'mock' }), 'mock');
  assert.equal(resolveBillingProvider({ currency: 'usd' }), 'stripe');
});
