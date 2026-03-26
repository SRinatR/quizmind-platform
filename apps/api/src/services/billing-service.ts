import { buildSubscriptionSummary, type SubscriptionSnapshot } from '@quizmind/billing';
import {
  type BillingAdminPlanSnapshot,
  type BillingProvider,
  type BillingPlanCatalogEntry,
  type BillingPlanPrice,
  type PlanDefinition,
  type PlanEntitlement,
  type SubscriptionSummary,
} from '@quizmind/contracts';

import { type BillingPlanCatalogRecord } from '../billing/billing.repository';
import { type WorkspaceSubscriptionRecord } from '../billing/subscription.repository';

export function resolveWorkspaceSubscriptionSummary(input: {
  workspaceId: string;
  plan: PlanDefinition;
  subscription: SubscriptionSnapshot;
  overrides?: PlanEntitlement[];
}): SubscriptionSummary {
  return buildSubscriptionSummary({
    workspaceId: input.workspaceId,
    plan: input.plan,
    subscription: input.subscription,
    overrides: input.overrides,
  });
}

export function mapPlanRecordToDefinition(record: WorkspaceSubscriptionRecord['plan']): PlanDefinition {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    entitlements: record.entitlements.map((entitlement) => ({
      key: entitlement.key,
      enabled: entitlement.enabled,
      limit: entitlement.limitValue ?? undefined,
    })),
  };
}

export function mapPlanCatalogRecordToEntry(record: BillingPlanCatalogRecord): BillingPlanCatalogEntry {
  return {
    plan: {
      id: record.id,
      code: record.code,
      name: record.name,
      description: record.description,
      entitlements: record.entitlements.map((entitlement) => ({
        key: entitlement.key,
        enabled: entitlement.enabled,
        limit: entitlement.limitValue ?? undefined,
      })),
    },
    prices: record.prices.map<BillingPlanPrice>((price) => ({
      interval: price.intervalCode === 'yearly' ? 'yearly' : 'monthly',
      currency: price.currency,
      amount: price.amount,
      isDefault: price.isDefault,
      providerMappings: (price.providerMappings ?? []).map((mapping) => ({
        provider: mapping.provider as BillingProvider,
        providerPriceId: mapping.providerPriceId,
        isActive: mapping.isActive,
      })),
      stripePriceId: price.stripePriceId,
    })),
  };
}

export function mapAdminPlanCatalogRecordToSnapshot(record: BillingPlanCatalogRecord): BillingAdminPlanSnapshot {
  const entry = mapPlanCatalogRecordToEntry(record);

  return {
    ...entry,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function mapEntitlementOverrides(
  overrides: WorkspaceSubscriptionRecord['workspace']['entitlementOverrides'],
): PlanEntitlement[] {
  return overrides.map((override) => ({
    key: override.key,
    enabled: override.enabled,
    limit: override.limitValue ?? undefined,
  }));
}

export function mapSubscriptionRecordToSnapshot(record: WorkspaceSubscriptionRecord): SubscriptionSnapshot {
  return {
    planId: record.planId,
    status: record.status,
    interval: record.billingInterval === 'yearly' ? 'yearly' : 'monthly',
    cancelAtPeriodEnd: record.cancelAtPeriodEnd,
    seats: record.seatCount,
    trialEndsAt: record.currentPeriodEnd?.toISOString(),
  };
}
