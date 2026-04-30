import assert from 'node:assert/strict';
import test from 'node:test';

import { WalletRepository } from '../src/wallet/wallet.repository';

test('debitUsage is idempotent and returns existing ledger', async () => {
  const store: any = { balance: 1000, ledger: null };
  const prisma: any = {
    $transaction: async (fn: any) => fn({
      walletLedgerEntry: {
        findUnique: async ({ where }: any) => (store.ledger && store.ledger.idempotencyKey === where.idempotencyKey ? store.ledger : null),
        create: async ({ data }: any) => {
          store.ledger = { id: 'le_1', ...data };
          return store.ledger;
        },
      },
      wallet: {
        upsert: async () => ({ id: 'w_1', balanceKopecks: store.balance, currency: 'USD' }),
        update: async ({ data }: any) => {
          store.balance -= data.balanceKopecks.decrement;
          return { balanceKopecks: store.balance };
        },
      },
    }),
  };

  const repo = new WalletRepository(prisma);
  const first = await repo.debitUsage({ userId: 'u1', amountKopecks: 100, currency: 'USD', description: 'x', idempotencyKey: 'k1' });
  const second = await repo.debitUsage({ userId: 'u1', amountKopecks: 100, currency: 'USD', description: 'x', idempotencyKey: 'k1' });

  assert.equal(first.alreadyProcessed, false);
  assert.equal(second.alreadyProcessed, true);
  assert.equal(store.balance, 900);
});

test('manualAdjustWallets credits selected users and is idempotent', async () => {
  const store: any = { balances: new Map<string, number>(), batches: new Map<string, any>(), ledgers: [] as any[] };
  const tx: any = {
    adminWalletAdjustmentBatch: {
      findUnique: async ({ where }: any) => store.batches.get(where.idempotencyKey) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `b_${store.batches.size + 1}`, ...data };
        store.batches.set(data.idempotencyKey, row);
        return row;
      },
    },
    walletLedgerEntry: {
      count: async ({ where }: any) => store.ledgers.filter((l) => where.idempotencyKey.in.includes(l.idempotencyKey)).length,
      create: async ({ data }: any) => { store.ledgers.push(data); return data; },
    },
    wallet: {
      upsert: async ({ where }: any) => ({ id: `w_${where.userId}`, balanceKopecks: store.balances.get(where.userId) ?? 0 }),
      update: async ({ where, data }: any) => {
        const userId = where.id.replace('w_', '');
        const prev = store.balances.get(userId) ?? 0;
        const next = data.balanceKopecks.increment ? prev + data.balanceKopecks.increment : prev - data.balanceKopecks.decrement;
        store.balances.set(userId, next);
        return { balanceKopecks: next };
      },
    },
  };
  const repo = new WalletRepository({ $transaction: async (fn: any) => fn(tx) } as any);
  const first = await repo.manualAdjustWallets({ actorId: 'admin1', targetType: 'selected_users', userIds: ['u1'], direction: 'credit', amountKopecks: 50, currency: 'RUB', reason: 'manual credit', idempotencyKey: 'idem-1' });
  const second = await repo.manualAdjustWallets({ actorId: 'admin1', targetType: 'selected_users', userIds: ['u1'], direction: 'credit', amountKopecks: 50, currency: 'RUB', reason: 'manual credit', idempotencyKey: 'idem-1' });
  assert.equal(first.affectedCount, 1);
  assert.equal(second.affectedCount, 1);
  assert.equal(store.balances.get('u1'), 50);
  assert.equal(store.ledgers[0].type, 'manual_adjustment');
});

test('manualAdjustWallets blocks negative debits by default', async () => {
  const tx: any = {
    adminWalletAdjustmentBatch: { findUnique: async () => null, create: async ({ data }: any) => ({ id: 'b1', ...data }) },
    walletLedgerEntry: { create: async () => null },
    wallet: {
      upsert: async () => ({ id: 'w_u1', balanceKopecks: 10 }),
      update: async () => { throw new Error('should not update'); },
    },
  };
  const repo = new WalletRepository({ $transaction: async (fn: any) => fn(tx) } as any);
  const result = await repo.manualAdjustWallets({ actorId: 'a', targetType: 'selected_users', userIds: ['u1'], direction: 'debit', amountKopecks: 50, currency: 'RUB', reason: 'manual debit', idempotencyKey: 'idem-2' });
  assert.equal(result.affectedCount, 0);
  assert.equal(result.skippedCount, 1);
});

test('manualAdjustWallets normalizes empty reason', async () => {
  const store: any = { ledger: null, batch: null };
  const tx: any = {
    adminWalletAdjustmentBatch: { findUnique: async () => null, create: async ({ data }: any) => ((store.batch = { id: 'b1', ...data }), store.batch) },
    walletLedgerEntry: { create: async ({ data }: any) => ((store.ledger = data), data), count: async () => 0 },
    wallet: {
      upsert: async () => ({ id: 'w_u1', balanceKopecks: 0 }),
      update: async () => ({ balanceKopecks: 10 }),
    },
  };
  const repo = new WalletRepository({ $transaction: async (fn: any) => fn(tx) } as any);
  await repo.manualAdjustWallets({ actorId: 'a', targetType: 'selected_users', userIds: ['u1'], direction: 'credit', amountKopecks: 10, currency: 'RUB', reason: '   ', idempotencyKey: 'idem-3' });
  assert.equal(store.batch.reason, 'Admin manual wallet adjustment');
  assert.equal(store.ledger.description, 'Admin manual wallet adjustment');
  assert.equal(store.ledger.metadataJson.reason, 'Admin manual wallet adjustment');
});
