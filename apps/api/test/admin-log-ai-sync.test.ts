import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdminAiLogPatchFromAiRequestEvent,
  buildAdminAiLogSyncWhere,
  normalizeAdminAiStatus,
  syncAdminAiLogEventsFromAiRequestEvent,
} from '../src/logs/admin-log-ai-sync';

test('normalizeAdminAiStatus maps ai statuses to admin success/failure', () => {
  assert.equal(normalizeAdminAiStatus('success'), 'success');
  assert.equal(normalizeAdminAiStatus('error'), 'failure');
  assert.equal(normalizeAdminAiStatus('quota_exceeded'), 'failure');
  assert.equal(normalizeAdminAiStatus('timeout'), 'failure');
  assert.equal(normalizeAdminAiStatus('pending'), undefined);
});

test('buildAdminAiLogPatchFromAiRequestEvent preserves null cost and usage fields', () => {
  const patch = buildAdminAiLogPatchFromAiRequestEvent({
    id: 'req_1',
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    durationMs: 123,
    estimatedCostUsd: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    status: 'success',
  });

  assert.equal(patch.targetType, 'ai_request');
  assert.equal(patch.targetId, 'req_1');
  assert.equal(patch.costUsd, null);
  assert.equal(patch.promptTokens, null);
  assert.equal(patch.status, 'success');
});

test('buildAdminAiLogSyncWhere includes all ai request aliases across metadata/payload', () => {
  const where = buildAdminAiLogSyncWhere('req_alias_1');
  const guard = (where.AND ?? [])[0] as Record<string, unknown>;
  const aliasBlock = (where.AND ?? [])[1] as Record<string, unknown>;
  const clauses = (aliasBlock.OR ?? []) as Array<Record<string, unknown>>;
  assert.deepEqual(guard, {
    OR: [
      { category: 'ai' },
      { eventType: { in: ['ai.proxy.completed', 'ai.proxy.failed', 'ai.proxy.quota_exceeded', 'ai.proxy.timeout'] } },
    ],
  });
  assert.equal(clauses.length, 14);
  assert.deepEqual(clauses[0], { targetType: 'ai_request', targetId: 'req_alias_1' });
  assert.deepEqual(clauses[1], { metadataJson: { path: ['aiRequestEventId'], equals: 'req_alias_1' } });
  assert.deepEqual(clauses[7], { payloadJson: { path: ['aiRequestEventId'], equals: 'req_alias_1' } });
  assert.deepEqual(clauses[13], { sourceRecordId: 'req_alias_1' });
});

test('syncAdminAiLogEventsFromAiRequestEvent patches matching admin rows', async () => {
  let captured: any;
  const prisma = {
    adminLogEvent: {
      updateMany: async (args: any) => {
        captured = args;
        return { count: 2 };
      },
    },
  } as any;

  const count = await syncAdminAiLogEventsFromAiRequestEvent(prisma, {
    id: 'req_2',
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    durationMs: 456,
    estimatedCostUsd: 0.00123,
    promptTokens: 4,
    completionTokens: 5,
    totalTokens: 9,
    status: 'failed',
    promptExcerpt: 'hidden',
  });

  assert.equal(count, 2);
  assert.equal(captured.data.targetType, 'ai_request');
  assert.equal(captured.data.targetId, 'req_2');
  assert.equal(captured.data.costUsd, 0.00123);
  assert.equal(captured.data.status, 'failure');
  assert.equal(captured.data.promptExcerpt, undefined);
});

test('syncAdminAiLogEventsFromAiRequestEvent keeps category/eventType guard to avoid unrelated rows', async () => {
  let captured: any;
  const prisma = {
    adminLogEvent: {
      updateMany: async (args: any) => {
        captured = args;
        return { count: 1 };
      },
    },
  } as any;

  await syncAdminAiLogEventsFromAiRequestEvent(prisma, {
    id: 'req_guard_1',
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    durationMs: 10,
    estimatedCostUsd: 0.0001,
    promptTokens: 1,
    completionTokens: 2,
    totalTokens: 3,
    status: 'success',
  });

  const guard = (captured.where.AND ?? [])[0];
  assert.deepEqual(guard, {
    OR: [
      { category: 'ai' },
      { eventType: { in: ['ai.proxy.completed', 'ai.proxy.failed', 'ai.proxy.quota_exceeded', 'ai.proxy.timeout'] } },
    ],
  });
});

test('runtime sync intent targets ai row and excludes non-ai row with same request id', async () => {
  const rows = [
    { id: 'evt_ai', category: 'ai', eventType: 'ai.proxy.completed', metadataJson: { requestId: 'req_shared_1' }, costUsd: null },
    { id: 'evt_security', category: 'security', eventType: 'auth.login_failed', metadataJson: { requestId: 'req_shared_1' }, costUsd: null },
  ];
  let updatedIds: string[] = [];
  const prisma = {
    adminLogEvent: {
      updateMany: async ({ where, data }: any) => {
        const guard = where.AND[0];
        const aliases = where.AND[1].OR;
        updatedIds = rows
          .filter((row) => {
            const inGuard = row.category === guard.OR[0].category
              || guard.OR[1].eventType.in.includes(row.eventType);
            const aliasMatch = aliases.some((alias: any) => alias.metadataJson?.path?.[0] === 'requestId'
              && alias.metadataJson.equals === row.metadataJson.requestId);
            return inGuard && aliasMatch;
          })
          .map((row) => row.id);
        for (const row of rows) {
          if (updatedIds.includes(row.id)) row.costUsd = data.costUsd;
        }
        return { count: updatedIds.length };
      },
    },
  } as any;

  await syncAdminAiLogEventsFromAiRequestEvent(prisma, {
    id: 'req_shared_1',
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    durationMs: 1,
    estimatedCostUsd: 0.002,
    promptTokens: 1,
    completionTokens: 2,
    totalTokens: 3,
    status: 'success',
  });

  assert.deepEqual(updatedIds, ['evt_ai']);
  assert.equal(rows[0]?.costUsd, 0.002);
  assert.equal(rows[1]?.costUsd, null);
});
