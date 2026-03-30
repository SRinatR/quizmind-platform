import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import {
  type WalletBalanceSnapshot,
  type WalletTopUpCreateRequest,
  type WalletTopUpCreateResult,
  type WalletTopUpsPayload,
} from '@quizmind/contracts';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { canReadWorkspaceBilling, canUpdateWorkspaceBilling } from '../services/access-service';
import { YookassaClient } from './yookassa.client';
import { WalletRepository } from './wallet.repository';

const MIN_TOPUP_KOPECKS = 1_000;   // 10 ₽
const MAX_TOPUP_KOPECKS = 1_000_000_00; // 1 000 000 ₽

@Injectable()
export class WalletService {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(WalletRepository)
    private readonly walletRepository: WalletRepository,
  ) {}

  private buildYookassaClient(): YookassaClient {
    const shopId = this.env.yookassaShopId?.trim();
    const secretKey = this.env.yookassaSecretKey?.trim();

    if (!shopId || !secretKey) {
      throw new ServiceUnavailableException(
        'YooKassa is not configured. Set YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY.',
      );
    }

    return new YookassaClient(shopId, secretKey);
  }

  private resolveReturnUrl(): string {
    return this.env.yookassaReturnUrl?.trim() || `${this.env.appUrl}/app/billing`;
  }

  private requireConnectedMode(): void {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Wallet endpoints require QUIZMIND_RUNTIME_MODE=connected.');
    }
  }

  private resolveWorkspaceId(session: CurrentSessionSnapshot, requestedWorkspaceId?: string): string {
    const workspaceId = requestedWorkspaceId?.trim() || session.workspaces[0]?.id;

    if (!workspaceId) {
      throw new NotFoundException('No workspace found for this session.');
    }

    if (!session.workspaces.some((ws) => ws.id === workspaceId)) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    return workspaceId;
  }

  async getBalance(session: CurrentSessionSnapshot, workspaceId?: string): Promise<WalletBalanceSnapshot> {
    this.requireConnectedMode();

    const resolvedWorkspaceId = this.resolveWorkspaceId(session, workspaceId);
    const accessDecision = canReadWorkspaceBilling(session.principal, resolvedWorkspaceId);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const wallet = await this.walletRepository.findOrCreateWallet(resolvedWorkspaceId);

    return {
      workspaceId: resolvedWorkspaceId,
      currency: wallet.currency,
      balanceKopecks: wallet.balanceKopecks,
      balanceRub: wallet.balanceKopecks / 100,
    };
  }

  async listTopUps(session: CurrentSessionSnapshot, workspaceId?: string): Promise<WalletTopUpsPayload> {
    this.requireConnectedMode();

    const resolvedWorkspaceId = this.resolveWorkspaceId(session, workspaceId);
    const accessDecision = canReadWorkspaceBilling(session.principal, resolvedWorkspaceId);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const topUps = await this.walletRepository.findTopUpsByWorkspaceId(resolvedWorkspaceId);

    return {
      workspaceId: resolvedWorkspaceId,
      items: topUps.map((t) => ({
        id: t.id,
        amountKopecks: t.amountKopecks,
        amountRub: t.amountKopecks / 100,
        currency: t.currency,
        status: t.status as 'pending' | 'succeeded' | 'canceled' | 'refunded',
        provider: t.provider,
        providerPaymentId: t.providerPaymentId,
        idempotenceKey: t.idempotenceKey,
        paidAt: t.paidAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  async createTopUp(
    session: CurrentSessionSnapshot,
    request?: Partial<WalletTopUpCreateRequest>,
  ): Promise<WalletTopUpCreateResult> {
    this.requireConnectedMode();

    const resolvedWorkspaceId = this.resolveWorkspaceId(session, request?.workspaceId);
    const accessDecision = canUpdateWorkspaceBilling(session.principal, resolvedWorkspaceId);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const amountKopecks = request?.amountKopecks;

    if (!Number.isInteger(amountKopecks) || amountKopecks === undefined) {
      throw new BadRequestException('amountKopecks must be an integer.');
    }

    if (amountKopecks < MIN_TOPUP_KOPECKS) {
      throw new BadRequestException(`Minimum top-up amount is ${MIN_TOPUP_KOPECKS / 100} ₽.`);
    }

    if (amountKopecks > MAX_TOPUP_KOPECKS) {
      throw new BadRequestException(`Maximum top-up amount is ${MAX_TOPUP_KOPECKS / 100} ₽.`);
    }

    const wallet = await this.walletRepository.findOrCreateWallet(resolvedWorkspaceId);
    const yookassa = this.buildYookassaClient();
    const idempotenceKey = randomUUID();
    const amountRub = (amountKopecks / 100).toFixed(2);

    const payment = await yookassa.createPayment({
      amountKopecks,
      currency: wallet.currency,
      description: `Пополнение баланса QuizMind: ${amountRub} ₽`,
      returnUrl: this.resolveReturnUrl(),
      metadata: {
        walletId: wallet.id,
        workspaceId: resolvedWorkspaceId,
        userId: session.user.id,
        amountKopecks: String(amountKopecks),
      },
      idempotenceKey,
    });

    const topUp = await this.walletRepository.createTopUp({
      walletId: wallet.id,
      workspaceId: resolvedWorkspaceId,
      createdByUserId: session.user.id,
      amountKopecks,
      currency: wallet.currency,
      idempotenceKey,
      providerPaymentId: payment.id,
      confirmationToken: payment.confirmation.confirmation_token,
      metadataJson: {
        yookassaPaymentId: payment.id,
        yookassaStatus: payment.status,
      },
    });

    return {
      topUpId: topUp.id,
      confirmationToken: payment.confirmation.confirmation_token,
      amountKopecks,
      currency: wallet.currency,
      providerPaymentId: payment.id,
      status: 'pending',
    };
  }

  /**
   * Called from the YooKassa webhook handler.
   * Processes payment.succeeded / payment.canceled events for wallet top-ups.
   * Idempotent — safe to call multiple times for the same payment.
   */
  async processYookassaPaymentEvent(input: {
    eventType: string;
    paymentId: string;
    paidAt?: Date;
  }): Promise<{ processed: boolean; reason: string }> {
    const topUp = await this.walletRepository.findTopUpByProviderPaymentId(input.paymentId);

    if (!topUp) {
      return { processed: false, reason: 'no_matching_topup' };
    }

    if (input.eventType === 'payment.succeeded') {
      const wallet = await this.walletRepository.findOrCreateWallet(topUp.workspaceId);
      const result = await this.walletRepository.settleTopUp({
        topUpId: topUp.id,
        walletId: wallet.id,
        amountKopecks: topUp.amountKopecks,
        paidAt: input.paidAt ?? new Date(),
      });

      if (result.alreadySettled) {
        return { processed: false, reason: 'already_settled' };
      }

      return { processed: true, reason: 'balance_credited' };
    }

    if (input.eventType === 'payment.canceled') {
      await this.walletRepository.cancelTopUp(topUp.id);
      return { processed: true, reason: 'topup_canceled' };
    }

    return { processed: false, reason: 'unhandled_event_type' };
  }
}
