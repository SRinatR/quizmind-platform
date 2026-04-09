import { createLogEvent } from '@quizmind/logger';

export interface QuotaCounterSnapshot {
  workspaceId?: string;
  key: string;
  consumed: number;
  periodStart: string;
  periodEnd: string;
}

export interface QuotaResetResult {
  nextCounter: QuotaCounterSnapshot;
  logEvent: ReturnType<typeof createLogEvent>;
}

export function resetQuotaCounter(
  counter: QuotaCounterSnapshot,
  nextPeriodStart: string,
  nextPeriodEnd: string,
): QuotaResetResult {
  const nextCounter: QuotaCounterSnapshot = {
    ...counter,
    consumed: 0,
    periodStart: nextPeriodStart,
    periodEnd: nextPeriodEnd,
  };

  return {
    nextCounter,
    logEvent: createLogEvent({
      eventId: `quota-reset:${counter.workspaceId ?? 'global'}:${counter.key}:${nextPeriodStart}`,
      eventType: 'quota_counter.reset',
      actorId: counter.workspaceId,
      actorType: 'system',
      ...(counter.workspaceId ? { workspaceId: counter.workspaceId } : {}),
      targetType: 'quota_counter',
      targetId: counter.key,
      occurredAt: nextPeriodStart,
      category: 'domain',
      severity: 'info',
      status: 'success',
      metadata: {
        previousConsumed: counter.consumed,
        previousPeriodStart: counter.periodStart,
        previousPeriodEnd: counter.periodEnd,
      },
    }),
  };
}
