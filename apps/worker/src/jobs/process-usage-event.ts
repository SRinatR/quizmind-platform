import { canConsumeQuota, incrementUsage, type UsageSnapshot } from '@quizmind/billing';
import { createLogEvent } from '@quizmind/logger';
import { type UsageEventPayload } from '@quizmind/contracts';

export interface UsageProcessingResult {
  accepted: boolean;
  nextUsage: UsageSnapshot;
  logEvent: ReturnType<typeof createLogEvent>;
}

export function processUsageEvent(
  event: UsageEventPayload,
  usage: UsageSnapshot,
): UsageProcessingResult {
  const accepted = canConsumeQuota(usage);
  const nextUsage = accepted ? incrementUsage(usage) : usage;

  return {
    accepted,
    nextUsage,
    logEvent: createLogEvent({
      eventId: `${event.installationId}:${event.occurredAt}`,
      eventType: event.eventType,
      actorId: event.installationId,
      actorType: 'system',
      workspaceId: event.workspaceId,
      targetType: 'extension_usage_event',
      targetId: event.installationId,
      occurredAt: event.occurredAt,
      category: 'extension',
      severity: accepted ? 'info' : 'warn',
      status: accepted ? 'success' : 'failure',
      metadata: event.payload,
    }),
  };
}
