import { buildSubscriptionSummary, type SubscriptionSnapshot } from '@quizmind/billing';
import { type WorkspaceSubscriptionRecord } from '../billing/subscription.repository';
import { type PlanDefinition, type PlanEntitlement, type SubscriptionSummary } from '@quizmind/contracts';

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
