import { buildAdminLogEventCreateInput, Prisma, PrismaClient } from '@quizmind/database';

export interface CreateWorkerDomainEventInput {
  eventType: string;
  payloadJson: Record<string, unknown>;
  createdAt: Date;
}

export class WorkerDomainEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateWorkerDomainEventInput): Promise<{ id: string }> {
    return this.prisma.$transaction(async (transaction) => {
      const domainEvent = await transaction.domainEvent.create({
        data: {
          eventType: input.eventType,
          payloadJson: input.payloadJson as Prisma.InputJsonValue,
          createdAt: input.createdAt,
        },
        select: {
          id: true,
        },
      });

      try {
        const upsertData = buildAdminLogEventCreateInput({
          stream: 'domain',
          sourceRecordId: domainEvent.id,
          eventType: input.eventType,
          occurredAt: input.createdAt,
          payload: input.payloadJson,
        });
        await transaction.adminLogEvent.upsert({
          where: { stream_sourceRecordId: { stream: 'domain', sourceRecordId: domainEvent.id } },
          create: upsertData,
          update: upsertData,
        });
      } catch {
        // best effort read-model write: do not fail queue-domain writes
      }

      return domainEvent;
    });
  }
}
