import { type BillingWebhookJobPayload } from '@quizmind/contracts';
import { createLogEvent } from '@quizmind/logger';

export interface BillingWebhookEventSnapshot {
  id: string;
  provider: string;
  externalEventId: string;
  eventType: string;
  payloadJson: unknown;
  status: string;
  receivedAt: Date;
  processedAt?: Date | null;
}

export interface BillingWebhookProcessingRepository {
  findWebhookEventById(webhookEventId: string): Promise<BillingWebhookEventSnapshot | null>;
  markWebhookEventProcessed(webhookEventId: string, processedAt: Date): Promise<void>;
  markWebhookEventFailed(webhookEventId: string, lastError: string): Promise<void>;
}

export interface BillingWebhookProcessingResult {
  processed: boolean;
  webhookEventId: string;
  externalEventId: string;
  eventType: string;
  logEvent: ReturnType<typeof createLogEvent>;
}

export async function processBillingWebhookJob(
  job: BillingWebhookJobPayload,
  repository: BillingWebhookProcessingRepository,
): Promise<BillingWebhookProcessingResult> {
  const webhook = await repository.findWebhookEventById(job.webhookEventId);

  if (!webhook) {
    throw new Error(`Billing webhook event ${job.webhookEventId} was not found.`);
  }

  if (webhook.processedAt || webhook.status === 'processed') {
    return {
      processed: false,
      webhookEventId: webhook.id,
      externalEventId: webhook.externalEventId,
      eventType: webhook.eventType,
      logEvent: createLogEvent({
        eventId: `billing-webhook:${webhook.id}:skipped`,
        eventType: 'billing.webhook_skipped',
        actorId: webhook.provider,
        actorType: 'system',
        targetType: 'billing_webhook',
        targetId: webhook.externalEventId,
        occurredAt: new Date().toISOString(),
        category: 'domain',
        severity: 'info',
        status: 'success',
        metadata: { reason: 'already_processed', webhookEventId: webhook.id },
      }),
    };
  }

  const processedAt = new Date();

  await repository.markWebhookEventProcessed(webhook.id, processedAt);

  return {
    processed: true,
    webhookEventId: webhook.id,
    externalEventId: webhook.externalEventId,
    eventType: webhook.eventType,
    logEvent: createLogEvent({
      eventId: `billing-webhook:${webhook.id}:processed`,
      eventType: 'billing.webhook_processed',
      actorId: webhook.provider,
      actorType: 'system',
      targetType: 'billing_webhook',
      targetId: webhook.externalEventId,
      occurredAt: processedAt.toISOString(),
      category: 'domain',
      severity: 'info',
      status: 'success',
      metadata: { webhookEventId: webhook.id, provider: webhook.provider },
    }),
  };
}
