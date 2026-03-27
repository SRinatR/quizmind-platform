import { type StructuredLogEvent } from '@quizmind/logger';

import { type CreateWorkerDomainEventInput } from '../repositories/domain-event.repository';

export interface QueueJobContext {
  queueName: string;
  queueJobId: string;
  attemptNumber: number;
  processedAt: string;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readSummary(metadata: Record<string, unknown>, fallback: string): string {
  if (typeof metadata.summary === 'string' && metadata.summary.trim().length > 0) {
    return metadata.summary.trim();
  }

  return fallback;
}

function readErrorName(error: unknown): string {
  if (error instanceof Error && error.name.trim().length > 0) {
    return error.name;
  }

  return 'Error';
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.slice(0, 1000);
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.slice(0, 1000);
  }

  return 'Queue job processing failed.';
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;

  return typeof code === 'string' && code.trim().length > 0 ? code : null;
}

export function buildQueueLogDomainEvent(
  logEvent: StructuredLogEvent,
  context: QueueJobContext,
): CreateWorkerDomainEventInput {
  const metadata = normalizeMetadata(logEvent.metadata);
  const summary = readSummary(metadata, `${logEvent.eventType} processed on ${context.queueName}.`);

  return {
    workspaceId: logEvent.workspaceId ?? null,
    eventType: logEvent.eventType,
    payloadJson: {
      summary,
      queue: context.queueName,
      queueJobId: context.queueJobId,
      queueAttempt: context.attemptNumber,
      logEventId: logEvent.eventId,
      actorId: logEvent.actorId,
      actorType: logEvent.actorType,
      targetType: logEvent.targetType,
      targetId: logEvent.targetId,
      occurredAt: logEvent.occurredAt,
      severity: logEvent.severity,
      status: logEvent.status ?? null,
      metadata,
    },
    createdAt: new Date(context.processedAt),
  };
}

export function buildQueueJobFailedDomainEvent(
  context: QueueJobContext,
  error: unknown,
  workspaceId: string | null = null,
): CreateWorkerDomainEventInput {
  return {
    workspaceId,
    eventType: `${context.queueName}.job_failed`,
    payloadJson: {
      summary: `Failed to process ${context.queueName} queue job ${context.queueJobId}.`,
      queue: context.queueName,
      queueJobId: context.queueJobId,
      queueAttempt: context.attemptNumber,
      processedAt: context.processedAt,
      errorName: readErrorName(error),
      errorCode: readErrorCode(error),
      errorMessage: readErrorMessage(error),
    },
    createdAt: new Date(context.processedAt),
  };
}
