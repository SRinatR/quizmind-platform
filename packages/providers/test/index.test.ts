import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDefaultAiAccessPolicy,
  getProviderCatalog,
  listAvailableModelsForPlan,
  listModelsForProvider,
  providerRegistry,
  resolveBillingProvider,
  validateProviderSecretShape,
} from '../src/index';

test('provider registry exposes starter providers', () => {
  assert.ok(providerRegistry.some((entry) => entry.provider === 'openrouter'));
  assert.ok(providerRegistry.some((entry) => entry.provider === 'routerai'));
  assert.ok(providerRegistry.some((entry) => entry.provider === 'internal'));
});

test('model catalog filters by provider and plan', () => {
  assert.equal(listModelsForProvider('openai').length, 1);
  assert.ok(listAvailableModelsForPlan('free').every((entry) => entry.planAvailability?.includes('free') ?? true));
  assert.ok(listAvailableModelsForPlan('business').length >= 2);
  assert.equal(getProviderCatalog().providers.length, providerRegistry.length);
});

test('default AI access policy stays proxy-only and provider-routed', () => {
  const policy = buildDefaultAiAccessPolicy({
    defaultModel: 'openrouter/auto',
  });

  assert.equal(policy.mode, 'platform_only');
  assert.equal(policy.allowPlatformManaged, true);
  assert.equal(policy.allowBringYourOwnKey, false);
  assert.equal(policy.allowDirectProviderMode, false);
  assert.equal(policy.allowWorkspaceSharedCredentials, false);
  assert.equal(policy.requireAdminApproval, false);
  assert.equal(policy.allowVisionOnUserKeys, false);
  assert.deepEqual(policy.allowedModelTags, []);
  assert.equal(policy.defaultProvider, 'openrouter');
  assert.equal(policy.defaultModel, 'openrouter/auto');
});

test('billing provider resolver prefers manual only when explicitly requested', () => {
  assert.equal(resolveBillingProvider({ requestedProvider: 'manual' }), 'manual');
  assert.equal(resolveBillingProvider({ requestedProvider: 'mock' }), 'mock');
  assert.equal(resolveBillingProvider({ currency: 'usd' }), 'stripe');
  assert.equal(resolveBillingProvider({ requestedProvider: 'yookassa' }), 'yookassa');
  assert.equal(resolveBillingProvider({ requestedProvider: 'paddle' }), 'paddle');
  assert.equal(resolveBillingProvider({ currency: 'rub' }), 'yookassa');
  assert.equal(resolveBillingProvider({ currency: 'eur' }), 'paddle');
});

test('provider secret validation enforces provider-specific key shapes', () => {
  assert.equal(validateProviderSecretShape('openai', 'sk-test_123456789').valid, true);
  assert.equal(validateProviderSecretShape('anthropic', 'sk-ant-test_123456789').valid, true);
  assert.equal(validateProviderSecretShape('openrouter', 'sk-or-test_123456789').valid, true);
  assert.equal(validateProviderSecretShape('routerai', 'routerai-test_123456789').valid, true);
  assert.equal(validateProviderSecretShape('internal', 'gateway-secret-123456').valid, false);
  assert.equal(validateProviderSecretShape('openrouter', 'sk-test_123').valid, false);
});
