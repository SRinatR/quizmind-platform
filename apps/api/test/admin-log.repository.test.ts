import assert from 'node:assert/strict';
import test from 'node:test';

import { AdminLogRepository } from '../src/logs/admin-log.repository';

test('AdminLogRepository.listPage uses bounded query with hasNext and nextCursor', async () => {
  const createdAt = new Date('2026-04-26T10:00:00.000Z');
  const repo = new AdminLogRepository({
    $queryRaw: async () => ([
      {
        id: 'audit:log_2',
        stream: 'audit',
        sourceRecordId: 'log_2',
        eventType: 'auth.login_failed',
        summary: 'failed',
        occurredAt: createdAt,
        severity: 'warn',
        status: 'failure',
        actorId: 'user_1',
        actorEmail: 'admin@quizmind.dev',
        actorDisplayName: 'Admin',
        targetType: 'auth_session',
        targetId: 'abc',
        category: 'auth',
        source: 'web',
        installationId: null,
        provider: null,
        model: null,
        durationMs: null,
        costUsd: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        errorSummary: null,
      },
      {
        id: 'audit:log_1',
        stream: 'audit',
        sourceRecordId: 'log_1',
        eventType: 'auth.login_success',
        summary: 'ok',
        occurredAt: new Date('2026-04-26T09:00:00.000Z'),
        severity: 'info',
        status: 'success',
        actorId: 'user_1',
        actorEmail: 'admin@quizmind.dev',
        actorDisplayName: 'Admin',
        targetType: 'auth_session',
        targetId: 'abc',
        category: 'auth',
        source: 'web',
        installationId: null,
        provider: null,
        model: null,
        durationMs: null,
        costUsd: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        errorSummary: null,
      },
    ]),
  } as any);

  const result = await repo.listPage({ limit: 1, stream: 'all' });
  assert.equal(result.items.length, 1);
  assert.equal(result.hasNext, true);
  assert.ok(result.nextCursor);
});

test('AdminLogRepository.findOne returns metadata for selected item only', async () => {
  const repo = new AdminLogRepository({
    auditLog: {
      findUnique: async () => ({
        id: 'audit_1',
        actorId: 'user_1',
        action: 'admin.user_updated',
        targetType: 'user',
        targetId: 'user_2',
        metadataJson: { summary: 'updated', ip: '127.0.0.1' },
        createdAt: new Date('2026-04-26T09:00:00.000Z'),
      }),
    },
    user: {
      findUnique: async () => ({ id: 'user_1', email: 'admin@quizmind.dev', displayName: 'Admin' }),
    },
  } as any);

  const result = await repo.findOne('audit:audit_1');
  assert.ok(result);
  assert.equal(result?.item.id, 'audit:audit_1');
  assert.deepEqual(result?.metadata, { summary: 'updated', ip: '127.0.0.1' });
});
