import {
  type PlatformAiPricingPolicy,
  type PlatformAiPricingPolicyUpdateRequest,
} from '@quizmind/contracts';

export const defaultAiPricingPolicy: PlatformAiPricingPolicy = {
  enabled: false,
  markupPercent: 25,
  minimumFeeUsd: 0.0005,
  roundingUsd: 0.000001,
  maxChargeUsd: null,
  chargeFailedRequests: 'never',
  chargeUserKeyRequests: 'platform_fee_only',
  displayEstimatedPriceToUser: false,
};

const allowedKeys = new Set<keyof PlatformAiPricingPolicy>([
  'enabled',
  'markupPercent',
  'minimumFeeUsd',
  'roundingUsd',
  'maxChargeUsd',
  'chargeFailedRequests',
  'chargeUserKeyRequests',
  'displayEstimatedPriceToUser',
]);

function ensureNumber(name: string, value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return value;
}

function ensureNumberRange(name: string, value: unknown, min: number, max: number): number {
  const parsed = ensureNumber(name, value);
  if (parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function ensureBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean.`);
  }
  return value;
}

export function parseAndNormalizeAiPricingPolicy(input: unknown): PlatformAiPricingPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('AI pricing policy payload must be an object.');
  }

  const raw = input as Record<string, unknown>;
  const policy: PlatformAiPricingPolicy = { ...defaultAiPricingPolicy };

  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key as keyof PlatformAiPricingPolicy)) {
      throw new Error(`Unknown ai pricing field: ${key}.`);
    }
  }

  if ('enabled' in raw) policy.enabled = ensureBoolean('enabled', raw.enabled);
  if ('markupPercent' in raw) policy.markupPercent = ensureNumberRange('markupPercent', raw.markupPercent, 0, 500);
  if ('minimumFeeUsd' in raw) policy.minimumFeeUsd = ensureNumberRange('minimumFeeUsd', raw.minimumFeeUsd, 0, 1);
  if ('roundingUsd' in raw) policy.roundingUsd = ensureNumberRange('roundingUsd', raw.roundingUsd, 0.000001, 0.01);
  if ('maxChargeUsd' in raw) {
    if (raw.maxChargeUsd === null) {
      policy.maxChargeUsd = null;
    } else {
      policy.maxChargeUsd = ensureNumberRange('maxChargeUsd', raw.maxChargeUsd, 0.000001, 100);
    }
  }

  if ('chargeFailedRequests' in raw) {
    if (raw.chargeFailedRequests !== 'never' && raw.chargeFailedRequests !== 'provider_cost_only' && raw.chargeFailedRequests !== 'minimum_fee') {
      throw new Error('chargeFailedRequests must be one of: never, provider_cost_only, minimum_fee.');
    }
    policy.chargeFailedRequests = raw.chargeFailedRequests;
  }

  if ('chargeUserKeyRequests' in raw) {
    if (raw.chargeUserKeyRequests !== 'never' && raw.chargeUserKeyRequests !== 'platform_fee_only' && raw.chargeUserKeyRequests !== 'full_price') {
      throw new Error('chargeUserKeyRequests must be one of: never, platform_fee_only, full_price.');
    }
    policy.chargeUserKeyRequests = raw.chargeUserKeyRequests;
  }

  if ('displayEstimatedPriceToUser' in raw) {
    policy.displayEstimatedPriceToUser = ensureBoolean('displayEstimatedPriceToUser', raw.displayEstimatedPriceToUser);
  }

  return policy;
}

export function parseAiPricingPolicyPatch(input: unknown): PlatformAiPricingPolicyUpdateRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('AI pricing policy patch payload must be an object.');
  }

  const raw = input as Record<string, unknown>;
  const patch: PlatformAiPricingPolicyUpdateRequest = {};

  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key as keyof PlatformAiPricingPolicy)) {
      throw new Error(`Unknown ai pricing field: ${key}.`);
    }
  }

  if ('enabled' in raw) patch.enabled = ensureBoolean('enabled', raw.enabled);
  if ('markupPercent' in raw) patch.markupPercent = ensureNumberRange('markupPercent', raw.markupPercent, 0, 500);
  if ('minimumFeeUsd' in raw) patch.minimumFeeUsd = ensureNumberRange('minimumFeeUsd', raw.minimumFeeUsd, 0, 1);
  if ('roundingUsd' in raw) patch.roundingUsd = ensureNumberRange('roundingUsd', raw.roundingUsd, 0.000001, 0.01);

  if ('maxChargeUsd' in raw) {
    if (raw.maxChargeUsd !== null && raw.maxChargeUsd !== undefined) {
      patch.maxChargeUsd = ensureNumberRange('maxChargeUsd', raw.maxChargeUsd, 0.000001, 100);
    } else {
      patch.maxChargeUsd = null;
    }
  }

  if ('chargeFailedRequests' in raw) {
    if (raw.chargeFailedRequests !== 'never' && raw.chargeFailedRequests !== 'provider_cost_only' && raw.chargeFailedRequests !== 'minimum_fee') {
      throw new Error('chargeFailedRequests must be one of: never, provider_cost_only, minimum_fee.');
    }
    patch.chargeFailedRequests = raw.chargeFailedRequests;
  }

  if ('chargeUserKeyRequests' in raw) {
    if (raw.chargeUserKeyRequests !== 'never' && raw.chargeUserKeyRequests !== 'platform_fee_only' && raw.chargeUserKeyRequests !== 'full_price') {
      throw new Error('chargeUserKeyRequests must be one of: never, platform_fee_only, full_price.');
    }
    patch.chargeUserKeyRequests = raw.chargeUserKeyRequests;
  }

  if ('displayEstimatedPriceToUser' in raw) {
    patch.displayEstimatedPriceToUser = ensureBoolean('displayEstimatedPriceToUser', raw.displayEstimatedPriceToUser);
  }

  return patch;
}

export function mergeAiPricingPolicy(
  base: PlatformAiPricingPolicy,
  patch: PlatformAiPricingPolicyUpdateRequest,
): PlatformAiPricingPolicy {
  return parseAndNormalizeAiPricingPolicy({
    ...base,
    ...patch,
  });
}
