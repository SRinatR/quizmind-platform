import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

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
} satisfies Prisma.SupportTicketInclude;

export type RecentSupportTicketRecord = Prisma.SupportTicketGetPayload<{
  include: typeof recentSupportTicketInclude;
}>;

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
}
