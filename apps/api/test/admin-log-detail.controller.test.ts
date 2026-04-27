import assert from 'node:assert/strict';
import test from 'node:test';

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

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

test('admin log detail endpoint returns aiRequest enrichment payload when available', async () => {
  const session = {
    personaKey: 'connected-user',
    user: { id: 'user_1' },
    principal: { userId: 'user_1', systemRoles: ['admin'], workspaceMemberships: [], entitlements: [], featureFlags: [] },
    permissions: ['audit_logs:read'],
  } as any;

  const controller = new PlatformController(
    { getCurrentSession: async () => session } as any,
    {
      getAdminLogEntryForCurrentSession: async () => ({
        id: 'activity:entry_1',
        eventType: 'ai.proxy.completed',
        summary: 'AI request completed',
        occurredAt: '2026-04-26T09:00:00.000Z',
        stream: 'activity',
        aiRequest: {
          id: 'req_1',
          provider: 'openai',
          model: 'openai/gpt-4o',
          requestType: 'image',
          status: 'success',
          promptExcerpt: 'question',
          responseExcerpt: 'answer',
          contentAvailability: 'expired',
          contentMessage: 'Full content expired after the retention window.',
          attachments: [{ id: 'att_1', role: 'prompt', kind: 'image', mimeType: 'image/png', sizeBytes: 100, deleted: false, expired: false }],
        },
      }),
    } as any,
  );

  (controller as any).env = { runtimeMode: 'connected' };
  const response = await controller.getAdminLogEntry('activity:entry_1', 'Bearer token_123');
  assert.equal(response.ok, true);
  assert.equal((response.data as any).aiRequest.id, 'req_1');
  assert.equal((response.data as any).aiRequest.contentAvailability, 'expired');
});

test('admin log attachment endpoint blocks non-admin sessions', async () => {
  const session = {
    personaKey: 'connected-user',
    user: { id: 'user_2' },
    principal: { userId: 'user_2', systemRoles: [], workspaceMemberships: [], entitlements: [], featureFlags: [] },
    permissions: [],
  } as any;
  const controller = new PlatformController(
    { getCurrentSession: async () => session } as any,
    {
      getAdminLogAttachmentForCurrentSession: async () => {
        throw new ForbiddenException('forbidden');
      },
    } as any,
  );
  (controller as any).env = { runtimeMode: 'connected' };
  await assert.rejects(
    () => controller.getAdminLogAttachmentView('activity:entry_1', 'att_1', 'Bearer token_123'),
    (error: unknown) => error instanceof ForbiddenException,
  );
});
