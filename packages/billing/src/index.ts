import { subscriptionStatuses, type PlanDefinition, type PlanEntitlement, type SubscriptionStatus } from '@quizmind/contracts';

export const billableIntervals = ['monthly', 'yearly'] as const;
export type BillableInterval = (typeof billableIntervals)[number];

export interface SubscriptionSnapshot {
  planId: string;
  status: SubscriptionStatus;
  interval: BillableInterval;
  cancelAtPeriodEnd: boolean;
  seats: number;
  trialEndsAt?: string;
}

export interface EntitlementResolution {
  enabled: string[];
  limits: Record<string, number>;
}

export interface UsageSnapshot {
  consumed: number;
  limit?: number;
}

export function isActiveSubscription(status: SubscriptionStatus): boolean {
  return ['trialing', 'active', 'grace_period'].includes(status);
}

export function resolveEntitlements(plan: PlanDefinition, overrides: PlanEntitlement[] = []): EntitlementResolution {
  const merged = new Map<string, PlanEntitlement>();

  for (const entitlement of plan.entitlements) {
    merged.set(entitlement.key, entitlement);
  }

  for (const override of overrides) {
    merged.set(override.key, override);
  }

  const enabled: string[] = [];
  const limits: Record<string, number> = {};

  for (const entitlement of merged.values()) {
    if (entitlement.enabled) {
      enabled.push(entitlement.key);
    }

    if (typeof entitlement.limit === 'number') {
      limits[entitlement.key] = entitlement.limit;
    }
  }

  return { enabled: enabled.sort(), limits };
}

export function canConsumeQuota(usage: UsageSnapshot): boolean {
  if (typeof usage.limit !== 'number') {
    return true;
  }

  return usage.consumed < usage.limit;
}

export function incrementUsage(usage: UsageSnapshot, amount = 1): UsageSnapshot {
  return {
    ...usage,
    consumed: usage.consumed + amount,
  };
}

export function assertSubscriptionStatus(status: string): SubscriptionStatus {
  if (subscriptionStatuses.includes(status as SubscriptionStatus)) {
    return status as SubscriptionStatus;
  }

  throw new Error(`Unsupported subscription status: ${status}`);
}
