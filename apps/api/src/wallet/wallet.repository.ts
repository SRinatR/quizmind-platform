import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

export interface WalletRecord {
  id: string;
  workspaceId: string;
  currency: string;
  balanceKopecks: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTopUpRecord {
  id: string;
  walletId: string;
  workspaceId: string;
  createdByUserId: string;
  amountKopecks: number;
  currency: string;
  status: string;
  provider: string;
  providerPaymentId: string | null;
  idempotenceKey: string;
  metadataJson: Prisma.JsonValue | null;
  confirmationToken: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class WalletRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findOrCreateWallet(workspaceId: string): Promise<WalletRecord> {
    const existing = await this.prisma.wallet.findUnique({
      where: { workspaceId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.wallet.create({
      data: { workspaceId },
    });
  }

  async findWalletByWorkspaceId(workspaceId: string): Promise<WalletRecord | null> {
    return this.prisma.wallet.findUnique({
      where: { workspaceId },
    });
  }

  async createTopUp(input: {
    walletId: string;
    workspaceId: string;
    createdByUserId: string;
    amountKopecks: number;
    currency: string;
    idempotenceKey: string;
    providerPaymentId: string;
    confirmationToken: string;
    metadataJson?: Prisma.InputJsonValue;
  }): Promise<WalletTopUpRecord> {
    return this.prisma.walletTopUp.create({
      data: {
        walletId: input.walletId,
        workspaceId: input.workspaceId,
        createdByUserId: input.createdByUserId,
        amountKopecks: input.amountKopecks,
        currency: input.currency,
        status: 'pending',
        provider: 'yookassa',
        providerPaymentId: input.providerPaymentId,
        idempotenceKey: input.idempotenceKey,
        confirmationToken: input.confirmationToken,
        ...(input.metadataJson ? { metadataJson: input.metadataJson } : {}),
      },
    });
  }

  async findTopUpByProviderPaymentId(providerPaymentId: string): Promise<WalletTopUpRecord | null> {
    return this.prisma.walletTopUp.findUnique({
      where: { providerPaymentId },
    });
  }

  async findTopUpsByWorkspaceId(workspaceId: string, limit = 50): Promise<WalletTopUpRecord[]> {
    return this.prisma.walletTopUp.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Atomically: mark top-up succeeded + credit wallet balance + write ledger entry.
   * Safe to call multiple times — if top-up already succeeded, no-ops.
   */
  async settleTopUp(input: {
    topUpId: string;
    walletId: string;
    amountKopecks: number;
    paidAt: Date;
  }): Promise<{ alreadySettled: boolean; newBalanceKopecks: number }> {
    return this.prisma.$transaction(async (tx) => {
      const topUp = await tx.walletTopUp.findUnique({
        where: { id: input.topUpId },
        select: { id: true, status: true, amountKopecks: true },
      });

      if (!topUp) {
        throw new Error(`WalletTopUp ${input.topUpId} not found.`);
      }

      if (topUp.status === 'succeeded') {
        const wallet = await tx.wallet.findUnique({
          where: { id: input.walletId },
          select: { balanceKopecks: true },
        });
        return { alreadySettled: true, newBalanceKopecks: wallet?.balanceKopecks ?? 0 };
      }

      await tx.walletTopUp.update({
        where: { id: input.topUpId },
        data: {
          status: 'succeeded',
          paidAt: input.paidAt,
        },
      });

      const updatedWallet = await tx.wallet.update({
        where: { id: input.walletId },
        data: {
          balanceKopecks: {
            increment: input.amountKopecks,
          },
        },
        select: { balanceKopecks: true },
      });

      await tx.walletLedgerEntry.create({
        data: {
          walletId: input.walletId,
          topUpId: input.topUpId,
          type: 'topup',
          deltaKopecks: input.amountKopecks,
          balanceAfterKopecks: updatedWallet.balanceKopecks,
          description: `Top-up via YooKassa`,
        },
      });

      return { alreadySettled: false, newBalanceKopecks: updatedWallet.balanceKopecks };
    });
  }

  async cancelTopUp(topUpId: string): Promise<void> {
    await this.prisma.walletTopUp.updateMany({
      where: {
        id: topUpId,
        status: 'pending',
      },
      data: { status: 'canceled' },
    });
  }
}
