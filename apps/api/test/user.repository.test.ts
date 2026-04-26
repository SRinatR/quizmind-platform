import assert from 'node:assert/strict';
import test from 'node:test';

import { UserRepository } from '../src/auth/repositories/user.repository';

test('UserRepository.listWithFilters uses keyset path by default (no skip/count)', async () => {
  const captured: any[] = [];
  let countCalled = 0;
  const prisma = {
    user: {
      findMany: async (args: any) => {
        captured.push(args);
        return [
          { id: 'u2', email: 'b@example.com', createdAt: new Date('2026-04-02T00:00:00.000Z'), lastLoginAt: null, systemRoleAssignments: [] },
        ];
      },
      count: async () => {
        countCalled += 1;
        return 10;
      },
    },
    $transaction: async (calls: any[]) => Promise.all(calls),
  } as any;

  const repository = new UserRepository(prisma);
  await repository.listWithFilters({ limit: 1, sort: 'created-desc' });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].skip, undefined);
  assert.equal(captured[0].take, 2);
  assert.equal(countCalled, 0);
});

test('UserRepository.listWithFilters uses legacy count/skip only when explicit page is provided', async () => {
  const captured: any[] = [];
  let countCalled = 0;
  const prisma = {
    user: {
      findMany: async (args: any) => {
        captured.push(args);
        return [];
      },
      count: async () => {
        countCalled += 1;
        return 35;
      },
    },
    $transaction: async (calls: any[]) => Promise.all(calls),
  } as any;

  const repository = new UserRepository(prisma);
  await repository.listWithFilters({ limit: 10, sort: 'created-desc', page: 2 });

  assert.equal(countCalled, 1);
  assert.equal(captured[0].skip, 10);
  assert.equal(captured[0].take, 10);
});

test('UserRepository.listWithFilters ignores invalid cursor payloads safely', async () => {
  const captured: any[] = [];
  const prisma = {
    user: {
      findMany: async (args: any) => {
        captured.push(args);
        return [];
      },
      count: async () => 0,
    },
    $transaction: async (calls: any[]) => Promise.all(calls),
  } as any;

  const repository = new UserRepository(prisma);
  const invalid = Buffer.from(JSON.stringify({ s: 'created-desc', c: 'not-a-date', i: 'u_1' })).toString('base64url');
  await repository.listWithFilters({ limit: 25, sort: 'created-desc', cursor: invalid });

  assert.equal(captured[0].take, 26);
  assert.equal(captured[0].skip, undefined);
  assert.deepEqual(captured[0].where, {});
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
