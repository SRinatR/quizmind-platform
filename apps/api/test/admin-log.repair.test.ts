import assert from 'node:assert/strict';
import test from 'node:test';

import { AdminLogRepairService } from '../src/logs/admin-log.repair';

test('AdminLogRepairService repairs readable fields and remains idempotent', async () => {
  const rows = [
    {
      id: 'evt_1',
      stream: 'activity',
      sourceRecordId: 'act_1',
      eventType: 'ai.proxy.completed',
      occurredAt: new Date('2026-04-26T09:00:00.000Z'),
      severity: null,
      actorId: 'user_1',
      actorEmail: null,
      actorDisplayName: null,
      targetType: null,
      targetId: null,
      summary: 'ai.proxy.completed',
      source: null,
      category: null,
      searchText: 'ai.proxy.completed',
      provider: null,
      model: null,
      durationMs: null,
      costUsd: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      metadataJson: {},
      payloadJson: null,
    },
  ];
  const updates: any[] = [];

  const prisma = {
    adminLogEvent: {
      findMany: async () => {
        if (rows.length === 0) return [];
        const page = [...rows];
        rows.length = 0;
        return page;
      },
      update: async ({ data }: any) => {
        updates.push(data);
      },
    },
    user: {
      findMany: async () => [{ id: 'user_1', email: 'user@example.com', displayName: 'Readable User' }],
    },
    aiRequestEvent: {
      findMany: async () => [{
        id: 'act_1',
        provider: 'openai',
        model: 'openai/gpt-4o',
        durationMs: 410,
        estimatedCostUsd: 0.0034,
        promptTokens: 99,
        completionTokens: 120,
        totalTokens: 219,
        promptExcerpt: 'Solve this quickly',
      }],
    },
  } as any;

  const service = new AdminLogRepairService(prisma, 100);
  const first = await service.repairReadModel();
  const second = await service.repairReadModel();

  assert.equal(first.inspected, 1);
  assert.equal(first.updated, 1);
  assert.equal(second.updated, 0);
  assert.equal(updates[0].actorEmail, 'user@example.com');
  assert.equal(updates[0].actorDisplayName, 'Readable User');
  assert.equal(updates[0].summary, 'AI request completed');
  assert.equal(updates[0].source, 'api');
  assert.equal(updates[0].targetType, 'ai_request');
  assert.equal(updates[0].targetId, 'act_1');
  assert.equal(updates[0].costUsd, 0.0034);
});
