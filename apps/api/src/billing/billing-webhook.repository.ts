import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

export type BillingWebhookEventRecord = Prisma.WebhookEventGetPayload<{}>;

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
}
