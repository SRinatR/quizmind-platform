import { buildSubscriptionSummary, type SubscriptionSnapshot } from '@quizmind/billing';
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
