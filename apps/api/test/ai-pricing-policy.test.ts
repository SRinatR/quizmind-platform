import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultAiPricingPolicy,
  mergeAiPricingPolicy,
  parseAndNormalizeAiPricingPolicy,
  parseAiPricingPolicyPatch,
} from '../src/settings/ai-pricing-policy';

test('default pricing policy matches product defaults', () => {
  assert.equal(defaultAiPricingPolicy.enabled, false);
  assert.equal(defaultAiPricingPolicy.markupPercent, 25);
  assert.equal(defaultAiPricingPolicy.minimumFeeUsd, 0.0005);
  assert.equal(defaultAiPricingPolicy.roundingUsd, 0.000001);
  assert.equal(defaultAiPricingPolicy.chargeFailedRequests, 'never');
  assert.equal(defaultAiPricingPolicy.chargeUserKeyRequests, 'platform_fee_only');
});

test('parseAiPricingPolicyPatch rejects unknown/string/NaN values', () => {
  assert.throws(() => parseAiPricingPolicyPatch({ markupPercent: '25' }), /finite number/);
  assert.throws(() => parseAiPricingPolicyPatch({ markupPercent: Number.NaN }), /finite number/);
  assert.throws(() => parseAiPricingPolicyPatch({ unknown: true } as any), /Unknown ai pricing field/);
});

test('mergeAiPricingPolicy preserves omitted fields', () => {
  const merged = mergeAiPricingPolicy(
    parseAndNormalizeAiPricingPolicy({ ...defaultAiPricingPolicy, enabled: true, chargeFailedRequests: 'minimum_fee' }),
    parseAiPricingPolicyPatch({ markupPercent: 30 }),
  );
  assert.equal(merged.enabled, true);
  assert.equal(merged.markupPercent, 30);
  assert.equal(merged.chargeFailedRequests, 'minimum_fee');
});
