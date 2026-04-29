import { Inject, Injectable } from '@nestjs/common';
import { type PlatformAiPricingPolicy } from '@quizmind/contracts';

import { AiPricingSettingsService } from '../settings/ai-pricing-settings.service';
import type { UserBillingOverride } from '@quizmind/database';

export interface PricingBreakdown {
  providerCostUsd: number;
  platformFeeUsd: number;
  chargedCostUsd: number;
  pricingSource: 'provider' | 'estimated';
  policySnapshot: PlatformAiPricingPolicy;
  chargeable: boolean;
  reason?: string;
}

@Injectable()
export class AiPricingService {
  constructor(
    @Inject(AiPricingSettingsService)
    private readonly settings: AiPricingSettingsService,
  ) {}

  async getEffectivePolicy(): Promise<PlatformAiPricingPolicy> {
    return this.settings.getEffectivePricingPolicy();
  }

  async calculate(input: {
    policy?: PlatformAiPricingPolicy;
    providerCostUsd: number;
    pricingSource: 'provider' | 'estimated';
    keySource: 'platform' | 'user';
    status: 'success' | 'error' | 'quota_exceeded';
  }): Promise<PricingBreakdown> {
    const policy = input.policy ?? (await this.settings.getEffectivePricingPolicy());
    return this.calculateWithPolicy({ ...input, policy });
  }

  calculateWithPolicy(input: {
    policy: PlatformAiPricingPolicy;
    providerCostUsd: number;
    pricingSource: 'provider' | 'estimated';
    keySource: 'platform' | 'user';
    status: 'success' | 'error' | 'quota_exceeded';
  }): PricingBreakdown {
    const providerCostUsd = Math.max(0, input.providerCostUsd);
    const policy = input.policy;
    const minimumFee = Math.max(0, policy.minimumFeeUsd);
    const platformFeeUsd = Math.max((providerCostUsd * policy.markupPercent) / 100, minimumFee);

    let chargedCostUsd = providerCostUsd + platformFeeUsd;

    if (input.keySource === 'user') {
      if (policy.chargeUserKeyRequests === 'never') chargedCostUsd = 0;
      if (policy.chargeUserKeyRequests === 'platform_fee_only') chargedCostUsd = platformFeeUsd;
      if (policy.chargeUserKeyRequests === 'full_price') chargedCostUsd = providerCostUsd + platformFeeUsd;
    }

    if (input.status !== 'success') {
      if (policy.chargeFailedRequests === 'never') {
        chargedCostUsd = 0;
      } else if (policy.chargeFailedRequests === 'provider_cost_only') {
        chargedCostUsd = providerCostUsd > 0 ? providerCostUsd : 0;
      } else if (policy.chargeFailedRequests === 'minimum_fee') {
        chargedCostUsd = minimumFee;
      }
    }

    if (policy.maxChargeUsd !== null && policy.maxChargeUsd !== undefined) {
      chargedCostUsd = Math.min(chargedCostUsd, policy.maxChargeUsd);
    }

    const roundedCharged = this.roundToIncrement(chargedCostUsd, policy.roundingUsd);
    const roundedProvider = this.roundToIncrement(providerCostUsd, policy.roundingUsd);
    const roundedFee = this.roundToIncrement(platformFeeUsd, policy.roundingUsd);

    if (!policy.enabled) {
      return {
        providerCostUsd: roundedProvider,
        platformFeeUsd: roundedFee,
        chargedCostUsd: 0,
        pricingSource: input.pricingSource,
        policySnapshot: policy,
        chargeable: false,
        reason: 'pricing_disabled',
      };
    }

    if (roundedCharged <= 0) {
      return {
        providerCostUsd: roundedProvider,
        platformFeeUsd: roundedFee,
        chargedCostUsd: 0,
        pricingSource: input.pricingSource,
        policySnapshot: policy,
        chargeable: false,
        reason: 'zero_charge',
      };
    }

    return {
      providerCostUsd: roundedProvider,
      platformFeeUsd: roundedFee,
      chargedCostUsd: roundedCharged,
      pricingSource: input.pricingSource,
      policySnapshot: policy,
      chargeable: true,
    };
  }

  resolveEffectiveAiPricingPolicy(policy: PlatformAiPricingPolicy, userOverride?: UserBillingOverride | null): PlatformAiPricingPolicy {
    if (!userOverride) return policy;
    if (userOverride.aiPlatformFeeExempt) {
      return { ...policy, markupPercent: 0, minimumFeeUsd: 0 };
    }
    if (typeof userOverride.aiMarkupPercentOverride === 'number') {
      return { ...policy, markupPercent: userOverride.aiMarkupPercentOverride };
    }
    return policy;
  }

  private roundToIncrement(value: number, increment: number): number {
    if (increment <= 0) return value;
    return Math.round(value / increment) * increment;
  }
}
