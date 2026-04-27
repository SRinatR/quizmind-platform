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
      deleteMany: async () => ({ count: 0 }),
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
        status: 'success',
      }],
    },
  } as any;

  const service = new AdminLogRepairService(prisma, 100);
  const first = await service.repairReadModel();
  const second = await service.repairReadModel();

  assert.equal(first.inspected, 1);
  assert.equal(first.updated, 1);
  assert.equal(first.enrichedAi, 1);
  assert.equal(second.updated, 0);
  assert.equal(updates[0].actorEmail, 'user@example.com');
  assert.equal(updates[0].actorDisplayName, 'Readable User');
  assert.equal(updates[0].summary, 'AI request completed');
  assert.equal(updates[0].source, 'api');
  assert.equal(updates[0].targetType, 'ai_request');
  assert.equal(updates[0].targetId, 'act_1');
  assert.equal(updates[0].costUsd, 0.0034);
  assert.equal(updates[0].status, 'success');
});

test('AdminLogRepairService maps ai request tokens and cost when aiRequestEventId metadata is present', async () => {
  const updates: any[] = [];
  let emitted = false;
  const prisma = {
    adminLogEvent: {
      findMany: async () => {
        if (emitted) return [];
        emitted = true;
        return [{
        id: 'evt_2',
        stream: 'activity',
        sourceRecordId: 'activity_2',
        eventType: 'ai.proxy.completed',
        occurredAt: new Date('2026-04-26T09:00:00.000Z'),
        severity: null,
        actorId: null,
        actorEmail: null,
        actorDisplayName: null,
        targetType: null,
        targetId: null,
        summary: 'ai.proxy.completed',
        source: null,
        category: null,
        searchText: null,
        provider: null,
        model: null,
        durationMs: null,
        costUsd: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        metadataJson: { aiRequestEventId: 'req_meta_1' },
        payloadJson: null,
      }];
      },
      update: async ({ data }: any) => { updates.push(data); },
      deleteMany: async () => ({ count: 0 }),
    },
    user: { findMany: async () => [] },
    aiRequestEvent: {
      findMany: async () => [{
        id: 'req_meta_1',
        provider: 'openai',
        model: 'openai/gpt-4o',
        durationMs: 480,
        estimatedCostUsd: 0.00166,
        promptTokens: 88,
        completionTokens: 55,
        totalTokens: 143,
        promptExcerpt: 'prompt',
        status: 'success',
      }],
    },
  } as any;

  const service = new AdminLogRepairService(prisma, 100);
  await service.repairReadModel();

  assert.equal(updates[0].costUsd, 0.00166);
  assert.equal(updates[0].promptTokens, 88);
  assert.equal(updates[0].completionTokens, 55);
  assert.equal(updates[0].totalTokens, 143);
});

test('AdminLogRepairService keeps missing ai request usage fields absent instead of zero', async () => {
  const updates: any[] = [];
  let emitted = false;
  const prisma = {
    adminLogEvent: {
      findMany: async () => {
        if (emitted) return [];
        emitted = true;
        return [{
        id: 'evt_3',
        stream: 'activity',
        sourceRecordId: 'activity_3',
        eventType: 'ai.proxy.completed',
        occurredAt: new Date('2026-04-26T09:00:00.000Z'),
        severity: null,
        actorId: null,
        actorEmail: null,
        actorDisplayName: null,
        targetType: null,
        targetId: null,
        summary: 'ai.proxy.completed',
        source: null,
        category: null,
        searchText: null,
        provider: null,
        model: null,
        durationMs: null,
        costUsd: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        metadataJson: { aiRequestId: 'missing_req' },
        payloadJson: null,
      }];
      },
      update: async ({ data }: any) => { updates.push(data); },
      deleteMany: async () => ({ count: 0 }),
    },
    user: { findMany: async () => [] },
    aiRequestEvent: { findMany: async () => [] },
  } as any;

  const service = new AdminLogRepairService(prisma, 100);
  await service.repairReadModel();

  assert.equal(updates[0].costUsd, null);
  assert.equal(updates[0].promptTokens, null);
  assert.equal(updates[0].completionTokens, null);
  assert.equal(updates[0].totalTokens, null);
});

test('AdminLogRepairService removes duplicate AI domain rows when an activity equivalent exists', async () => {
  let pass = 0;
  let deletedIds: string[] = [];
  const prisma = {
    adminLogEvent: {
      findMany: async ({ where }: any) => {
        if (where?.stream === 'activity') {
          return [{ id: 'evt_activity', targetId: 'req_77' }];
        }
        if (pass > 0) return [];
        pass += 1;
        return [{
          id: 'evt_domain',
          stream: 'domain',
          sourceRecordId: 'domain_77',
          eventType: 'ai.proxy.completed',
          occurredAt: new Date('2026-04-26T09:00:00.000Z'),
          severity: null,
          status: null,
          actorId: null,
          actorEmail: null,
          actorDisplayName: null,
          targetType: null,
          targetId: null,
          summary: 'ai.proxy.completed',
          source: null,
          category: null,
          searchText: null,
          provider: null,
          model: null,
          durationMs: null,
          costUsd: null,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          metadataJson: { requestId: 'req_77' },
          payloadJson: null,
        }];
      },
      update: async () => undefined,
      deleteMany: async ({ where }: any) => {
        deletedIds = where.id.in;
        return { count: deletedIds.length };
      },
    },
    user: { findMany: async () => [] },
    aiRequestEvent: { findMany: async () => [] },
  } as any;

  const service = new AdminLogRepairService(prisma, 100);
  const result = await service.repairReadModel();
  assert.deepEqual(deletedIds, ['evt_domain']);
  assert.equal(result.duplicateAiDomainDeleted, 1);
});
