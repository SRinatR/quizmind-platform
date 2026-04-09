import assert from 'node:assert/strict';
import test from 'node:test';

import { WalletService } from '../src/wallet/wallet.service';
import { type WalletRepository } from '../src/wallet/wallet.repository';

function buildMockTopUp(overrides: Partial<{
  id: string;
  walletId: string;
  createdByUserId: string;
  amountKopecks: number;
  currency: string;
  status: string;
  provider: string;
  providerPaymentId: string | null;
  idempotenceKey: string;
  metadataJson: null;
  confirmationToken: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'topup-1',
    walletId: 'wallet-1',
    createdByUserId: 'user-1',
    amountKopecks: 50_000,
    currency: 'RUB',
    status: 'pending',
    provider: 'yookassa',
    providerPaymentId: 'yookassa-payment-abc',
    idempotenceKey: 'idempotence-key-1',
    metadataJson: null,
    confirmationToken: 'token-abc',
    paidAt: null,
    createdAt: new Date('2025-01-01T12:00:00Z'),
    updatedAt: new Date('2025-01-01T12:00:00Z'),
    ...overrides,
  };
}

function buildMockWallet(overrides: Partial<{
  id: string;
  userId: string;
  currency: string;
  balanceKopecks: number;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'wallet-1',
    userId: 'user-1',
    currency: 'RUB',
    balanceKopecks: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildWalletService(repositoryOverrides: Partial<WalletRepository> = {}): WalletService {
  const mockRepository = {
    findOrCreateWalletForUser: async () => buildMockWallet(),
    createTopUp: async () => buildMockTopUp(),
    findTopUpByProviderPaymentId: async () => null,
    findTopUpsByUserId: async () => [],
    settleTopUp: async () => ({ alreadySettled: false, newBalanceKopecks: 50_000 }),
    cancelTopUp: async () => undefined,
    ...repositoryOverrides,
  } as WalletRepository;

  // WalletService reads env vars; override them for test
  process.env.QUIZMIND_RUNTIME_MODE = 'connected';
  process.env.YOOKASSA_SHOP_ID = 'test-shop';
  process.env.YOOKASSA_SECRET_KEY = 'test-secret';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.API_URL = 'http://localhost:4000';
  process.env.DATABASE_URL = 'postgresql://localhost/test';
  process.env.REDIS_URL = 'redis://localhost';

  return new WalletService(mockRepository);
}

test('processYookassaPaymentEvent - no matching top-up returns not processed', async () => {
  const service = buildWalletService({
    findTopUpByProviderPaymentId: async () => null,
  });

  const result = await service.processYookassaPaymentEvent({
    eventType: 'payment.succeeded',
    paymentId: 'nonexistent-payment-id',
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, 'no_matching_topup');
});

test('processYookassaPaymentEvent - payment.succeeded credits balance', async () => {
  let settleTopUpCalled = false;
  let settleTopUpWalletId: string | undefined;

  const service = buildWalletService({
    findTopUpByProviderPaymentId: async () => buildMockTopUp({ status: 'pending', walletId: 'wallet-1' }),
    settleTopUp: async (input) => {
      settleTopUpCalled = true;
      settleTopUpWalletId = input.walletId;
      return { alreadySettled: false, newBalanceKopecks: 50_000 };
    },
  });

  const result = await service.processYookassaPaymentEvent({
    eventType: 'payment.succeeded',
    paymentId: 'yookassa-payment-abc',
    paidAt: new Date(),
  });

  assert.equal(result.processed, true);
  assert.equal(result.reason, 'balance_credited');
  assert.equal(settleTopUpCalled, true);
  // walletId comes directly from topUp.walletId — no workspace resolution needed
  assert.equal(settleTopUpWalletId, 'wallet-1');
});

test('processYookassaPaymentEvent - repeated succeeded webhook does not double-credit', async () => {
  const service = buildWalletService({
    findTopUpByProviderPaymentId: async () => buildMockTopUp({ status: 'pending' }),
    settleTopUp: async () => ({ alreadySettled: true, newBalanceKopecks: 50_000 }),
  });

  const result = await service.processYookassaPaymentEvent({
    eventType: 'payment.succeeded',
    paymentId: 'yookassa-payment-abc',
    paidAt: new Date(),
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, 'already_settled');
});

test('processYookassaPaymentEvent - payment.canceled does not credit balance', async () => {
  let settleTopUpCalled = false;
  let cancelTopUpCalled = false;

  const service = buildWalletService({
    findTopUpByProviderPaymentId: async () => buildMockTopUp({ status: 'pending' }),
    settleTopUp: async () => {
      settleTopUpCalled = true;
      return { alreadySettled: false, newBalanceKopecks: 0 };
    },
    cancelTopUp: async () => {
      cancelTopUpCalled = true;
    },
  });

  const result = await service.processYookassaPaymentEvent({
    eventType: 'payment.canceled',
    paymentId: 'yookassa-payment-abc',
  });

  assert.equal(result.processed, true);
  assert.equal(result.reason, 'topup_canceled');
  assert.equal(settleTopUpCalled, false);
  assert.equal(cancelTopUpCalled, true);
});

test('processYookassaPaymentEvent - unknown event type returns unhandled', async () => {
  const service = buildWalletService({
    findTopUpByProviderPaymentId: async () => buildMockTopUp({ status: 'pending' }),
  });

  const result = await service.processYookassaPaymentEvent({
    eventType: 'payment.waiting_for_capture',
    paymentId: 'yookassa-payment-abc',
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, 'unhandled_event_type');
});
