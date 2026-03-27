import { type EmailQueueJobPayload, type EmailQueueTemplateKey } from '@quizmind/contracts';
import {
  passwordResetTemplate,
  sendTemplatedEmail,
  type EmailAdapter,
  type EmailTemplate,
  verifyEmailTemplate,
  workspaceInvitationTemplate,
} from '@quizmind/email';
import { createLogEvent } from '@quizmind/logger';

export interface EmailJobResult {
  delivered: boolean;
  provider: string;
  messageId: string;
  logEvent: ReturnType<typeof createLogEvent>;
}

const emailTemplateMap: Record<EmailQueueTemplateKey, EmailTemplate<any>> = {
  'auth.verify-email': verifyEmailTemplate,
  'auth.password-reset': passwordResetTemplate,
  'workspace.invitation': workspaceInvitationTemplate,
};

function resolveEmailTemplate(templateKey: EmailQueueJobPayload['templateKey']) {
  const template = emailTemplateMap[templateKey];

  if (!template) {
    throw new Error(`Unsupported email template key "${templateKey}".`);
  }

  return template;
}

export async function processEmailJob(
  payload: EmailQueueJobPayload,
  adapter: EmailAdapter,
): Promise<EmailJobResult> {
  const template = resolveEmailTemplate(payload.templateKey);
  const delivery = await sendTemplatedEmail(adapter, template, payload.to, payload.variables);

  return {
    delivered: true,
    provider: delivery.provider,
    messageId: delivery.messageId,
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
        provider: delivery.provider,
        messageId: delivery.messageId,
        variableCount: Object.keys(payload.variables).length,
      },
    }),
  };
}
