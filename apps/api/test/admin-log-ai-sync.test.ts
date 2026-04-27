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
  const clauses = (where.OR ?? []) as Array<Record<string, unknown>>;
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
