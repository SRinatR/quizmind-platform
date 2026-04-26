import assert from 'node:assert/strict';
import test from 'node:test';

import { UnauthorizedException } from '@nestjs/common';

import { PlatformController } from '../src/platform.controller';

test('admin log detail endpoint requires bearer token in connected mode', async () => {
  const controller = new PlatformController(
    { getCurrentSession: async () => null } as any,
    { getAdminLogEntryForCurrentSession: async () => ({ id: 'audit:entry_1' }) } as any,
  );

  (controller as any).env = { runtimeMode: 'connected' };

  await assert.rejects(
    () => controller.getAdminLogEntry('audit:entry_1', undefined),
    (error: unknown) => error instanceof UnauthorizedException,
  );
});

test('admin log detail endpoint proxies connected session and id', async () => {
  const session = {
    personaKey: 'connected-user',
    personaLabel: 'Connected User',
    notes: [],
    user: { id: 'user_1', email: 'admin@quizmind.dev', displayName: 'Admin', emailVerifiedAt: null },
    principal: { userId: 'user_1', email: 'admin@quizmind.dev', systemRoles: ['admin'], workspaceMemberships: [], entitlements: [], featureFlags: [] },
    workspaces: [],
    permissions: ['audit_logs:read'],
  } as any;

  let capturedToken = '';
  let capturedId = '';

  const controller = new PlatformController(
    { getCurrentSession: async (token: string) => { capturedToken = token; return session; } } as any,
    { getAdminLogEntryForCurrentSession: async (_session: unknown, id: string) => { capturedId = id; return { id, metadata: { ok: true } }; } } as any,
  );

  (controller as any).env = { runtimeMode: 'connected' };

  const response = await controller.getAdminLogEntry('audit:entry_1', 'Bearer token_123');

  assert.equal(capturedToken, 'token_123');
  assert.equal(capturedId, 'audit:entry_1');
  assert.equal(response.ok, true);
  assert.equal((response.data as { id: string }).id, 'audit:entry_1');
});
