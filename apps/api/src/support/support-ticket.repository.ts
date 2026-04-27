import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { type TicketStatus } from '@quizmind/contracts';
import { type StructuredLogEvent } from '@quizmind/logger';

import { PrismaService } from '../database/prisma.service';
import {
  buildReadModelFromAuditRow,
  createAuditLogWithReadModel,
  upsertAdminLogEventsBestEffort,
} from '../logs/admin-log-write-path';

const recentSupportTicketInclude = {
  requester: {
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  },
  workspace: {
    select: {
      id: true,
      slug: true,
      name: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  },
} satisfies Prisma.SupportTicketInclude;

export type RecentSupportTicketRecord = Prisma.SupportTicketGetPayload<{
  include: typeof recentSupportTicketInclude;
}>;

export type SupportTicketTimelineRecord = Prisma.AuditLogGetPayload<Record<string, never>>;

export interface UpdateSupportTicketWorkflowInput {
  supportTicketId: string;
  status?: TicketStatus;
  assignedToUserId?: string | null;
  handoffNote?: string | null;
  auditLog: StructuredLogEvent;
}

export interface ListSupportTicketsInput {
  statuses?: TicketStatus[];
  assignedToUserId?: string;
  unassignedOnly?: boolean;
  search?: string;
  limit?: number;
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
export class SupportTicketRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listRecent(input: ListSupportTicketsInput = {}): Promise<RecentSupportTicketRecord[]> {
    const normalizedSearch = input.search?.trim();

    return this.prisma.supportTicket.findMany({
      where: {
        ...(input.statuses?.length ? { status: { in: input.statuses } } : {}),
        ...(input.unassignedOnly
          ? { assignedToId: null }
          : input.assignedToUserId
            ? { assignedToId: input.assignedToUserId }
            : {}),
        ...(normalizedSearch
          ? {
              OR: [
                {
                  subject: {
                    contains: normalizedSearch,
                    mode: 'insensitive',
                  },
                },
                {
                  body: {
                    contains: normalizedSearch,
                    mode: 'insensitive',
                  },
                },
                {
                  requester: {
                    is: {
                      OR: [
                        {
                          email: {
                            contains: normalizedSearch,
                            mode: 'insensitive',
                          },
                        },
                        {
                          displayName: {
                            contains: normalizedSearch,
                            mode: 'insensitive',
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: recentSupportTicketInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: input.limit ?? 8,
    });
  }

  findById(supportTicketId: string): Promise<RecentSupportTicketRecord | null> {
    return this.prisma.supportTicket.findUnique({
      where: {
        id: supportTicketId,
      },
      include: recentSupportTicketInclude,
    });
  }

  async listTimelineEntries(
    supportTicketIds: string[],
    limitPerTicket = 4,
  ): Promise<SupportTicketTimelineRecord[]> {
    if (supportTicketIds.length === 0) {
      return [];
    }

    const records = await this.prisma.auditLog.findMany({
      where: {
        targetType: 'support_ticket',
        targetId: {
          in: supportTicketIds,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const counts = new Map<string, number>();

    return records.filter((record) => {
      const currentCount = counts.get(record.targetId) ?? 0;

      if (currentCount >= limitPerTicket) {
        return false;
      }

      counts.set(record.targetId, currentCount + 1);

      return true;
    });
  }

  async updateWorkflow(input: UpdateSupportTicketWorkflowInput): Promise<RecentSupportTicketRecord> {
    const txResult = await this.prisma.$transaction(async (transaction) => {
      const updatedTicket = await transaction.supportTicket.update({
        where: {
          id: input.supportTicketId,
        },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.assignedToUserId !== undefined ? { assignedToId: input.assignedToUserId } : {}),
          ...(input.handoffNote !== undefined ? { handoffNote: input.handoffNote } : {}),
        },
        include: recentSupportTicketInclude,
      });

      const auditRow = await createAuditLogWithReadModel(transaction, {
        actorId: input.auditLog.actorId,
        action: input.auditLog.eventType,
        targetType: input.auditLog.targetType,
        targetId: input.auditLog.targetId,
        metadataJson: buildMetadataJson(input.auditLog),
        createdAt: new Date(input.auditLog.occurredAt),
      });

      return { updatedTicket, readModelEvents: [buildReadModelFromAuditRow(auditRow)] };
    });

    await upsertAdminLogEventsBestEffort(this.prisma, txResult.readModelEvents);
    return txResult.updatedTicket;
  }
}
