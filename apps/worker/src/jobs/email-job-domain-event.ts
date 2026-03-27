import { type EmailQueueJobPayload } from '@quizmind/contracts';

import { type EmailJobResult } from './process-email';

export interface EmailQueueJobContext {
  queueName: string;
  queueJobId: string;
  attemptNumber: number;
  processedAt: string;
}

export interface EmailJobDomainEventInput {
  workspaceId: string | null;
  eventType: 'email.job_processed' | 'email.job_failed';
  payloadJson: Record<string, unknown>;
  createdAt: Date;
}

function buildBasePayload(
  payload: EmailQueueJobPayload,
  context: EmailQueueJobContext,
): Record<string, unknown> {
  return {
    queue: context.queueName,
    queueJobId: context.queueJobId,
    queueAttempt: context.attemptNumber,
    templateKey: payload.templateKey,
    recipient: payload.to,
    requestedAt: payload.requestedAt,
    requestedByUserId: payload.requestedByUserId ?? null,
    processedAt: context.processedAt,
  };
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

  return 'Email queue processing failed.';
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;

  return typeof code === 'string' && code.trim().length > 0 ? code : null;
}

export function buildEmailJobProcessedDomainEvent(
  payload: EmailQueueJobPayload,
  result: EmailJobResult,
  context: EmailQueueJobContext,
): EmailJobDomainEventInput {
  return {
    workspaceId: payload.workspaceId ?? null,
    eventType: 'email.job_processed',
    payloadJson: {
      ...buildBasePayload(payload, context),
      summary: `Delivered ${payload.templateKey} to ${payload.to}.`,
      deliveryProvider: result.provider,
      deliveryMessageId: result.messageId,
      delivered: result.delivered,
      logEventId: result.logEvent.eventId,
      logSeverity: result.logEvent.severity,
      logStatus: result.logEvent.status ?? null,
    },
    createdAt: new Date(context.processedAt),
  };
}

export function buildEmailJobFailedDomainEvent(
  payload: EmailQueueJobPayload,
  error: unknown,
  context: EmailQueueJobContext,
): EmailJobDomainEventInput {
  return {
    workspaceId: payload.workspaceId ?? null,
    eventType: 'email.job_failed',
    payloadJson: {
      ...buildBasePayload(payload, context),
      summary: `Failed ${payload.templateKey} delivery to ${payload.to}.`,
      errorName: readErrorName(error),
      errorCode: readErrorCode(error),
      errorMessage: readErrorMessage(error),
    },
    createdAt: new Date(context.processedAt),
  };
}
