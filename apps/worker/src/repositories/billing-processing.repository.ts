import { Prisma, PrismaClient } from '@quizmind/database';
import { type SubscriptionStatus } from '@quizmind/contracts';

import {
  type BillingInvoiceSnapshot,
  type BillingPaymentSnapshot,
  type BillingPlanSnapshot,
  type BillingSubscriptionSnapshot,
  type BillingWebhookEventSnapshot,
  type BillingWebhookProcessingRepository,
  type BillingWorkspaceSnapshot,
} from '../jobs/process-billing-webhook';

const subscriptionSelect = {
  id: true,
  workspaceId: true,
  planId: true,
  provider: true,
  providerCustomerId: true,
  providerPriceId: true,
  providerSubscriptionId: true,
  status: true,
  billingInterval: true,
  seatCount: true,
  stripeCustomerId: true,
  stripePriceId: true,
  stripeSubscriptionId: true,
  trialStartAt: true,
} as const;

interface SubscriptionRecord {
  id: string;
  workspaceId: string;
  planId: string;
  provider: string | null;
  providerCustomerId: string | null;
  providerPriceId: string | null;
  providerSubscriptionId: string | null;
  status: SubscriptionStatus;
  billingInterval: string;
  seatCount: number;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
  stripeSubscriptionId: string | null;
  trialStartAt: Date | null;
}

function mapSubscriptionRecord(record: SubscriptionRecord): BillingSubscriptionSnapshot {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    planId: record.planId,
    provider: record.provider,
    providerCustomerId: record.providerCustomerId,
    providerPriceId: record.providerPriceId,
    providerSubscriptionId: record.providerSubscriptionId,
    status: record.status as SubscriptionStatus,
    billingInterval: record.billingInterval === 'yearly' ? 'yearly' : 'monthly',
    seatCount: record.seatCount,
    stripeCustomerId: record.stripeCustomerId,
    stripePriceId: record.stripePriceId,
    stripeSubscriptionId: record.stripeSubscriptionId,
    trialStartAt: record.trialStartAt,
  };
}

