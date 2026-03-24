import { canConsumeQuota, incrementUsage, type UsageSnapshot } from '@quizmind/billing';
import { createLogEvent } from '@quizmind/logger';
import { type UsageEventPayload } from '@quizmind/contracts';

export interface UsageProcessingResult {
  accepted: boolean;
  nextUsage: UsageSnapshot;
  logEvent: ReturnType<typeof createLogEvent>;
}

export interface UsageInstallationSnapshot {
  id: string;
  installationId: string;
  workspaceId?: string | null;
  browser: string;
  extensionVersion: string;
  schemaVersion: string;
  capabilities: string[];
  lastSeenAt?: Date | null;
}

export interface UsageQuotaCounterSnapshot {
  id: string;
  workspaceId: string;
  key: string;
  consumed: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface UsageProcessingRepository {
  findInstallationByInstallationId(installationId: string): Promise<UsageInstallationSnapshot | null>;
  touchInstallation(input: {
    installationId: string;
    workspaceId?: string;
    browser?: string;
    extensionVersion?: string;
    schemaVersion?: string;
    capabilities?: string[];
    lastSeenAt: Date;
  }): Promise<void>;
  findUsageLimit(workspaceId: string, key: string): Promise<number | undefined>;
  findActiveQuotaCounter(
    workspaceId: string,
    key: string,
    occurredAt: Date,
  ): Promise<UsageQuotaCounterSnapshot | null>;
  saveQuotaCounter(input: {
    workspaceId: string;
    key: string;
    consumed: number;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<UsageQuotaCounterSnapshot>;
  createTelemetry(input: {
    extensionInstallationId: string;
    eventType: string;
    severity: 'debug' | 'info' | 'warn' | 'error';
    payloadJson: Record<string, unknown>;
    createdAt: Date;
  }): Promise<{ id: string }>;
  createActivityLog(input: {
    workspaceId: string;
    eventType: string;
    metadataJson: Record<string, unknown>;
    createdAt: Date;
  }): Promise<{ id: string }>;
}

export interface UsageProcessingJobResult extends UsageProcessingResult {
  workspaceId?: string;
  quotaKey?: string;
  telemetryId?: string;
  activityLogId?: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

  return entries.length > 0 ? entries : undefined;
}

function resolveQuotaKey(eventType: string): string | undefined {
  if (eventType.includes('screenshot')) {
    return 'limit.screenshots_per_day';
  }

  if (eventType.includes('answer') || eventType.includes('request')) {
    return 'limit.requests_per_day';
  }

  return undefined;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, amount: number): Date {
  const next = new Date(value);

  next.setUTCDate(next.getUTCDate() + amount);
  return next;
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

export async function processUsageEventJob(
  event: UsageEventPayload,
  repository: UsageProcessingRepository,
): Promise<UsageProcessingJobResult> {
  const occurredAt = new Date(event.occurredAt);
  const installation = await repository.findInstallationByInstallationId(event.installationId);
  const workspaceId = event.workspaceId ?? installation?.workspaceId ?? undefined;
  const quotaKey = workspaceId ? resolveQuotaKey(event.eventType) : undefined;
  const limit = workspaceId && quotaKey ? await repository.findUsageLimit(workspaceId, quotaKey) : undefined;
  const activeCounter =
    workspaceId && quotaKey ? await repository.findActiveQuotaCounter(workspaceId, quotaKey, occurredAt) : null;
  const result = processUsageEvent(
    {
      ...event,
      ...(workspaceId ? { workspaceId } : {}),
    },
    {
      consumed: activeCounter?.consumed ?? 0,
      ...(typeof limit === 'number' ? { limit } : {}),
    },
  );

  if (installation) {
    await repository.touchInstallation({
      installationId: installation.installationId,
      ...(workspaceId ? { workspaceId } : {}),
      ...(readString(event.payload.browser) ? { browser: readString(event.payload.browser) } : {}),
      ...(readString(event.payload.extensionVersion)
        ? { extensionVersion: readString(event.payload.extensionVersion) }
        : {}),
      ...(readString(event.payload.schemaVersion) ? { schemaVersion: readString(event.payload.schemaVersion) } : {}),
      ...(readStringArray(event.payload.capabilities) ? { capabilities: readStringArray(event.payload.capabilities) } : {}),
      lastSeenAt: occurredAt,
    });
  }

  const telemetryRecord = installation
    ? await repository.createTelemetry({
        extensionInstallationId: installation.id,
        eventType: event.eventType,
        severity: result.accepted ? 'info' : 'warn',
        payloadJson: event.payload,
        createdAt: occurredAt,
      })
    : null;

  const activityRecord = workspaceId
    ? await repository.createActivityLog({
        workspaceId,
        eventType: `usage.${event.eventType}`,
        metadataJson: {
          installationId: event.installationId,
          accepted: result.accepted,
          ...(quotaKey ? { quotaKey } : {}),
          ...event.payload,
        },
        createdAt: occurredAt,
      })
    : null;

  let nextCounter = activeCounter;

  if (workspaceId && quotaKey && result.accepted) {
    const periodStart = activeCounter?.periodStart ?? startOfUtcDay(occurredAt);
    const periodEnd = activeCounter?.periodEnd ?? addUtcDays(periodStart, 1);

    nextCounter = await repository.saveQuotaCounter({
      workspaceId,
      key: quotaKey,
      consumed: result.nextUsage.consumed,
      periodStart,
      periodEnd,
    });
  }

  return {
    ...result,
    ...(workspaceId ? { workspaceId } : {}),
    ...(nextCounter?.key ? { quotaKey: nextCounter.key } : quotaKey ? { quotaKey } : {}),
    ...(telemetryRecord ? { telemetryId: telemetryRecord.id } : {}),
    ...(activityRecord ? { activityLogId: activityRecord.id } : {}),
  };
}
