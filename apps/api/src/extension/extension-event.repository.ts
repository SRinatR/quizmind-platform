import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { type StructuredLogEvent } from '@quizmind/logger';

import { PrismaService } from '../database/prisma.service';
import {
  createAuditLogWithReadModel,
  createDomainEventWithReadModel,
  createSecurityEventWithReadModel,
} from '../logs/admin-log-write-path';

interface RecordExtensionLifecycleEventInput {
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
      await createAuditLogWithReadModel(transaction, {
          actorId: input.auditLog.actorId || null,
          action: input.auditLog.eventType,
          targetType: input.auditLog.targetType,
          targetId: input.auditLog.targetId,
          metadataJson: buildMetadataJson(input.auditLog),
          createdAt: input.occurredAt,
      });

      await createSecurityEventWithReadModel(transaction, {
          actorId: input.securityLog.actorId || null,
          eventType: input.securityLog.eventType,
          severity: input.securityLog.severity,
          metadataJson: buildMetadataJson(input.securityLog),
          createdAt: input.occurredAt,
      });

      await createDomainEventWithReadModel(transaction, {
          eventType: input.domainEventType,
          payloadJson: input.domainPayload,
          createdAt: input.occurredAt,
      });
    });
  }
}
