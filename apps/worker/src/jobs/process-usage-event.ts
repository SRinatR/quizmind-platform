import { createLogEvent } from '@quizmind/logger';
import { type UsageEventPayload } from '@quizmind/contracts';
import {
  canConsumeUsage,
  incrementUsage,
  type UsageSnapshot,
} from '@quizmind/usage';

export interface UsageProcessingResult {
  accepted: boolean;
  nextUsage: UsageSnapshot;
  logEvent: ReturnType<typeof createLogEvent>;
}

export interface UsageInstallationSnapshot {
  id: string;
  installationId: string;
  browser: string;
  extensionVersion: string;
  schemaVersion: string;
  capabilities: string[];
  lastSeenAt?: Date | null;
}

export interface UsageProcessingRepository {
  findInstallationByInstallationId(installationId: string): Promise<UsageInstallationSnapshot | null>;
  touchInstallation(input: {
    installationId: string;
    browser?: string;
    extensionVersion?: string;
    schemaVersion?: string;
    capabilities?: string[];
    lastSeenAt: Date;
  }): Promise<void>;
  createTelemetry(input: {
    extensionInstallationId: string;
    eventType: string;
    severity: 'debug' | 'info' | 'warn' | 'error';
    payloadJson: Record<string, unknown>;
    createdAt: Date;
  }): Promise<{ id: string }>;
}

export interface UsageProcessingJobResult extends UsageProcessingResult {
  telemetryId?: string;
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

export function processUsageEvent(
  event: UsageEventPayload,
  usage: UsageSnapshot,
): UsageProcessingResult {
  const accepted = canConsumeUsage(usage);
  const nextUsage = accepted ? incrementUsage(usage) : usage;

  return {
    accepted,
    nextUsage,
    logEvent: createLogEvent({
      eventId: `${event.installationId}:${event.occurredAt}`,
      eventType: event.eventType,
      actorId: event.installationId,
      actorType: 'system',
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
  const result = processUsageEvent(event, { consumed: 0 });

  if (installation) {
    await repository.touchInstallation({
      installationId: installation.installationId,
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

  return {
    ...result,
    ...(telemetryRecord ? { telemetryId: telemetryRecord.id } : {}),
  };
}
