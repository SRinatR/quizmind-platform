import assert from 'node:assert/strict';
import test from 'node:test';

import { UserBillingOverrideRepository } from '../src/ai/user-billing-override.repository';

test('updateOverride create/update path uses normalized reason and prisma reason field', async () => {
  const state: any = { row: null };
  const prisma: any = {
    userBillingOverride: {
      findUnique: async ({ where }: any) => (state.row && state.row.userId === where.userId ? state.row : null),
      upsert: async ({ where, create, update }: any) => {
        if ('normalizedReason' in create) throw new Error('invalid field normalizedReason');
        if (!('reason' in create)) throw new Error('missing reason field');
        if (!state.row) {
          state.row = {
            userId: where.userId,
            aiPlatformFeeExempt: create.aiPlatformFeeExempt,
            aiMarkupPercentOverride: create.aiMarkupPercentOverride,
            reason: create.reason,
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          };
        } else {
          state.row = {
            ...state.row,
            ...update,
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          };
        }
        return state.row;
      },
    },
  };

  const repo = new UserBillingOverrideRepository(prisma);

  const created = await repo.updateOverride('u1', { aiPlatformFeeExempt: true, reason: '' }, 'admin1');
  assert.equal(created.userId, 'u1');
  assert.equal(created.reason, 'Admin billing override');
  assert.equal(created.aiPlatformFeeExempt, true);

  const updated = await repo.updateOverride('u1', { aiMarkupPercentOverride: 33, reason: '   ' }, 'admin1');
  assert.equal(updated.reason, 'Admin billing override');
  assert.equal(updated.aiMarkupPercentOverride, 33);
});
