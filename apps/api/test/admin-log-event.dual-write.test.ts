import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActivityLogWithReadModel,
  createAuditLogWithReadModel,
  createDomainEventWithReadModel,
  createSecurityEventWithReadModel,
  buildReadModelFromActivityRow,
  buildReadModelFromAuditRow,
  buildReadModelFromDomainRow,
  buildReadModelFromSecurityRow,
  upsertAdminLogEventsBestEffort,
} from '../src/logs/admin-log-write-path';

test('explicit writer helpers return created legacy rows', async () => {
  const transaction = {
    auditLog: { create: async () => ({ id: 'a1', action: 'audit.event', actorId: 'u1', targetType: 'user', targetId: 'u2', metadataJson: {}, createdAt: new Date('2026-04-26T00:00:00.000Z') }) },
    activityLog: { create: async () => ({ id: 'b1', eventType: 'activity.event', actorId: 'u1', metadataJson: {}, createdAt: new Date('2026-04-26T00:00:00.000Z') }) },
    securityEvent: { create: async () => ({ id: 'c1', eventType: 'security.event', actorId: 'u1', severity: 'warn', metadataJson: {}, createdAt: new Date('2026-04-26T00:00:00.000Z') }) },
    domainEvent: { create: async () => ({ id: 'd1', eventType: 'domain.event', payloadJson: {}, createdAt: new Date('2026-04-26T00:00:00.000Z') }) },
  } as any;

  const auditRow = await createAuditLogWithReadModel(transaction, { actorId: 'u1', action: 'audit.event', targetType: 'user', targetId: 'u2', metadataJson: {}, createdAt: new Date() });
  const activityRow = await createActivityLogWithReadModel(transaction, { actorId: 'u1', eventType: 'activity.event', metadataJson: {}, createdAt: new Date() });
  const securityRow = await createSecurityEventWithReadModel(transaction, { actorId: 'u1', eventType: 'security.event', severity: 'warn', metadataJson: {}, createdAt: new Date() });
  const domainRow = await createDomainEventWithReadModel(transaction, { eventType: 'domain.event', payloadJson: {}, createdAt: new Date() });

  assert.equal(auditRow.id, 'a1');
  assert.equal(activityRow.id, 'b1');
  assert.equal(securityRow.id, 'c1');
  assert.equal(domainRow.id, 'd1');

  const events = [
    buildReadModelFromAuditRow(auditRow),
    buildReadModelFromActivityRow(activityRow),
    buildReadModelFromSecurityRow(securityRow),
    buildReadModelFromDomainRow(domainRow),
  ];
  assert.equal(events.length, 4);
});

test('best-effort read-model upsert suppresses failures', async () => {
  let calls = 0;
  await upsertAdminLogEventsBestEffort(
    {
      adminLogEvent: {
        upsert: async () => {
          calls += 1;
          throw new Error('read-model unavailable');
        },
      },
    } as any,
    [
      {
        stream: 'audit',
        sourceRecordId: 'a2',
        data: {
          stream: 'audit',
          sourceRecordId: 'a2',
          eventType: 'audit.event',
          summary: 'x',
          occurredAt: new Date(),
          category: 'admin',
        },
      },
    ],
  );

  assert.equal(calls, 1);
});
