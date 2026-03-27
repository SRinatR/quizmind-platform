import { Prisma, PrismaClient } from '@quizmind/database';

export interface CreateWorkerDomainEventInput {
  workspaceId: string | null;
  eventType: string;
  payloadJson: Record<string, unknown>;
  createdAt: Date;
}

export class WorkerDomainEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateWorkerDomainEventInput): Promise<{ id: string }> {
    return this.prisma.domainEvent.create({
      data: {
        workspaceId: input.workspaceId,
        eventType: input.eventType,
        payloadJson: input.payloadJson as Prisma.InputJsonValue,
        createdAt: input.createdAt,
      },
      select: {
        id: true,
      },
    });
  }
}
