import {
  type UsageDecision,
  type UsageMetricStatus,
  type UsageQuotaEnforcementMode,
  type UsageQuotaHint,
} from '@quizmind/contracts';

export interface UsageSnapshot {
  consumed: number;
  limit?: number;
}

export function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function addUtcDays(value: Date, amount: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function resolveUsageMetricStatus(consumed: number, limit?: number): UsageMetricStatus {
  if (typeof limit !== 'number') {
    return 'healthy';
  }

  if (consumed >= limit) {
    return 'exceeded';
  }

  if (consumed / limit >= 0.8) {
    return 'warning';
  }

  return 'healthy';
}

export function resolveQuotaKey(eventType: string): string | undefined {
  if (eventType.includes('screenshot')) {
    return 'limit.screenshots_per_day';
  }

  if (eventType.includes('answer') || eventType.includes('request')) {
    return 'limit.requests_per_day';
  }

  return undefined;
}

export function canConsumeUsage(usage: UsageSnapshot): boolean {
  return typeof usage.limit !== 'number' || usage.consumed < usage.limit;
}

export function incrementUsage(usage: UsageSnapshot, amount = 1): UsageSnapshot {
  return {
    ...usage,
    consumed: usage.consumed + amount,
  };
}

export function evaluateUsageDecision(input: {
  consumed: number;
  limit?: number;
  quotaKey?: string;
}): UsageDecision {
  if (typeof input.limit !== 'number') {
    return {
      accepted: true,
      code: 'accepted',
      quotaKey: input.quotaKey,
    };
  }

  if (input.consumed >= input.limit) {
    return {
      accepted: false,
      code: 'quota_exceeded',
      quotaKey: input.quotaKey,
      message: 'Workspace quota has been exhausted for the current window.',
    };
  }

  return {
    accepted: true,
    code: 'accepted',
    quotaKey: input.quotaKey,
  };
}

export function buildQuotaHint(input: {
  key: string;
  label: string;
  consumed: number;
  limit?: number;
  enforcementMode?: UsageQuotaEnforcementMode;
}): UsageQuotaHint {
  const remaining = typeof input.limit === 'number' ? Math.max(input.limit - input.consumed, 0) : undefined;

  return {
    key: input.key,
    label: input.label,
    ...(typeof input.limit === 'number' ? { limit: input.limit } : {}),
    ...(typeof remaining === 'number' ? { remaining } : {}),
    status: resolveUsageMetricStatus(input.consumed, input.limit),
    enforcementMode: input.enforcementMode ?? 'hard_limit',
  };
}
