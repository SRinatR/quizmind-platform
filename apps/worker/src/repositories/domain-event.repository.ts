import { buildAdminLogEventCreateInput, Prisma, PrismaClient } from '@quizmind/database';

export interface CreateWorkerDomainEventInput {
  eventType: string;
  payloadJson: Record<string, unknown>;
  createdAt: Date;
}

export class WorkerDomainEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateWorkerDomainEventInput): Promise<{ id: string }> {
    return this.prisma.domainEvent.create({
      // Worker keeps an explicit local domain write + read-model upsert sequence.
      // Domain event commit must succeed even if read-model write later fails.
      data: {
        eventType: input.eventType,
        payloadJson: input.payloadJson as Prisma.InputJsonValue,
        createdAt: input.createdAt,
      },
      select: {
        id: true,
      },
    }).then(async (domainEvent) => {
      try {
        const upsertData = buildAdminLogEventCreateInput({
          stream: 'domain',
          sourceRecordId: domainEvent.id,
          eventType: input.eventType,
          occurredAt: input.createdAt,
          payload: input.payloadJson,
        });
        await this.prisma.adminLogEvent.upsert({
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
