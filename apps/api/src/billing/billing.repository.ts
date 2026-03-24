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
    include: {
      providerMappings: {
        orderBy: [{ provider: 'asc' }],
      },
    },
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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  entitlements: Array<{
    id: string;
    planId: string;
    key: string;
    enabled: boolean;
    limitValue: number | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  prices: Array<{
    id: string;
    planId: string;
    intervalCode: string;
    currency: string;
    amount: number;
    isDefault: boolean;
    stripePriceId: string | null;
    providerMappings: Array<{
      id: string;
      planPriceId: string;
      provider: string;
      providerPriceId: string;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
    createdAt: Date;
  }>;
  subscriptions?: Array<{
    id: string;
  }>;
}

export interface BillingWorkspaceContextRecord {
  id: string;
  slug: string;
  name: string;
  billingEmail: string | null;
  billingProvider: string | null;
  providerCustomerId: string | null;
  stripeCustomerId: string | null;
  subscriptions: Array<{
    id: string;
    provider: string | null;
    seatCount: number;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
    providerCustomerId: string | null;
    providerPriceId: string | null;
    providerSubscriptionId: string | null;
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
  provider: string | null;
  providerInvoiceId: string | null;
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
  provider: string | null;
  providerInvoiceId: string | null;
  externalId: string | null;
  workspaceId: string;
}

@Injectable()
export class BillingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAllPlans(): Promise<BillingPlanCatalogRecord[]> {
    const records = await this.prisma.plan.findMany({
      include: billingPlanCatalogInclude,
      orderBy: [{ createdAt: 'asc' }],
    });

    return records as unknown as BillingPlanCatalogRecord[];
  }

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

  async findPlanByCode(planCode: string): Promise<BillingPlanCatalogRecord | null> {
    const record = await this.prisma.plan.findUnique({
      where: {
        code: planCode,
      },
      include: billingPlanCatalogInclude,
    });

    return record as BillingPlanCatalogRecord | null;
  }

  async replacePlanCatalogEntry(input: {
    planCode: string;
    name: string;
    description: string;
    isActive: boolean;
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
      providerMappings?: Array<{
        provider: string;
        providerPriceId: string;
        isActive: boolean;
      }>;
    }>;
  }): Promise<BillingPlanCatalogRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.plan.findUnique({
        where: {
          code: input.planCode,
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        return null;
      }

      await tx.plan.update({
        where: {
          id: existing.id,
        },
        data: {
          name: input.name,
          description: input.description,
          isActive: input.isActive,
        },
      });

      await tx.planPriceProviderMapping.deleteMany({
        where: {
          planPrice: {
            planId: existing.id,
          },
        },
      });

      await tx.planPrice.deleteMany({
        where: {
          planId: existing.id,
        },
      });

      if (input.prices.length > 0) {
        for (const price of input.prices) {
          const createdPrice = await tx.planPrice.create({
            data: {
              planId: existing.id,
              intervalCode: price.intervalCode,
              currency: price.currency,
              amount: price.amount,
              isDefault: price.isDefault,
              stripePriceId: price.stripePriceId,
            },
          });
          const providerMappings = [
            ...(price.providerMappings ?? []),
            ...(price.stripePriceId
              ? [
                  {
                    provider: 'stripe',
                    providerPriceId: price.stripePriceId,
                    isActive: true,
                  },
                ]
              : []),
          ].filter(
            (mapping, index, items) =>
              items.findIndex(
                (candidate) =>
                  candidate.provider === mapping.provider && candidate.providerPriceId === mapping.providerPriceId,
              ) === index,
          );

          if (providerMappings.length > 0) {
            await tx.planPriceProviderMapping.createMany({
              data: providerMappings.map((mapping) => ({
                planPriceId: createdPrice.id,
                provider: mapping.provider,
                providerPriceId: mapping.providerPriceId,
                isActive: mapping.isActive,
              })),
            });
          }
        }
      }

      await tx.planEntitlement.deleteMany({
        where: {
          planId: existing.id,
        },
      });

      if (input.entitlements.length > 0) {
        await tx.planEntitlement.createMany({
          data: input.entitlements.map((entitlement) => ({
            planId: existing.id,
            key: entitlement.key,
            enabled: entitlement.enabled,
            limitValue: entitlement.limitValue,
          })),
        });
      }

      const record = await tx.plan.findUnique({
        where: {
          id: existing.id,
        },
        include: billingPlanCatalogInclude,
      });

      return record as BillingPlanCatalogRecord | null;
    });
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
        billingProvider: 'stripe',
        providerCustomerId: stripeCustomerId,
        stripeCustomerId,
      },
    });
  }

  async updateWorkspaceProviderCustomerId(input: {
    workspaceId: string;
    provider: string;
    providerCustomerId: string;
    stripeCustomerId?: string;
  }): Promise<void> {
    await this.prisma.workspace.update({
      where: {
        id: input.workspaceId,
      },
      data: {
        billingProvider: input.provider,
        providerCustomerId: input.providerCustomerId,
        ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
      },
    });
  }

  async updateSubscriptionLifecycle(
    subscriptionId: string,
    input: {
      cancelAtPeriodEnd: boolean;
      provider?: string;
      status?: string;
      currentPeriodEnd?: Date | null;
      providerCustomerId?: string;
      providerPriceId?: string;
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
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.status ? { status: input.status as never } : {}),
        ...(input.currentPeriodEnd !== undefined ? { currentPeriodEnd: input.currentPeriodEnd } : {}),
        ...(input.providerCustomerId ? { providerCustomerId: input.providerCustomerId } : {}),
        ...(input.providerPriceId ? { providerPriceId: input.providerPriceId } : {}),
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
        provider: true,
        providerInvoiceId: true,
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
        provider: true,
        providerInvoiceId: true,
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
      provider: record.provider,
      providerInvoiceId: record.providerInvoiceId,
      externalId: record.externalId,
      workspaceId: record.subscription.workspaceId,
    };
  }
}
