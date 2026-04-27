import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { type StructuredLogEvent } from '@quizmind/logger';

import { PrismaService } from '../database/prisma.service';
import {
  buildReadModelFromAuditRow,
  buildReadModelFromSecurityRow,
  createAuditLogWithReadModel,
  createSecurityEventWithReadModel,
  upsertAdminLogEventsBestEffort,
  type ReadModelUpsert,
} from '../logs/admin-log-write-path';

const recentSupportImpersonationSessionInclude = {
  supportActor: {
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  },
  targetUser: {
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  },
  supportTicket: {
    select: {
      id: true,
      subject: true,
      status: true,
    },
  },
} satisfies Prisma.SupportImpersonationSessionInclude;

export type RecentSupportImpersonationSessionRecord = Prisma.SupportImpersonationSessionGetPayload<{
  include: typeof recentSupportImpersonationSessionInclude;
}>;

interface CreateSupportImpersonationSessionInput {
  impersonationSessionId: string;
  supportActorId: string;
  targetUserId: string;
  supportTicketId?: string;
  reason: string;
  operatorNote?: string;
  createdAt: Date;
  auditLog: StructuredLogEvent;
  securityLog: StructuredLogEvent;
}

interface EndSupportImpersonationSessionInput {
  impersonationSessionId: string;
  endedAt: Date;
  closeReason?: string;
  auditLog: StructuredLogEvent;
  securityLog: StructuredLogEvent;
}

function buildMetadataJson(event: StructuredLogEvent): Prisma.InputJsonValue {
  return {
    ...((event.metadata ?? {}) as Prisma.InputJsonObject),
    source: 'web',
    eventId: event.eventId,
    severity: event.severity,
    ...(event.status ? { status: event.status } : {}),
  };
}

@Injectable()
export class SupportImpersonationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listRecent(limit = 8): Promise<RecentSupportImpersonationSessionRecord[]> {
    return this.prisma.supportImpersonationSession.findMany({
      include: recentSupportImpersonationSessionInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
  }

  findById(impersonationSessionId: string): Promise<RecentSupportImpersonationSessionRecord | null> {
    return this.prisma.supportImpersonationSession.findUnique({
      where: {
        id: impersonationSessionId,
      },
      include: recentSupportImpersonationSessionInclude,
    });
  }

  async createSessionWithLogs(
    input: CreateSupportImpersonationSessionInput,
  ): Promise<void> {
    const readModelEvents = await this.prisma.$transaction(async (transaction) => {
      const readModelEvents: ReadModelUpsert[] = [];
      await transaction.supportImpersonationSession.create({
        data: {
          id: input.impersonationSessionId,
          supportActorId: input.supportActorId,
          targetUserId: input.targetUserId,

          supportTicketId: input.supportTicketId ?? null,
          reason: input.reason,
          operatorNote: input.operatorNote ?? null,
          createdAt: input.createdAt,
        },
      });

      const auditRow = await createAuditLogWithReadModel(transaction, {
        actorId: input.supportActorId,
        action: input.auditLog.eventType,
        targetType: input.auditLog.targetType,
        targetId: input.auditLog.targetId,
        metadataJson: buildMetadataJson(input.auditLog),
        createdAt: input.createdAt,
      });
      readModelEvents.push(buildReadModelFromAuditRow(auditRow));

      const securityRow = await createSecurityEventWithReadModel(transaction, {
        actorId: input.supportActorId,
        eventType: input.securityLog.eventType,
        severity: input.securityLog.severity,
        metadataJson: buildMetadataJson(input.securityLog),
        createdAt: input.createdAt,
      });
      readModelEvents.push(buildReadModelFromSecurityRow(securityRow));

      return readModelEvents;
    });

    await upsertAdminLogEventsBestEffort(this.prisma, readModelEvents);
  }

  async endSessionWithLogs(
    input: EndSupportImpersonationSessionInput,
  ): Promise<RecentSupportImpersonationSessionRecord | null> {
    const txResult = await this.prisma.$transaction(async (transaction) => {
      const readModelEvents: ReadModelUpsert[] = [];
      const existingSession = await transaction.supportImpersonationSession.findUnique({
        where: {
          id: input.impersonationSessionId,
        },
        include: recentSupportImpersonationSessionInclude,
      });

      if (!existingSession) {
        return { endedSession: null, readModelEvents };
      }

      if (existingSession.endedAt) {
        return { endedSession: existingSession, readModelEvents };
      }

      const endedSession = await transaction.supportImpersonationSession.update({
        where: {
          id: input.impersonationSessionId,
        },
        data: {
          endedAt: input.endedAt,
          closeReason: input.closeReason ?? null,
        },
        include: recentSupportImpersonationSessionInclude,
      });

      const auditRow = await createAuditLogWithReadModel(transaction, {
        actorId: input.auditLog.actorId,
        action: input.auditLog.eventType,
        targetType: input.auditLog.targetType,
        targetId: input.auditLog.targetId,
        metadataJson: buildMetadataJson(input.auditLog),
        createdAt: input.endedAt,
      });
      readModelEvents.push(buildReadModelFromAuditRow(auditRow));

      const securityRow = await createSecurityEventWithReadModel(transaction, {
        actorId: input.securityLog.actorId,
        eventType: input.securityLog.eventType,
        severity: input.securityLog.severity,
        metadataJson: buildMetadataJson(input.securityLog),
        createdAt: input.endedAt,
      });
      readModelEvents.push(buildReadModelFromSecurityRow(securityRow));

      return { endedSession, readModelEvents };
    });

    await upsertAdminLogEventsBestEffort(this.prisma, txResult.readModelEvents);
    return txResult.endedSession;
  }
}
