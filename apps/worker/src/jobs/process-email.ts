import { type EmailQueueJobPayload } from '@quizmind/contracts';
import { createLogEvent } from '@quizmind/logger';

export interface EmailJobResult {
  delivered: boolean;
  logEvent: ReturnType<typeof createLogEvent>;
}

export function processEmailJob(payload: EmailQueueJobPayload): EmailJobResult {
  return {
    delivered: true,
    logEvent: createLogEvent({
      eventId: `email:${payload.templateKey}:${payload.to}:${payload.requestedAt}`,
      eventType: 'email.delivered',
      actorId: payload.requestedByUserId ?? 'system',
      actorType: payload.requestedByUserId ? 'user' : 'system',
      workspaceId: payload.workspaceId,
      targetType: 'email',
      targetId: payload.to,
      occurredAt: payload.requestedAt,
      category: 'system',
      severity: 'info',
      status: 'success',
      metadata: {
        templateKey: payload.templateKey,
        variableCount: Object.keys(payload.variables).length,
      },
    }),
  };
}
