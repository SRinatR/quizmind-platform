import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActivityLogWithReadModel,
  createAuditLogWithReadModel,
  createDomainEventWithReadModel,
  createSecurityEventWithReadModel,
} from '../src/logs/admin-log-write-path';

test('explicit writer helpers dual-write all legacy streams and return created rows', async () => {
  const upserts: string[] = [];
  const transaction = {
    auditLog: {
      create: async () => ({ id: 'a1', action: 'audit.event', actorId: 'u1', targetType: 'user', targetId: 'u2', metadataJson: {}, createdAt: new Date('2026-04-26T00:00:00.000Z') }),
    },
    activityLog: {
      create: async () => ({ id: 'b1', eventType: 'activity.event', actorId: 'u1', metadataJson: {}, createdAt: new Date('2026-04-26T00:00:00.000Z') }),
    },
    securityEvent: {
      create: async () => ({ id: 'c1', eventType: 'security.event', actorId: 'u1', severity: 'warn', metadataJson: {}, createdAt: new Date('2026-04-26T00:00:00.000Z') }),
    },
    domainEvent: {
      create: async () => ({ id: 'd1', eventType: 'domain.event', payloadJson: {}, createdAt: new Date('2026-04-26T00:00:00.000Z') }),
    },
    adminLogEvent: {
      upsert: async ({ where }: any) => {
        upserts.push(`${where.stream_sourceRecordId.stream}:${where.stream_sourceRecordId.sourceRecordId}`);
      },
    },
  } as any;

  const auditRow = await createAuditLogWithReadModel(transaction, { actorId: 'u1', action: 'audit.event', targetType: 'user', targetId: 'u2', metadataJson: {}, createdAt: new Date() });
  const activityRow = await createActivityLogWithReadModel(transaction, { actorId: 'u1', eventType: 'activity.event', metadataJson: {}, createdAt: new Date() });
  const securityRow = await createSecurityEventWithReadModel(transaction, { actorId: 'u1', eventType: 'security.event', severity: 'warn', metadataJson: {}, createdAt: new Date() });
  const domainRow = await createDomainEventWithReadModel(transaction, { eventType: 'domain.event', payloadJson: {}, createdAt: new Date() });

  assert.equal(auditRow.id, 'a1');
  assert.equal(activityRow.id, 'b1');
  assert.equal(securityRow.id, 'c1');
  assert.equal(domainRow.id, 'd1');
  assert.deepEqual(upserts, ['audit:a1', 'activity:b1', 'security:c1', 'domain:d1']);
});

test('explicit writer helper suppresses AdminLogEvent upsert errors and returns legacy row', async () => {
  const transaction = {
    auditLog: {
      create: async () => ({ id: 'a2', action: 'audit.event', actorId: 'u1', targetType: 'user', targetId: 'u2', metadataJson: {}, createdAt: new Date('2026-04-26T00:00:00.000Z') }),
    },
    adminLogEvent: {
      upsert: async () => {
        throw new Error('read-model unavailable');
      },
    },
  } as any;

  const row = await createAuditLogWithReadModel(transaction, {
    actorId: 'u1',
    action: 'audit.event',
    targetType: 'user',
    targetId: 'u2',
    metadataJson: {},
    createdAt: new Date(),
  });

  assert.equal(row.id, 'a2');
});
