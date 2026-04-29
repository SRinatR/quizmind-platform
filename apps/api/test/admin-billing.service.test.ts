import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { PlatformService } from '../src/platform.service';

const adminSession: any = { user: { id: 'admin1' }, principal: { systemRoles: ['admin'] }, permissions: [] };
const userSession: any = { user: { id: 'user1' }, principal: { systemRoles: [] }, permissions: [] };

function makeService(overrides: any = {}) {
  const prisma = overrides.prisma ?? { user: { findMany: async () => [] } };
  const walletRepository = overrides.walletRepository ?? { manualAdjustWallets: async () => ({ batchId: 'b1', affectedCount: 0, skippedCount: 0, direction: 'credit', amountKopecks: 1, currency: 'RUB' }) };
  const userBillingOverrideRepository = overrides.userBillingOverrideRepository ?? {
    updateOverride: async () => ({ userId: 'u1', aiPlatformFeeExempt: true, aiMarkupPercentOverride: null, reason: 'x reason', updatedAt: new Date('2026-01-01T00:00:00.000Z') }),
    deleteOverride: async () => undefined,
  };
  const service = new PlatformService(
    {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
    { getRetentionPolicy: async () => ({}), updateRetentionPolicy: async () => ({}) },
    { getPricingPolicy: async () => ({}), updatePricingPolicy: async () => ({}) },
    walletRepository,
    userBillingOverrideRepository,
    prisma,
  );
  return service as any;
}

test('listAdminBillingUsersForCurrentSession rejects non-admin', async () => {
  const service = makeService();
  await assert.rejects(() => service.listAdminBillingUsersForCurrentSession(userSession), ForbiddenException);
});

test('listAdminBillingUsersForCurrentSession maps wallet and override fields + search/filter', async () => {
  const calls: any[] = [];
  const service = makeService({
    prisma: { user: { findMany: async (args: any) => { calls.push(args); return [{ id: 'u1', email: 'john@example.com', displayName: 'John', wallet: { currency: 'RUB', balanceKopecks: 1200 }, billingOverride: { aiPlatformFeeExempt: true, aiMarkupPercentOverride: 15, reason: 'vip' }, createdAt: new Date('2026-01-01T00:00:00.000Z'), lastLoginAt: null }]; } } },
  });
  const result = await service.listAdminBillingUsersForCurrentSession(adminSession, { search: 'john', feeExempt: 'true', hasOverride: 'true', limit: '10' });
  assert.equal(result.items[0].walletCurrency, 'RUB');
  assert.equal(result.items[0].balanceKopecks, 1200);
  assert.equal(result.items[0].aiPlatformFeeExempt, true);
  assert.equal(result.items[0].aiMarkupPercentOverride, 15);
  assert.equal(result.items[0].billingOverrideReason, 'vip');
  assert.equal(calls[0].where.OR.length, 2);
});

test('createAdminWalletAdjustmentForCurrentSession validates target and supports idempotent path', async () => {
  let called = 0;
  const service = makeService({ walletRepository: { manualAdjustWallets: async () => { called += 1; return { batchId: 'b1', affectedCount: 1, skippedCount: 0, direction: 'credit', amountKopecks: 10, currency: 'RUB' }; } } });
  await assert.rejects(() => service.createAdminWalletAdjustmentForCurrentSession(adminSession, { target: { type: 'selected_users', userIds: [] }, direction: 'credit', amountKopecks: 10, currency: 'RUB', reason: 'hello', idempotencyKey: 'k' }));
  await assert.rejects(() => service.createAdminWalletAdjustmentForCurrentSession(adminSession, { target: { type: 'all_users', confirmationText: 'NOPE' }, direction: 'credit', amountKopecks: 10, currency: 'RUB', reason: 'hello', idempotencyKey: 'k2' }));
  const res = await service.createAdminWalletAdjustmentForCurrentSession(adminSession, { target: { type: 'selected_users', userIds: ['u1'] }, direction: 'credit', amountKopecks: 10, currency: 'RUB', reason: 'hello there', idempotencyKey: 'k3' });
  assert.equal(res.affectedCount, 1);
  assert.equal(called, 1);
});

test('override update/delete rejects non-admin and validates markup', async () => {
  const service = makeService({ userBillingOverrideRepository: { updateOverride: async (_u: string, p: any) => { if (p.aiMarkupPercentOverride > 500) throw new Error('aiMarkupPercentOverride must be between 0 and 500.'); return { userId: 'u1', aiPlatformFeeExempt: true, aiMarkupPercentOverride: p.aiMarkupPercentOverride ?? null, reason: p.reason, updatedAt: new Date('2026-01-01T00:00:00.000Z') }; }, deleteOverride: async () => undefined } });
  await assert.rejects(() => service.updateUserBillingOverrideForCurrentSession(userSession, 'u1', { reason: 'valid reason' }), ForbiddenException);
  await assert.rejects(() => service.updateUserBillingOverrideForCurrentSession(adminSession, 'u1', { reason: '' as any }));
  await assert.rejects(() => service.updateUserBillingOverrideForCurrentSession(adminSession, 'u1', { reason: 'valid reason', aiMarkupPercentOverride: 999 }));
  const ok = await service.updateUserBillingOverrideForCurrentSession(adminSession, 'u1', { reason: 'valid reason', aiPlatformFeeExempt: true });
  assert.equal(ok.aiPlatformFeeExempt, true);
  await assert.rejects(() => service.deleteUserBillingOverrideForCurrentSession(userSession, 'u1'), ForbiddenException);
  const del = await service.deleteUserBillingOverrideForCurrentSession(adminSession, 'u1');
  assert.equal(del.success, true);
});
