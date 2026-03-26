import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { type StructuredLogEvent } from '@quizmind/logger';

import { PrismaService } from '../database/prisma.service';

interface RecordExtensionLifecycleEventInput {
  workspaceId?: string | null;
  occurredAt: Date;
  auditLog: StructuredLogEvent;
  securityLog: StructuredLogEvent;
  domainEventType: string;
  domainPayload: Prisma.InputJsonValue;
}

function buildMetadataJson(event: StructuredLogEvent): Prisma.InputJsonValue {
  return {
    ...((event.metadata ?? {}) as Prisma.InputJsonObject),
    eventId: event.eventId,
    severity: event.severity,
    ...(event.status ? { status: event.status } : {}),
  };
}

@Injectable()
export class ExtensionEventRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordLifecycleEvent(input: RecordExtensionLifecycleEventInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.auditLog.create({
        data: {
          workspaceId: input.workspaceId ?? null,
          actorId: input.auditLog.actorId || null,
          action: input.auditLog.eventType,
          targetType: input.auditLog.targetType,
          targetId: input.auditLog.targetId,
          metadataJson: buildMetadataJson(input.auditLog),
          createdAt: input.occurredAt,
        },
      });

      await transaction.securityEvent.create({
        data: {
          workspaceId: input.workspaceId ?? null,
          actorId: input.securityLog.actorId || null,
          eventType: input.securityLog.eventType,
          severity: input.securityLog.severity,
          metadataJson: buildMetadataJson(input.securityLog),
          createdAt: input.occurredAt,
        },
      });

      await transaction.domainEvent.create({
        data: {
          workspaceId: input.workspaceId ?? null,
          eventType: input.domainEventType,
          payloadJson: input.domainPayload,
          createdAt: input.occurredAt,
        },
      });
    });
  }
}
