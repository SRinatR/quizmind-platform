import { type EntitlementRefreshJobPayload } from '@quizmind/contracts';
import { createLogEvent } from '@quizmind/logger';

export interface EntitlementRefreshJobResult {
  refreshed: boolean;
  logEvent: ReturnType<typeof createLogEvent>;
}

export function processEntitlementRefreshJob(
  payload: EntitlementRefreshJobPayload,
): EntitlementRefreshJobResult {
  return {
    refreshed: true,
    logEvent: createLogEvent({
      eventId: `entitlement-refresh:${payload.workspaceId}:${payload.subscriptionId}:${payload.requestedAt}`,
      eventType: 'entitlements.refreshed',
      actorId: payload.requestedByUserId ?? payload.workspaceId,
      actorType: payload.requestedByUserId ? 'user' : 'system',
      workspaceId: payload.workspaceId,
      targetType: 'subscription',
      targetId: payload.subscriptionId,
      occurredAt: payload.requestedAt,
      category: 'domain',
      severity: 'info',
      status: 'success',
      metadata: {
        reason: payload.reason,
        previousStatus: payload.previousStatus,
        nextStatus: payload.nextStatus,
      },
    }),
  };
}
