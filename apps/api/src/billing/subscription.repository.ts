import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const subscriptionInclude = {
  plan: {
    include: {
      entitlements: true,
    },
  },
  workspace: {
    include: {
      entitlementOverrides: true,
    },
  },
} satisfies Prisma.SubscriptionInclude;

export type WorkspaceSubscriptionRecord = Prisma.SubscriptionGetPayload<{
  include: typeof subscriptionInclude;
}>;

@Injectable()
export class SubscriptionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findCurrentByWorkspaceId(workspaceId: string): Promise<WorkspaceSubscriptionRecord | null> {
    return this.prisma.subscription.findFirst({
      where: { workspaceId },
      include: subscriptionInclude,
      orderBy: [{ currentPeriodEnd: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
