import assert from 'node:assert/strict';
import test from 'node:test';

import { AdminLogBackfillService } from '../src/logs/admin-log.backfill';

test('AdminLogBackfillService processes bounded batches and upserts idempotently', async () => {
  let auditCalls = 0;
  let upsertCalls = 0;
  const service = new AdminLogBackfillService({
    auditLog: {
      findMany: async () => {
        auditCalls += 1;
        if (auditCalls === 1) {
          return [{
            id: 'audit_1',
            actorId: 'user_1',
            action: 'auth.login_failed',
            targetType: 'auth_session',
            targetId: 'session_1',
            metadataJson: { status: 'failure' },
            createdAt: new Date('2026-04-26T09:00:00.000Z'),
          }];
        }
        if (auditCalls === 2) {
          return [{
            id: 'audit_2',
            actorId: 'user_2',
            action: 'auth.login_success',
            targetType: 'auth_session',
            targetId: 'session_2',
            metadataJson: { status: 'success' },
            createdAt: new Date('2026-04-26T10:00:00.000Z'),
          }];
        }
        return [];
      },
    },
    activityLog: { findMany: async () => [] },
    securityEvent: { findMany: async () => [] },
    domainEvent: { findMany: async () => [] },
    adminLogEvent: {
      upsert: async () => {
        upsertCalls += 1;
      },
    },
  } as any, 1);

  await service.run();

  assert.equal(auditCalls, 3);
  assert.equal(upsertCalls, 2);
});
