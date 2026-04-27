import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdminLogEventCreateInput } from '@quizmind/database';

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
      user: {
        findMany: async () => [],
      },
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

test('create input maps actor identity fields and includes them in search text', () => {
  const input = buildAdminLogEventCreateInput({
    stream: 'audit',
    sourceRecordId: 'a3',
    eventType: 'support.login',
    occurredAt: new Date('2026-04-26T00:00:00.000Z'),
    actorId: 'u3',
    metadata: {
      actorEmail: 'agent@example.com',
      actorDisplayName: 'Support Agent',
      summary: 'Agent logged in',
    },
  });

  assert.equal(input.actorEmail, 'agent@example.com');
  assert.equal(input.actorDisplayName, 'Support Agent');
  assert.match(input.searchText ?? '', /\bagent@example\.com\b/);
  assert.match(input.searchText ?? '', /\bsupport agent\b/);
});

test('create input derives readable summary and source when metadata summary is missing', () => {
  const input = buildAdminLogEventCreateInput({
    stream: 'activity',
    sourceRecordId: 'evt_1',
    eventType: 'ai.proxy.completed',
    occurredAt: new Date('2026-04-26T00:00:00.000Z'),
    actorId: 'u3',
    metadata: {
      provider: 'openai',
      model: 'gpt-5-mini',
    },
  });

  assert.equal(input.summary, 'AI request completed');
  assert.equal(input.source, 'api');
  assert.equal(input.status, 'success');
  assert.equal(input.costUsd, undefined);
});

test('create input maps ai history cost and tokens from estimatedCostUsd/usage metadata', () => {
  const input = buildAdminLogEventCreateInput({
    stream: 'activity',
    sourceRecordId: 'evt_2',
    eventType: 'ai.proxy.completed',
    occurredAt: new Date('2026-04-26T00:00:00.000Z'),
    metadata: {
      requestId: 'req_1',
      estimatedCostUsd: 0.0023,
      usage: {
        promptTokens: 111,
        completionTokens: 222,
        totalTokens: 333,
      },
    },
  });

  assert.equal(input.targetType, 'ai_request');
  assert.equal(input.targetId, 'req_1');
  assert.equal(input.costUsd, 0.0023);
  assert.equal(input.promptTokens, 111);
  assert.equal(input.completionTokens, 222);
  assert.equal(input.totalTokens, 333);
});

test('create input derives failure status for ai proxy failure events', () => {
  const input = buildAdminLogEventCreateInput({
    stream: 'activity',
    sourceRecordId: 'evt_failed',
    eventType: 'ai.proxy.failed',
    occurredAt: new Date('2026-04-26T00:00:00.000Z'),
    metadata: {
      requestId: 'req_failed',
    },
  });

  assert.equal(input.status, 'failure');
});

test('best-effort read-model upsert enriches missing actor email/displayName from actorId', async () => {
  const created: any[] = [];
  await upsertAdminLogEventsBestEffort(
    {
      user: {
        findMany: async () => [{ id: 'user_22', email: 'person@example.com', displayName: 'Readable Name' }],
      },
      adminLogEvent: {
        upsert: async ({ create }: any) => {
          created.push(create);
        },
      },
    } as any,
    [
      {
        stream: 'activity',
        sourceRecordId: 'act_22',
        data: buildAdminLogEventCreateInput({
          stream: 'activity',
          sourceRecordId: 'act_22',
          eventType: 'auth.login_success',
          occurredAt: new Date('2026-04-26T00:00:00.000Z'),
          actorId: 'user_22',
        }),
      },
    ],
  );

  assert.equal(created[0].actorEmail, 'person@example.com');
  assert.equal(created[0].actorDisplayName, 'Readable Name');
  assert.match(created[0].searchText, /\blogin successful\b/);
});

test('best-effort read-model upsert enriches cost from ai request resolved via nested requestMetadata id', async () => {
  const created: any[] = [];
  await upsertAdminLogEventsBestEffort(
    {
      user: {
        findMany: async () => [],
      },
      aiRequestEvent: {
        findMany: async () => [{
          id: 'req_nested',
          provider: 'openai',
          model: 'openai/gpt-4o',
          durationMs: 321,
          estimatedCostUsd: 0.0044,
          promptTokens: 10,
          completionTokens: 12,
          totalTokens: 22,
          promptExcerpt: 'hello',
          status: 'error',
        }],
      },
      adminLogEvent: {
        upsert: async ({ create }: any) => {
          created.push(create);
        },
      },
    } as any,
    [
      {
        stream: 'activity',
        sourceRecordId: 'act_nested',
        data: buildAdminLogEventCreateInput({
          stream: 'activity',
          sourceRecordId: 'act_nested',
          eventType: 'ai.proxy.completed',
          occurredAt: new Date('2026-04-26T00:00:00.000Z'),
          metadata: {
            requestMetadata: {
              requestId: 'req_nested',
            },
          },
        }),
      },
    ],
  );

  assert.equal(created[0].costUsd, 0.0044);
  assert.equal(created[0].promptTokens, 10);
  assert.equal(created[0].completionTokens, 12);
  assert.equal(created[0].totalTokens, 22);
  assert.equal(created[0].status, 'success');
});
