import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

export interface WalletRecord {
  id: string;
  userId: string;
  currency: string;
  balanceKopecks: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTopUpRecord {
  id: string;
  walletId: string;
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

export interface WalletDebitResult {
  ledgerEntryId: string;
  newBalanceKopecks: number;
  alreadyProcessed: boolean;
}

@Injectable()
export class WalletRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findOrCreateWalletForUser(userId: string): Promise<WalletRecord> {
    const existing = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.wallet.create({
      data: { userId },
    });
  }

  async createTopUp(input: {
    walletId: string;
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

  /**
   * Read-only balance lookup. Returns null when no wallet exists (treat as 0).
   * Does NOT create a wallet — safe to call from hot paths.
   */
  async findBalanceForUser(userId: string): Promise<number | null> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { balanceKopecks: true },
    });
    return wallet?.balanceKopecks ?? null;
  }

  async findTopUpsByUserId(userId: string, limit = 50): Promise<WalletTopUpRecord[]> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!wallet) {
      return [];
    }

    return this.prisma.walletTopUp.findMany({
      where: { walletId: wallet.id },
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

  async debitUsage(input: {
    userId: string;
    amountKopecks: number;
    currency: string;
    description: string;
    idempotencyKey: string;
    metadataJson?: Prisma.InputJsonValue;
  }): Promise<WalletDebitResult> {
    if (input.amountKopecks <= 0) {
      throw new Error('Usage debit amount must be greater than zero.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.walletLedgerEntry.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, balanceAfterKopecks: true },
      });

      if (existing) {
        return {
          ledgerEntryId: existing.id,
          newBalanceKopecks: existing.balanceAfterKopecks,
          alreadyProcessed: true,
        };
      }

      const wallet = await tx.wallet.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId, currency: input.currency },
        update: {},
        select: { id: true, balanceKopecks: true, currency: true },
      });

      if (wallet.balanceKopecks < input.amountKopecks) {
        throw new Error('Insufficient wallet balance for usage debit.');
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceKopecks: {
            decrement: input.amountKopecks,
          },
        },
        select: { balanceKopecks: true },
      });

      const entry = await tx.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          idempotencyKey: input.idempotencyKey,
          type: 'usage_debit',
          deltaKopecks: -input.amountKopecks,
          balanceAfterKopecks: updatedWallet.balanceKopecks,
          description: input.description,
          ...(input.metadataJson ? { metadataJson: input.metadataJson } : {}),
        },
      });

      return {
        ledgerEntryId: entry.id,
        newBalanceKopecks: updatedWallet.balanceKopecks,
        alreadyProcessed: false,
      };
    });
  }
}
