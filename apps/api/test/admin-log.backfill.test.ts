import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AdminLogBackfillService } from '../src/logs/admin-log.backfill';

test('AdminLogBackfillService processes bounded batches and supports rerun idempotency', async () => {
  let auditCalls = 0;
  let upsertCalls = 0;
  const service = new AdminLogBackfillService({
    user: {
      findMany: async () => [{ id: 'user_1', email: 'viewer@example.com', displayName: 'Viewer' }],
    },
    auditLog: {
      findMany: async () => {
        auditCalls += 1;
        if (auditCalls <= 2) {
          return [{ id: 'audit_1', actorId: 'user_1', action: 'auth.login_failed', targetType: 'auth_session', targetId: 'session_1', metadataJson: { status: 'failure' }, createdAt: new Date('2026-04-26T09:00:00.000Z') }];
        }
        return [];
      },
    },
    activityLog: { findMany: async () => [] },
    securityEvent: { findMany: async () => [] },
    domainEvent: { findMany: async () => [] },
    adminLogEvent: { upsert: async () => { upsertCalls += 1; } },
  } as any, 1);

  await service.run();
  await service.run();

  assert.equal(upsertCalls, 2);
});

test('AdminLogBackfillService.verifyCounts reports per-stream missing rows', async () => {
  const service = new AdminLogBackfillService({
    auditLog: { count: async () => 10 },
    activityLog: { count: async () => 20 },
    securityEvent: { count: async () => 30 },
    domainEvent: { count: async () => 40 },
    adminLogEvent: {
      count: async ({ where }: any) => {
        if (where.stream === 'audit') return 8;
        if (where.stream === 'activity') return 20;
        if (where.stream === 'security') return 29;
        return 40;
      },
    },
  } as any, 1);

  const result = await service.verifyCounts();
  assert.equal(result.audit.missing, 2);
  assert.equal(result.activity.missing, 0);
  assert.equal(result.security.missing, 1);
  assert.equal(result.domain.missing, 0);
});

test('AdminLogBackfillService enriches AI read-model rows with AiRequestEvent estimated cost', async () => {
  let capturedCreate: any;
  const service = new AdminLogBackfillService({
    user: { findMany: async () => [] },
    auditLog: { findMany: async () => [] },
    activityLog: {
      findMany: async () => [
        {
          id: 'act_1',
          actorId: 'user_1',
          eventType: 'ai.proxy.completed',
          metadataJson: { requestId: 'req_1', provider: 'openai', model: 'openai/gpt-4o' },
          createdAt: new Date('2026-04-26T09:00:00.000Z'),
        },
      ],
    },
    securityEvent: { findMany: async () => [] },
    domainEvent: { findMany: async () => [] },
    aiRequestEvent: {
      findMany: async () => [{
        id: 'req_1',
        provider: 'openai',
        model: 'openai/gpt-4o',
        durationMs: 480,
        estimatedCostUsd: 0.0042,
        promptTokens: 123,
        completionTokens: 456,
        totalTokens: 579,
        promptExcerpt: 'What is 2+2?',
      }],
    },
    adminLogEvent: {
      upsert: async ({ create }: any) => { capturedCreate = create; },
    },
  } as any, 100);

  await service.run({ stream: 'activity' });

  assert.equal(capturedCreate.costUsd, 0.0042);
  assert.equal(capturedCreate.promptTokens, 123);
  assert.equal(capturedCreate.totalTokens, 579);
});

test('AdminLogBackfillService keeps cost null when matching AiRequestEvent is missing', async () => {
  let capturedCreate: any;
  const service = new AdminLogBackfillService({
    user: { findMany: async () => [] },
    auditLog: { findMany: async () => [] },
    activityLog: {
      findMany: async () => [
        {
          id: 'act_missing',
          actorId: 'user_1',
          eventType: 'ai.proxy.completed',
          metadataJson: { requestId: 'req_missing' },
          createdAt: new Date('2026-04-26T09:00:00.000Z'),
        },
      ],
    },
    securityEvent: { findMany: async () => [] },
    domainEvent: { findMany: async () => [] },
    aiRequestEvent: { findMany: async () => [] },
    adminLogEvent: {
      upsert: async ({ create }: any) => { capturedCreate = create; },
    },
  } as any, 100);

  await service.run({ stream: 'activity' });
  assert.equal(capturedCreate.costUsd, undefined);
});


test('admin log scripts initialize PrismaClient with explicit options', async () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const scriptsDir = path.resolve(currentDir, '../src/scripts');
  const scriptNames = [
    'admin-logs-backfill.ts',
    'admin-logs-verify-backfill.ts',
    'admin-logs-prune-read-model.ts',
    'admin-logs-repair-read-model.ts',
  ];

  for (const scriptName of scriptNames) {
    const scriptPath = path.join(scriptsDir, scriptName);
    const source = await readFile(scriptPath, 'utf8');
    assert.match(source, /new PrismaClient\(createPrismaClientOptions\(/, `${scriptName} must initialize Prisma with createPrismaClientOptions`);
    assert.doesNotMatch(source, /new PrismaClient\(\)/, `${scriptName} must not call new PrismaClient() without options`);
  }
});
