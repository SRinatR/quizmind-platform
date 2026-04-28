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
