import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import {
  type BillingWebhookIngestResult,
  type BillingWebhookJobPayload,
} from '@quizmind/contracts';
import { Prisma } from '@quizmind/database';
import { createQueueDispatchRequest } from '@quizmind/queue';

import { BillingWebhookRepository } from './billing-webhook.repository';
import { WalletService } from '../wallet/wallet.service';
import { QueueDispatchService } from '../queue/queue-dispatch.service';

interface YookassaWebhookEvent {
  id: string;
  type: string;
  createdAt?: Date;
  payload: Record<string, unknown>;
}

@Injectable()
export class BillingService {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(BillingWebhookRepository)
    private readonly billingWebhookRepository: BillingWebhookRepository,
    @Inject(WalletService)
    private readonly walletService: WalletService,
    @Inject(QueueDispatchService)
    private readonly queueDispatchService: QueueDispatchService,
  ) {}

  async ingestYookassaWebhook(rawBody?: Buffer | null): Promise<BillingWebhookIngestResult> {
    this.assertYookassaWebhookReady();

    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing raw YooKassa webhook payload.');
    }

    const event = this.parseYookassaWebhookEvent(rawBody);
    const persistedEvent = await this.billingWebhookRepository.recordReceivedEvent({
      provider: 'yookassa',
      externalEventId: event.id,
      eventType: event.type,
      payloadJson: event.payload as Prisma.InputJsonValue,
      providerCreatedAt: event.createdAt,
    });

    if (persistedEvent.duplicate) {
      return {
        accepted: true,
        duplicate: true,
        provider: 'yookassa',
        eventId: event.id,
        eventType: event.type,
        receivedAt: persistedEvent.record.receivedAt.toISOString(),
      };
    }

    // Process wallet top-up events directly (idempotent)
    const objectValue =
      event.payload.object && typeof event.payload.object === 'object' && !Array.isArray(event.payload.object)
        ? (event.payload.object as Record<string, unknown>)
        : undefined;
    const paymentId = typeof objectValue?.id === 'string' ? objectValue.id.trim() : event.id;
    const paidAtRaw = typeof objectValue?.captured_at === 'string' ? objectValue.captured_at : undefined;
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();

    await this.walletService.processYookassaPaymentEvent({
      eventType: event.type,
      paymentId,
      paidAt,
    });

    const job = await this.queueDispatchService.dispatch<BillingWebhookJobPayload>(
      createQueueDispatchRequest({
        queue: 'billing-webhooks',
        payload: {
          provider: 'yookassa',
          webhookEventId: persistedEvent.record.id,
          externalEventId: event.id,
          eventType: event.type,
          receivedAt: persistedEvent.record.receivedAt.toISOString(),
        },
      }),
    );

    return {
      accepted: true,
      duplicate: false,
      provider: 'yookassa',
      eventId: event.id,
      eventType: event.type,
      receivedAt: persistedEvent.record.receivedAt.toISOString(),
      queue: job.queue,
      jobId: job.id,
    };
  }

  private assertYookassaWebhookReady(): void {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('YooKassa webhook endpoint requires QUIZMIND_RUNTIME_MODE=connected.');
    }
  }

  private parseYookassaWebhookEvent(rawBody: Buffer): YookassaWebhookEvent {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('YooKassa webhook payload is not valid JSON.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException('YooKassa webhook payload must be a JSON object.');
    }

    const obj = parsed as Record<string, unknown>;
    const id = typeof obj['id'] === 'string' && obj['id'].trim() ? obj['id'].trim() : undefined;
    const type = typeof obj['type'] === 'string' && obj['type'].trim() ? obj['type'].trim() : undefined;

    if (!id || !type) {
      throw new BadRequestException('YooKassa webhook payload is missing required id or type fields.');
    }

    const createdAtRaw = obj['created_at'] ?? obj['createdAt'];
    const createdAt =
      typeof createdAtRaw === 'string' && createdAtRaw.trim()
        ? new Date(createdAtRaw)
        : typeof createdAtRaw === 'number'
        ? new Date(createdAtRaw)
        : undefined;

    const payload =
      obj['object'] && typeof obj['object'] === 'object' && !Array.isArray(obj['object'])
        ? { object: obj['object'] as Record<string, unknown>, ...obj }
        : { ...obj };

    return { id, type, ...(createdAt ? { createdAt } : {}), payload };
  }
}
