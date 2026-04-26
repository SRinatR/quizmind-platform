import assert from 'node:assert/strict';
import test from 'node:test';

import { UserRepository } from '../src/auth/repositories/user.repository';

test('UserRepository.listWithFilters uses keyset path in cursor mode (no skip)', async () => {
  const captured: any[] = [];
  const prisma = {
    user: {
      findMany: async (args: any) => {
        captured.push(args);
        return [
          { id: 'u2', email: 'b@example.com', createdAt: new Date('2026-04-02T00:00:00.000Z'), lastLoginAt: null, systemRoleAssignments: [] },
        ];
      },
      count: async () => 10,
    },
    $transaction: async (calls: any[]) => Promise.all(calls),
  } as any;

  const repository = new UserRepository(prisma);
  await repository.listWithFilters({ limit: 1, sort: 'created-desc', cursor: 'not-a-valid-cursor' });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].skip, undefined);
  assert.equal(captured[0].take, 2);
});

test('UserRepository.listWithFilters returns deterministic tie-breaker ordering config', async () => {
  let capturedOrderBy: any;
  const prisma = {
    user: {
      findMany: async (args: any) => {
        capturedOrderBy = args.orderBy;
        return [];
      },
      count: async () => 0,
    },
    $transaction: async (calls: any[]) => Promise.all(calls),
  } as any;

  const repository = new UserRepository(prisma);
  await repository.listWithFilters({ limit: 25, sort: 'email-asc', page: 1 });

  assert.deepEqual(capturedOrderBy, [{ email: 'asc' }, { id: 'asc' }]);
});
