import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { type TicketStatus } from '@quizmind/contracts';

import { PrismaService } from '../database/prisma.service';

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

export interface UpdateSupportTicketWorkflowInput {
  supportTicketId: string;
  status?: TicketStatus;
  assignedToUserId?: string | null;
  handoffNote?: string | null;
}

@Injectable()
export class SupportTicketRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listRecent(limit = 8): Promise<RecentSupportTicketRecord[]> {
    return this.prisma.supportTicket.findMany({
      where: {
        status: {
          in: ['open', 'in_progress'],
        },
      },
      include: recentSupportTicketInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
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

  updateWorkflow(input: UpdateSupportTicketWorkflowInput): Promise<RecentSupportTicketRecord> {
    return this.prisma.supportTicket.update({
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
  }
}
