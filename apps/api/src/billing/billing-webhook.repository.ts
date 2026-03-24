import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

export type BillingWebhookEventRecord = Prisma.WebhookEventGetPayload<{}>;

const billingWebhookAdminSelect = {
  id: true,
  provider: true,
  externalEventId: true,
  eventType: true,
  status: true,
  providerCreatedAt: true,
  processedAt: true,
  lastError: true,
  receivedAt: true,
} as const;

export type BillingWebhookAdminRecord = Prisma.WebhookEventGetPayload<{
  select: typeof billingWebhookAdminSelect;
}>;

interface RecordReceivedWebhookEventInput {
  provider: string;
  externalEventId: string;
  eventType: string;
  payloadJson: Prisma.InputJsonValue;
  providerCreatedAt?: Date;
}

@Injectable()
export class BillingWebhookRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordReceivedEvent(
    input: RecordReceivedWebhookEventInput,
  ): Promise<{ record: BillingWebhookEventRecord; duplicate: boolean }> {
    try {
      const record = await this.prisma.webhookEvent.create({
        data: {
          provider: input.provider,
          externalEventId: input.externalEventId,
          eventType: input.eventType,
          status: 'received',
          payloadJson: input.payloadJson,
          providerCreatedAt: input.providerCreatedAt,
        },
      });

      return { record, duplicate: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const record = await this.prisma.webhookEvent.findFirst({
          where: {
            provider: input.provider,
            externalEventId: input.externalEventId,
          },
        });

        if (!record) {
          throw error;
        }

        return { record, duplicate: true };
      }

      throw error;
    }
  }

  findEventById(webhookEventId: string): Promise<BillingWebhookEventRecord | null> {
    return this.prisma.webhookEvent.findUnique({
      where: {
        id: webhookEventId,
      },
    });
  }

  listRecentEvents(limit: number): Promise<BillingWebhookAdminRecord[]> {
    return this.prisma.webhookEvent.findMany({
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: billingWebhookAdminSelect,
    });
  }

  resetEventForRetry(webhookEventId: string): Promise<BillingWebhookEventRecord> {
    return this.prisma.webhookEvent.update({
      where: {
        id: webhookEventId,
      },
      data: {
        status: 'received',
        processedAt: null,
        lastError: null,
      },
    });
  }
}
