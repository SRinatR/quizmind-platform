import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const billingPlanCatalogInclude = {
  entitlements: {
    orderBy: {
      key: 'asc',
    },
  },
  prices: {
    orderBy: [{ amount: 'asc' }, { intervalCode: 'asc' }],
  },
} satisfies Prisma.PlanInclude;

const billingWorkspaceContextInclude = {
  subscriptions: {
    orderBy: [{ currentPeriodEnd: 'desc' }, { createdAt: 'desc' }],
    take: 1,
    include: {
      plan: {
        include: {
          entitlements: true,
        },
      },
    },
  },
} satisfies Prisma.WorkspaceInclude;

export interface BillingPlanCatalogRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  entitlements: Array<{
    key: string;
    enabled: boolean;
    limitValue: number | null;
  }>;
  prices: Array<{
    intervalCode: string;
    currency: string;
    amount: number;
    isDefault: boolean;
    stripePriceId: string | null;
  }>;
}

export interface BillingWorkspaceContextRecord {
  id: string;
  slug: string;
  name: string;
  billingEmail: string | null;
  stripeCustomerId: string | null;
  subscriptions: Array<{
    id: string;
    seatCount: number;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
    stripeCustomerId: string | null;
    stripePriceId: string | null;
    stripeSubscriptionId: string | null;
    billingInterval: string;
    trialStartAt: Date | null;
  }>;
}

export interface BillingInvoiceRecord {
  id: string;
  subscriptionId: string;
  externalId: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  issuedAt: Date;
  dueAt: Date | null;
  paidAt: Date | null;
}

export interface BillingInvoiceExportRecord {
  id: string;
  externalId: string | null;
  workspaceId: string;
}

@Injectable()
export class BillingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listActivePlans(): Promise<BillingPlanCatalogRecord[]> {
    const records = await this.prisma.plan.findMany({
      where: {
        isActive: true,
      },
      include: billingPlanCatalogInclude,
      orderBy: [{ createdAt: 'asc' }],
    });

    return records as unknown as BillingPlanCatalogRecord[];
  }

  async findActivePlanByCode(planCode: string): Promise<BillingPlanCatalogRecord | null> {
    const record = await this.prisma.plan.findFirst({
      where: {
        code: planCode,
        isActive: true,
      },
      include: billingPlanCatalogInclude,
    });

    return record as BillingPlanCatalogRecord | null;
  }

  async findWorkspaceBillingContext(workspaceId: string): Promise<BillingWorkspaceContextRecord | null> {
    const record = await this.prisma.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      include: billingWorkspaceContextInclude,
    });

    return record as BillingWorkspaceContextRecord | null;
  }

  async updateWorkspaceStripeCustomerId(workspaceId: string, stripeCustomerId: string): Promise<void> {
    await this.prisma.workspace.update({
      where: {
        id: workspaceId,
      },
      data: {
        stripeCustomerId,
      },
    });
  }

  async updateSubscriptionLifecycle(
    subscriptionId: string,
    input: {
      cancelAtPeriodEnd: boolean;
      status?: string;
      currentPeriodEnd?: Date | null;
      stripeCustomerId?: string;
      stripePriceId?: string;
    },
  ): Promise<void> {
    await this.prisma.subscription.update({
      where: {
        id: subscriptionId,
      },
      data: {
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        ...(input.status ? { status: input.status as never } : {}),
        ...(input.currentPeriodEnd !== undefined ? { currentPeriodEnd: input.currentPeriodEnd } : {}),
        ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
        ...(input.stripePriceId ? { stripePriceId: input.stripePriceId } : {}),
      },
    });
  }

  async listInvoicesByWorkspaceId(workspaceId: string): Promise<BillingInvoiceRecord[]> {
    const records = await this.prisma.invoice.findMany({
      where: {
        subscription: {
          workspaceId,
        },
      },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        subscriptionId: true,
        externalId: true,
        amountDue: true,
        amountPaid: true,
        currency: true,
        issuedAt: true,
        dueAt: true,
        paidAt: true,
      },
    });

    return records as BillingInvoiceRecord[];
  }

  async findInvoiceExportContext(invoiceId: string): Promise<BillingInvoiceExportRecord | null> {
    const record = await this.prisma.invoice.findUnique({
      where: {
        id: invoiceId,
      },
      select: {
        id: true,
        externalId: true,
        subscription: {
          select: {
            workspaceId: true,
          },
        },
      },
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      externalId: record.externalId,
      workspaceId: record.subscription.workspaceId,
    };
  }
}