export class WorkerBillingProcessingRepository implements BillingWebhookProcessingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findWebhookEventById(webhookEventId: string): Promise<BillingWebhookEventSnapshot | null> {
    return this.prisma.webhookEvent.findUnique({
      where: {
        id: webhookEventId,
      },
    });
  }

  async markWebhookEventProcessed(webhookEventId: string, processedAt: Date): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: {
        id: webhookEventId,
      },
      data: {
        status: 'processed',
        processedAt,
        lastError: null,
      },
    });
  }

  async markWebhookEventFailed(webhookEventId: string, lastError: string): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: {
        id: webhookEventId,
      },
      data: {
        status: 'failed',
        lastError: lastError.slice(0, 1000),
      },
    });
  }

  findWorkspaceById(workspaceId: string): Promise<BillingWorkspaceSnapshot | null> {
    return this.prisma.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      select: {
        id: true,
        providerCustomerId: true,
        stripeCustomerId: true,
      },
    });
  }

  findWorkspaceByStripeCustomerId(stripeCustomerId: string): Promise<BillingWorkspaceSnapshot | null> {
    return this.prisma.workspace.findUnique({
      where: {
        stripeCustomerId,
      },
      select: {
        id: true,
        providerCustomerId: true,
        stripeCustomerId: true,
      },
    });
  }

  async setWorkspaceStripeCustomerId(workspaceId: string, stripeCustomerId: string): Promise<void> {
    await this.prisma.workspace.update({
      where: {
        id: workspaceId,
      },
      data: {
        stripeCustomerId,
      },
    });
  }

  findPlanByCode(planCode: string): Promise<BillingPlanSnapshot | null> {
    return this.prisma.plan.findUnique({
      where: {
        code: planCode,
      },
      select: {
        id: true,
        code: true,
      },
    });
  }

  async findSubscriptionByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<BillingSubscriptionSnapshot | null> {
    const record = await this.prisma.subscription.findUnique({
      where: {
        stripeSubscriptionId,
      },
      select: subscriptionSelect as Prisma.SubscriptionSelect,
    });

    return record ? mapSubscriptionRecord(record as SubscriptionRecord) : null;
  }

  async findCurrentSubscriptionByWorkspaceId(workspaceId: string): Promise<BillingSubscriptionSnapshot | null> {
    const record = await this.prisma.subscription.findFirst({
      where: {
        workspaceId,
      },
      orderBy: [{ currentPeriodEnd: 'desc' }, { createdAt: 'desc' }],
      select: subscriptionSelect as Prisma.SubscriptionSelect,
    });

    return record ? mapSubscriptionRecord(record as SubscriptionRecord) : null;
  }

  async upsertStripeSubscriptionForWorkspace(input: {
    workspaceId: string;
    planId: string;
    provider?: string;
    providerCustomerId?: string;
    providerPriceId?: string;
    providerSubscriptionId?: string;
    stripeCustomerId?: string;
    stripePriceId?: string;
    stripeSubscriptionId: string;
    status: SubscriptionStatus;
    billingInterval: 'monthly' | 'yearly';
    seatCount: number;
    cancelAtPeriodEnd: boolean;
    trialStartAt?: Date;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  }): Promise<BillingSubscriptionSnapshot> {
    const existingByStripeId = await this.prisma.subscription.findUnique({
      where: {
        stripeSubscriptionId: input.stripeSubscriptionId,
      },
      select: subscriptionSelect as Prisma.SubscriptionSelect,
    });
    const existingRecord =
      existingByStripeId ??
      (await this.prisma.subscription.findFirst({
        where: {
          workspaceId: input.workspaceId,
        },
        orderBy: [{ currentPeriodEnd: 'desc' }, { createdAt: 'desc' }],
        select: subscriptionSelect as Prisma.SubscriptionSelect,
      }));

    const persisted = existingRecord
      ? await this.prisma.subscription.update({
          where: {
            id: existingRecord.id,
          },
          data: {
            workspaceId: input.workspaceId,
            planId: input.planId,
            ...(input.provider ? { provider: input.provider } : {}),
            ...(input.providerCustomerId ? { providerCustomerId: input.providerCustomerId } : {}),
            ...(input.providerPriceId ? { providerPriceId: input.providerPriceId } : {}),
            ...(input.providerSubscriptionId ? { providerSubscriptionId: input.providerSubscriptionId } : {}),
            ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
            ...(input.stripePriceId ? { stripePriceId: input.stripePriceId } : {}),
            stripeSubscriptionId: input.stripeSubscriptionId,
            status: input.status,
            billingInterval: input.billingInterval,
            seatCount: input.seatCount,
            cancelAtPeriodEnd: input.cancelAtPeriodEnd,
            ...(input.trialStartAt ? { trialStartAt: input.trialStartAt } : {}),
            currentPeriodStart: input.currentPeriodStart,
            currentPeriodEnd: input.currentPeriodEnd,
          },
          select: subscriptionSelect as Prisma.SubscriptionSelect,
        })
      : await this.prisma.subscription.create({
          data: {
            workspaceId: input.workspaceId,
            planId: input.planId,
            ...(input.provider ? { provider: input.provider } : {}),
            ...(input.providerCustomerId ? { providerCustomerId: input.providerCustomerId } : {}),
            ...(input.providerPriceId ? { providerPriceId: input.providerPriceId } : {}),
            ...(input.providerSubscriptionId ? { providerSubscriptionId: input.providerSubscriptionId } : {}),
            ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
            ...(input.stripePriceId ? { stripePriceId: input.stripePriceId } : {}),
            stripeSubscriptionId: input.stripeSubscriptionId,
            status: input.status,
            billingInterval: input.billingInterval,
            seatCount: input.seatCount,
            cancelAtPeriodEnd: input.cancelAtPeriodEnd,
            ...(input.trialStartAt ? { trialStartAt: input.trialStartAt } : {}),
            currentPeriodStart: input.currentPeriodStart,
            currentPeriodEnd: input.currentPeriodEnd,
          },
          select: subscriptionSelect as Prisma.SubscriptionSelect,
        });

    return mapSubscriptionRecord(persisted as SubscriptionRecord);
  }

  async updateSubscriptionStatus(subscriptionId: string, status: SubscriptionStatus): Promise<void> {
    await this.prisma.subscription.update({
      where: {
        id: subscriptionId,
      },
      data: {
        status,
      },
    });
  }

  upsertInvoice(input: {
    subscriptionId: string;
    provider?: string;
    providerInvoiceId?: string;
    externalId: string;
    amountDue: number;
    amountPaid: number;
    currency: string;
    issuedAt: Date;
    dueAt?: Date | null;
    paidAt?: Date | null;
  }): Promise<BillingInvoiceSnapshot> {
    return this.prisma.invoice.upsert({
      where: {
        externalId: input.externalId,
      },
      update: {
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.providerInvoiceId ? { providerInvoiceId: input.providerInvoiceId } : {}),
        amountDue: input.amountDue,
        amountPaid: input.amountPaid,
        currency: input.currency,
        issuedAt: input.issuedAt,
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
      },
      create: {
        subscriptionId: input.subscriptionId,
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.providerInvoiceId ? { providerInvoiceId: input.providerInvoiceId } : {}),
        externalId: input.externalId,
        amountDue: input.amountDue,
        amountPaid: input.amountPaid,
        currency: input.currency,
        issuedAt: input.issuedAt,
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
      },
      select: {
        id: true,
      },
    });
  }

  upsertPayment(input: {
    subscriptionId: string;
    provider?: string;
    providerPaymentId?: string;
    externalId: string;
    amount: number;
    currency: string;
    status: string;
    processedAt?: Date | null;
  }): Promise<BillingPaymentSnapshot> {
    return this.prisma.payment.upsert({
      where: {
        externalId: input.externalId,
      },
      update: {
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.providerPaymentId ? { providerPaymentId: input.providerPaymentId } : {}),
        amount: input.amount,
        currency: input.currency,
        status: input.status,
        ...(input.processedAt !== undefined ? { processedAt: input.processedAt } : {}),
      },
      create: {
        subscriptionId: input.subscriptionId,
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.providerPaymentId ? { providerPaymentId: input.providerPaymentId } : {}),
        externalId: input.externalId,
        amount: input.amount,
        currency: input.currency,
        status: input.status,
        ...(input.processedAt !== undefined ? { processedAt: input.processedAt } : {}),
      },
      select: {
        id: true,
      },
    });
  }
}
