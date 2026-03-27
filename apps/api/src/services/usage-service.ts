import {
  type PlanEntitlement,
  type UsageInstallationSummary,
  type UsageEventSeverity,
  type UsageMetricStatus,
  type UsageQuotaSnapshot,
  type UsageRecentEventSummary,
} from '@quizmind/contracts';
import { addUtcDays, resolveUsageMetricStatus, startOfUtcDay } from '@quizmind/usage';

import {
  type WorkspaceActivityRecord,
  type WorkspaceAiRequestRecord,
  type WorkspaceQuotaCounterRecord,
  type WorkspaceTelemetryRecord,
  type WorkspaceUsageInstallationRecord,
} from '../usage/usage.repository';

const usageQuotaLabels: Record<string, string> = {
  'limit.requests_per_day': 'Requests today',
  'limit.screenshots_per_day': 'Screenshots today',
  'limit.seats': 'Seats in plan',
};

const usageTrackedQuotaKeys = new Set(Object.keys(usageQuotaLabels));

function humanizeQuotaKey(key: string): string {
  const normalized = key.startsWith('limit.') ? key.slice('limit.'.length) : key;

  return normalized
    .split(/[_./-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function summarizeRecord(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'No metadata attached.';
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => ['string', 'number', 'boolean'].includes(typeof entryValue))
    .slice(0, 3)
    .map(([key, entryValue]) => `${key}=${String(entryValue)}`);

  return entries.length > 0 ? entries.join(' | ') : 'Metadata recorded.';
}

function resolveAiRequestEventType(status: string): string {
  if (status === 'quota_exceeded') {
    return 'ai.proxy.quota_exceeded';
  }

  if (status === 'error') {
    return 'ai.proxy.failed';
  }

  return 'ai.proxy.completed';
}

function resolveAiRequestSeverity(status: string): UsageEventSeverity {
  if (status === 'quota_exceeded') {
    return 'warn';
  }

  if (status === 'error') {
    return 'error';
  }

  return 'info';
}

function summarizeAiRequest(record: WorkspaceAiRequestRecord): string {
  const parts: string[] = [
    `provider=${record.provider}`,
    `model=${record.model}`,
    `key=${record.keySource}`,
  ];

  if (record.totalTokens > 0) {
    parts.push(`tokens=${record.totalTokens}`);
  }

  if (typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) && record.durationMs >= 0) {
    parts.push(`durationMs=${Math.trunc(record.durationMs)}`);
  }

  if (record.status !== 'success') {
    parts.push(`error=${record.errorCode ?? 'unknown'}`);
  }

  const metadataSummary = summarizeRecord(record.requestMetadata);

  if (metadataSummary !== 'No metadata attached.' && metadataSummary !== 'Metadata recorded.') {
    parts.push(metadataSummary);
  }

  return parts.join(' | ');
}

function resolveCounterFallbackWindow(input: {
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  now?: Date;
}): { periodStart: Date; periodEnd: Date } {
  if (input.currentPeriodStart && input.currentPeriodEnd) {
    return {
      periodStart: input.currentPeriodStart,
      periodEnd: input.currentPeriodEnd,
    };
  }

  const now = input.now ?? new Date();
  const periodStart = startOfUtcDay(now);

  return {
    periodStart,
    periodEnd: addUtcDays(periodStart, 1),
  };
}

export function mapUsageInstallations(
  installations: WorkspaceUsageInstallationRecord[],
): UsageInstallationSummary[] {
  return installations.map((installation) => ({
    installationId: installation.installationId,
    browser: installation.browser,
    extensionVersion: installation.extensionVersion,
    schemaVersion: installation.schemaVersion,
    capabilities: normalizeCapabilities(installation.capabilitiesJson),
    lastSeenAt: installation.lastSeenAt?.toISOString() ?? null,
  }));
}

export function buildUsageQuotas(input: {
  entitlements: PlanEntitlement[];
  counters: WorkspaceQuotaCounterRecord[];
  seatCount: number;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  now?: Date;
}): UsageQuotaSnapshot[] {
  const counterByKey = new Map<string, WorkspaceQuotaCounterRecord>();

  for (const counter of input.counters) {
    if (!counterByKey.has(counter.key)) {
      counterByKey.set(counter.key, counter);
    }
  }

  const entitlementLimitByKey = new Map(
    input.entitlements
      .filter((entitlement) => typeof entitlement.limit === 'number')
      .map((entitlement) => [entitlement.key, entitlement.limit as number]),
  );
  const keys = Array.from(
    new Set(
      [
        ...Array.from(entitlementLimitByKey.keys()).filter((key) => usageTrackedQuotaKeys.has(key)),
        ...Array.from(counterByKey.keys()),
      ].sort((left, right) => left.localeCompare(right)),
    ),
  );
  const fallbackWindow = resolveCounterFallbackWindow({
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    now: input.now,
  });

  return keys.map((key) => {
    const limit = entitlementLimitByKey.get(key);
    const counter = counterByKey.get(key);
    const consumed = key === 'limit.seats' ? input.seatCount : counter?.consumed ?? 0;
    const periodStart = counter?.periodStart ?? fallbackWindow.periodStart;
    const periodEnd = counter?.periodEnd ?? fallbackWindow.periodEnd;
    const remaining = typeof limit === 'number' ? Math.max(limit - consumed, 0) : undefined;

    return {
      key,
      label: usageQuotaLabels[key] ?? humanizeQuotaKey(key),
      consumed,
      ...(typeof limit === 'number' ? { limit } : {}),
      ...(typeof remaining === 'number' ? { remaining } : {}),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      status: resolveUsageMetricStatus(consumed, limit),
    };
  });
}

export function buildRecentUsageEvents(input: {
  telemetry: WorkspaceTelemetryRecord[];
  activity: WorkspaceActivityRecord[];
  aiRequests?: WorkspaceAiRequestRecord[];
  limit?: number;
}): UsageRecentEventSummary[] {
  const events: UsageRecentEventSummary[] = [
    ...input.telemetry.map((record) => ({
      id: `telemetry:${record.id}`,
      source: 'telemetry' as const,
      eventType: record.eventType,
      severity: record.severity,
      occurredAt: record.createdAt.toISOString(),
      installationId: record.installation.installationId,
      summary: summarizeRecord(record.payloadJson),
    })),
    ...input.activity.map((record) => ({
      id: `activity:${record.id}`,
      source: 'activity' as const,
      eventType: record.eventType,
      occurredAt: record.createdAt.toISOString(),
      actorId: record.actorId ?? undefined,
      summary: summarizeRecord(record.metadataJson),
    })),
    ...(input.aiRequests ?? []).map((record) => ({
      id: `ai:${record.id}`,
      source: 'ai' as const,
      eventType: resolveAiRequestEventType(record.status),
      severity: resolveAiRequestSeverity(record.status),
      occurredAt: record.occurredAt.toISOString(),
      installationId: record.installationId ?? undefined,
      actorId: record.userId,
      summary: summarizeAiRequest(record),
    })),
  ];

  return events
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, input.limit ?? 8);
}
