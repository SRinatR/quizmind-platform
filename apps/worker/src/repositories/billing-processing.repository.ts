import { PrismaClient } from '@quizmind/database';

import {
  type BillingWebhookEventSnapshot,
  type BillingWebhookProcessingRepository,
} from '../jobs/process-billing-webhook';

export class WorkerBillingProcessingRepository implements BillingWebhookProcessingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findWebhookEventById(webhookEventId: string): Promise<BillingWebhookEventSnapshot | null> {
    return this.prisma.webhookEvent.findUnique({
      where: {
        id: webhookEventId,
      },
    });
  }

  async markWebhookEventProcessed(webhookEventId: string, processedAt: Date): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: {
        id: webhookEventId,
      },
      data: {
        status: 'processed',
        processedAt,
        lastError: null,
      },
    });
  }

  async markWebhookEventFailed(webhookEventId: string, lastError: string): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: {
        id: webhookEventId,
      },
      data: {
        status: 'failed',
        lastError: lastError.slice(0, 1000),
      },
    });
  }
}
