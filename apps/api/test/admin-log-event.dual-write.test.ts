import assert from 'node:assert/strict';
import test from 'node:test';

import { upsertAdminLogEventForCreate } from '../src/logs/admin-log-event.dual-write';

test('upsertAdminLogEventForCreate upserts for all legacy streams', async () => {
  const calls: Array<{ stream: string; sourceRecordId: string }> = [];
  const prisma = {
    adminLogEvent: {
      upsert: async ({ where }: any) => {
        calls.push(where.stream_sourceRecordId);
      },
    },
  } as any;

  await upsertAdminLogEventForCreate(prisma, { model: 'AuditLog', action: 'create', args: { data: { action: 'a', createdAt: new Date() } } } as any, { id: '1' });
  await upsertAdminLogEventForCreate(prisma, { model: 'ActivityLog', action: 'create', args: { data: { eventType: 'b', createdAt: new Date() } } } as any, { id: '2' });
  await upsertAdminLogEventForCreate(prisma, { model: 'SecurityEvent', action: 'create', args: { data: { eventType: 'c', severity: 'warn', createdAt: new Date() } } } as any, { id: '3' });
  await upsertAdminLogEventForCreate(prisma, { model: 'DomainEvent', action: 'create', args: { data: { eventType: 'd', createdAt: new Date() } } } as any, { id: '4' });

  assert.deepEqual(calls, [
    { stream: 'audit', sourceRecordId: '1' },
    { stream: 'activity', sourceRecordId: '2' },
    { stream: 'security', sourceRecordId: '3' },
    { stream: 'domain', sourceRecordId: '4' },
  ]);
});
