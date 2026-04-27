import assert from 'node:assert/strict';
import test from 'node:test';

import { AdminBootstrapService } from '../src/bootstrap/admin-bootstrap.service';
import type { PrismaService } from '../src/database/prisma.service';

type MockPrisma = {
  user?: {
    findFirst?: (args: unknown) => Promise<unknown>;
    findUnique?: (args: unknown) => Promise<unknown>;
    create?: (args: unknown) => Promise<unknown>;
    update?: (args: unknown) => Promise<unknown>;
  };
  userSystemRole?: {
    findFirst?: (args: unknown) => Promise<unknown>;
    upsert?: (args: unknown) => Promise<unknown>;
  };
};

function createService(prisma: MockPrisma, envOverrides: Partial<Record<string, unknown>> = {}) {
  const service = new AdminBootstrapService(prisma as PrismaService);
  service['env'] = {
    runtimeMode: 'connected',
    adminBootstrapEmail: 'owner@quizmind.dev',
    adminBootstrapPassword: 'bootstrap-password',
    adminBootstrapName: 'Owner',
    ...envOverrides,
  };
  return service;
}

test('AdminBootstrapService skips cleanly when bootstrap env is disabled', async () => {
  const service = createService(
    {
      user: {
        findFirst: async () => {
          throw new Error('should not query user delegate');
        },
      },
    },
    {
      adminBootstrapEmail: undefined,
      adminBootstrapPassword: undefined,
    },
  );

  await assert.doesNotReject(async () => {
    await service.onApplicationBootstrap();
  });
});

test('AdminBootstrapService skips non-fatally when prisma.user delegate is unavailable', async () => {
  const warnCalls: Array<string> = [];
  const warn = console.warn;
  console.warn = (message?: unknown) => {
    warnCalls.push(String(message));
  };

  try {
    const service = createService({
      userSystemRole: {
        findFirst: async () => null,
        upsert: async () => ({}),
      },
    });

    await assert.doesNotReject(async () => {
      await service.onApplicationBootstrap();
    });
  } finally {
    console.warn = warn;
  }

  assert.equal(warnCalls.length, 1);
  assert.match(warnCalls[0], /admin-bootstrap: skipped — prisma\.user delegate is unavailable/);
});

test('AdminBootstrapService creates initial admin when missing', async () => {
  const createdUsers: Array<unknown> = [];
  const service = createService({
    userSystemRole: {
      findFirst: async () => null,
      upsert: async () => ({}),
    },
    user: {
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (args) => {
        createdUsers.push(args);
        return { id: 'user_1' };
      },
      update: async () => ({}),
    },
  });

  await service.onApplicationBootstrap();

  assert.equal(createdUsers.length, 1);
  assert.equal((createdUsers[0] as any).data.email, 'owner@quizmind.dev');
  assert.equal((createdUsers[0] as any).data.systemRoleAssignments.create.role, 'admin');
});

test('AdminBootstrapService does not throw when admin already exists', async () => {
  const service = createService({
    userSystemRole: {
      findFirst: async () => ({ userId: 'user_1' }),
      upsert: async () => ({}),
    },
    user: {
      findFirst: async () => ({ id: 'user_1' }),
      findUnique: async () => ({
        id: 'user_1',
        email: 'owner@quizmind.dev',
        systemRoleAssignments: [{ role: 'admin' }],
      }),
      create: async () => {
        throw new Error('should not create');
      },
      update: async () => {
        throw new Error('should not update');
      },
    },
  });

  await assert.doesNotReject(async () => {
    await service.onApplicationBootstrap();
  });
});

test('AdminBootstrapService repairs missing admin role assignment for existing bootstrap user', async () => {
  const upsertCalls: Array<unknown> = [];
  const service = createService({
    userSystemRole: {
      findFirst: async () => null,
      upsert: async (args) => {
        upsertCalls.push(args);
        return { id: 'role_1' };
      },
    },
    user: {
      findFirst: async () => null,
      findUnique: async () => ({
        id: 'user_1',
        email: 'owner@quizmind.dev',
        systemRoleAssignments: [],
      }),
      create: async () => {
        throw new Error('should not create');
      },
      update: async () => {
        throw new Error('should not use update fallback');
      },
    },
  });

  await service.onApplicationBootstrap();

  assert.equal(upsertCalls.length, 1);
  assert.deepEqual((upsertCalls[0] as any).where.userId_role, { userId: 'user_1', role: 'admin' });
});
