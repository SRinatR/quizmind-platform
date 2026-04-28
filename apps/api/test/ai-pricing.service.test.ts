import assert from 'node:assert/strict';
import test from 'node:test';

import { AiPricingService } from '../src/ai/ai-pricing.service';
import { defaultAiPricingPolicy } from '../src/settings/ai-pricing-policy';

function serviceWithPolicy(policy: any) {
  return new AiPricingService({ getEffectivePricingPolicy: async () => policy } as any);
}

test('applies provider cost + 25% default markup', async () => {
  const svc = serviceWithPolicy({ ...defaultAiPricingPolicy, enabled: true });
  const result = await svc.calculate({ providerCostUsd: 1, pricingSource: 'provider', keySource: 'platform', status: 'success' });
  assert.equal(result.platformFeeUsd, 0.25);
  assert.equal(result.chargedCostUsd, 1.25);
});

test('minimum fee and user-key platform_fee_only apply', async () => {
  const svc = serviceWithPolicy({ ...defaultAiPricingPolicy, enabled: true, minimumFeeUsd: 0.5, markupPercent: 1 });
  const result = await svc.calculate({ providerCostUsd: 0.01, pricingSource: 'estimated', keySource: 'user', status: 'success' });
  assert.equal(result.platformFeeUsd, 0.5);
  assert.equal(result.chargedCostUsd, 0.5);
});

test('failed request modes and max charge cap apply', () => {
  const svc = serviceWithPolicy(defaultAiPricingPolicy);
  const result = svc.calculateWithPolicy({
    policy: { ...defaultAiPricingPolicy, enabled: true, chargeFailedRequests: 'minimum_fee', minimumFeeUsd: 0.2, maxChargeUsd: 0.1, roundingUsd: 0.01 },
    providerCostUsd: 10,
    pricingSource: 'provider',
    keySource: 'platform',
    status: 'error',
  });
  assert.equal(result.chargedCostUsd, 0.1);
});
