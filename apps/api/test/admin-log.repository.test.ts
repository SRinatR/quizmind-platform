import assert from 'node:assert/strict';
import test from 'node:test';

import { AdminLogRepository } from '../src/logs/admin-log.repository';

test('AdminLogRepository.listPage queries AdminLogEvent with bounded page', async () => {
  let captured: any;
  const repo = new AdminLogRepository({
    adminLogEvent: {
      findMany: async (args: unknown) => {
        captured = args;
        return [
          {
            id: 'evt_2',
            stream: 'audit',
            sourceRecordId: 'audit_2',
            eventType: 'auth.login_failed',
            summary: 'failed',
            occurredAt: new Date('2026-04-26T10:00:00.000Z'),
            severity: 'warn',
            status: 'failure',
            actorId: 'user_1',
            actorEmail: null,
            actorDisplayName: null,
            targetType: null,
            targetId: null,
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
            id: 'evt_1',
            stream: 'audit',
            sourceRecordId: 'audit_1',
            eventType: 'auth.login_success',
            summary: 'ok',
            occurredAt: new Date('2026-04-26T09:00:00.000Z'),
            severity: 'info',
            status: 'success',
            actorId: 'user_1',
            actorEmail: null,
            actorDisplayName: null,
            targetType: null,
            targetId: null,
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
        ];
      },
    },
  } as any);

  const result = await repo.listPage({ limit: 1, stream: 'all', search: 'login' });
  assert.equal(result.items.length, 1);
  assert.equal(result.hasNext, true);
  assert.ok(result.nextCursor);
  assert.equal(captured.select.metadataJson, undefined);
  assert.equal(captured.select.payloadJson, undefined);
  assert.equal(captured.take, 2);
});

test('AdminLogRepository.findOne supports composite id fallback and returns detail metadata', async () => {
  const repo = new AdminLogRepository({
    adminLogEvent: {
      findUnique: async ({ where }: any) => {
        if (where.id) return null;
        return {
          id: 'evt_1',
          stream: 'audit',
          sourceRecordId: 'audit_1',
          eventType: 'admin.user_updated',
          summary: 'updated',
          occurredAt: new Date('2026-04-26T09:00:00.000Z'),
          severity: 'info',
          status: 'success',
          actorId: 'user_1',
          actorEmail: 'admin@quizmind.dev',
          actorDisplayName: 'Admin',
          targetType: 'user',
          targetId: 'user_2',
          category: 'admin',
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
          metadataJson: { summary: 'updated', ip: '127.0.0.1' },
          payloadJson: null,
        };
      },
    },
  } as any);

  const result = await repo.findOne('audit:audit_1');
  assert.ok(result);
  assert.equal(result?.item.id, 'evt_1');
  assert.deepEqual(result?.metadata, { summary: 'updated', ip: '127.0.0.1' });
});
