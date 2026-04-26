import assert from 'node:assert/strict';
import test from 'node:test';

import { AiHistoryService } from '../src/history/ai-history.service';
import { AiHistoryRepository } from '../src/history/ai-history.repository';
import { type AiHistoryRepository } from '../src/history/ai-history.repository';
import { type HistoryBlobService } from '../src/history/history-blob.service';

function createService(overrides?: {
  repository?: Partial<AiHistoryRepository>;
  blobs?: Partial<HistoryBlobService>;
}) {
  const repository: Partial<AiHistoryRepository> = {
    listEventsForUser: async () => [],
    countEventsForUser: async () => 0,
    listLegacyForUserExcludingEventIds: async () => [],
    countLegacyForUserExcludingEventIds: async () => 0,
    getEventDetailForUser: async () => null,
    getLegacyDetailForUser: async () => null,
    upsertEventContentAndRollup: async () => undefined,
    getAnalytics: async () => ({
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      avgDurationMs: null,
      byModel: [],
    }),
    ...overrides?.repository,
  };
  const blobs: Partial<HistoryBlobService> = {
    readPrompt: async () => null,
    readResponse: async () => null,
    writePrompt: async () => 'requests/id/prompt.json',
    writeResponse: async () => 'requests/id/response.json',
    writeFileContent: async () => 'requests/id/file.bin',
    readJson: async () => null,
    ...overrides?.blobs,
  };

  return {
    service: new AiHistoryService(repository as AiHistoryRepository, blobs as HistoryBlobService),
    repository,
    blobs,
  };
}

test('AiHistoryService.persistContent dual-writes event/content/rollup', async () => {
  let upsertInput: any;
  const { service } = createService({
    repository: {
      upsertEventContentAndRollup: async (input: any) => {
        upsertInput = input;
      },
    },
    blobs: {
      writePrompt: async () => 'requests/req_1/prompt.json',
      writeResponse: async () => 'requests/req_1/response.json',
    },
  });

  await service.persistContent({
    requestId: 'req_1',
    userId: 'user_1',
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    requestType: 'text',
    promptContent: [{ role: 'user', content: 'hello' }],
    responseContent: { choices: [{ message: { content: 'world' } }] },
    promptTokens: 10,
    completionTokens: 20,
    occurredAt: new Date('2026-04-20T10:00:00.000Z'),
  });

  assert.equal(upsertInput.eventId, 'req_1');
  assert.equal(upsertInput.promptBlobKey, 'requests/req_1/prompt.json');
  assert.equal(upsertInput.responseBlobKey, 'requests/req_1/response.json');
  assert.equal(upsertInput.promptExcerpt, 'hello');
  assert.equal(upsertInput.responseExcerpt, 'world');
});

test('AiHistoryService.listHistory uses DB excerpts for new events without blob reads', async () => {
  let blobReads = 0;
  const { service } = createService({
    repository: {
      listEventsForUser: async () => [
        {
          id: 'evt_1',
          provider: 'openrouter',
          model: 'openai/gpt-4o-mini',
          keySource: 'platform',
          status: 'success',
          errorCode: null,
          promptTokens: 1,
          completionTokens: 2,
          totalTokens: 3,
          durationMs: 30,
          requestType: 'text',
          estimatedCostUsd: 0.001,
          promptExcerpt: 'prompt from db',
          responseExcerpt: 'response from db',
          occurredAt: new Date('2026-04-20T10:00:00.000Z'),
          content: { fileMetadataJson: null, expiresAt: new Date('2026-04-27T10:00:00.000Z'), deletedAt: null, promptBlobKey: null, responseBlobKey: null, fileBlobKey: null },
        } as any,
      ],
      countEventsForUser: async () => 1,
    },
    blobs: {
      readPrompt: async () => { blobReads += 1; return null; },
      readResponse: async () => { blobReads += 1; return null; },
    },
  });

  const result = await service.listHistory('user_1', { limit: 20, offset: 0 });
  assert.equal(result.items[0]?.promptExcerpt, 'prompt from db');
  assert.equal(result.items[0]?.responseExcerpt, 'response from db');
  assert.equal(blobReads, 0);
});

test('AiHistoryService.getDetail reads blobs only for selected item', async () => {
  let reads = 0;
  const { service } = createService({
    repository: {
      getEventDetailForUser: async () => ({
        id: 'evt_1',
        userId: 'user_1',
        installationId: null,
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        keySource: 'platform',
        status: 'success',
        errorCode: null,
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        durationMs: 30,
        requestType: 'text',
        estimatedCostUsd: 0.001,
        promptExcerpt: 'p',
        responseExcerpt: 'r',
        occurredAt: new Date('2026-04-20T10:00:00.000Z'),
        content: {
          fileMetadataJson: null,
          expiresAt: new Date('2026-04-27T10:00:00.000Z'),
          deletedAt: null,
          promptBlobKey: 'requests/evt_1/prompt.json',
          responseBlobKey: 'requests/evt_1/response.json',
          fileBlobKey: null,
        },
      } as any),
    },
    blobs: {
      readJson: async (key: string) => {
        reads += 1;
        return { key };
      },
    },
  });

  const detail = await service.getDetail('evt_1', 'user_1');
  assert.equal(reads, 2);
  assert.deepEqual(detail?.promptContentJson, { key: 'requests/evt_1/prompt.json' });
});

test('AiHistoryService.getDetail returns safe message for expired/deleted content', async () => {
  const { service } = createService({
    repository: {
      getEventDetailForUser: async () => ({
        id: 'evt_1',
        userId: 'user_1',
        installationId: null,
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        keySource: 'platform',
        status: 'success',
        errorCode: null,
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        durationMs: 30,
        requestType: 'text',
        estimatedCostUsd: 0.001,
        promptExcerpt: 'p',
        responseExcerpt: 'r',
        occurredAt: new Date('2026-04-20T10:00:00.000Z'),
        content: {
          fileMetadataJson: null,
          expiresAt: new Date('2026-04-01T10:00:00.000Z'),
          deletedAt: new Date('2026-04-02T10:00:00.000Z'),
          promptBlobKey: 'requests/evt_1/prompt.json',
          responseBlobKey: 'requests/evt_1/response.json',
          fileBlobKey: null,
        },
      } as any),
    },
  });

  const detail = await service.getDetail('evt_1', 'user_1');
  assert.match(String(detail?.promptContentJson), /expired/i);
});

test('AiHistoryService falls back to legacy AiRequest rows', async () => {
  const { service } = createService({
    repository: {
      getEventDetailForUser: async () => null,
      getLegacyDetailForUser: async () => ({
        id: 'legacy_1',
        userId: 'user_1',
        installationId: null,
        requestMetadata: null,
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        keySource: 'platform',
        status: 'success',
        errorCode: null,
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        durationMs: 30,
        requestType: 'text',
        fileMetadataJson: null,
        estimatedCostUsd: 0.001,
        occurredAt: new Date('2026-04-20T10:00:00.000Z'),
        expiresAt: null,
      } as any),
    },
    blobs: {
      readPrompt: async () => [{ role: 'user', content: 'legacy prompt' }],
      readResponse: async () => ({ choices: [{ message: { content: 'legacy response' } }] }),
    },
  });

  const detail = await service.getDetail('legacy_1', 'user_1');
  assert.equal(detail?.promptExcerpt, 'legacy prompt');
});

test('AiHistoryService.listHistory uses event-only pagination when events exist', async () => {
  const { service } = createService({
    repository: {
      listEventsForUser: async (input: any) => [
        {
          id: input.offset === 0 ? 'evt_2' : 'evt_1',
          provider: 'openrouter',
          model: 'openai/gpt-4o-mini',
          keySource: 'platform',
          status: 'success',
          errorCode: null,
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
          durationMs: 1,
          requestType: 'text',
          estimatedCostUsd: 0,
          promptExcerpt: 'p',
          responseExcerpt: 'r',
          occurredAt: new Date('2026-04-20T10:00:00.000Z'),
          content: {
            fileMetadataJson: null,
            expiresAt: new Date(),
            deletedAt: null,
            promptBlobKey: null,
            responseBlobKey: null,
            fileBlobKey: null,
          },
        } as any,
      ],
      countEventsForUser: async () => 2,
      listLegacyForUser: async () => [{ id: 'legacy_1' } as any],
    },
  });

  const page1 = await service.listHistory('user_1', { limit: 1, offset: 0 });
  const page2 = await service.listHistory('user_1', { limit: 1, offset: 1 });
  assert.equal(page1.total, 2);
  assert.equal(page1.items[0]?.id, 'evt_2');
  assert.equal(page2.items[0]?.id, 'evt_1');
});

test('AiHistoryRepository.upsertEventContentAndRollup is idempotent for same event', async () => {
  const events = new Map<string, any>();
  const rollups = new Map<string, any>();
  const keyFor = (v: any) => `${v.userId}|${v.date.toISOString()}|${v.model}|${v.requestType}|${v.status}`;
  const prisma: any = {
    $transaction: async (fn: any) => fn(prisma),
    aiRequestEvent: {
      findUnique: async ({ where }: any) => events.get(where.id) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const next = events.has(where.id) ? { ...events.get(where.id), ...update } : create;
        events.set(where.id, next);
      },
    },
    aiRequestContent: { upsert: async () => undefined },
    aiUsageDailyRollup: {
      findUnique: async ({ where }: any) => rollups.get(keyFor(where.userId_date_model_requestType_status)) ?? null,
      create: async ({ data }: any) => rollups.set(keyFor(data), { id: `r_${rollups.size + 1}`, ...data }),
      update: async ({ where, data }: any) => {
        for (const [k, v] of rollups.entries()) {
          if (v.id === where.id) rollups.set(k, { ...v, ...data });
        }
      },
    },
  };
  const repository = new AiHistoryRepository(prisma);
  const input = {
    eventId: 'evt_1',
    userId: 'user_1',
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    requestType: 'text' as const,
    keySource: 'platform',
    status: 'success',
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    estimatedCostUsd: 1,
    occurredAt: new Date('2026-04-20T10:00:00.000Z'),
    expiresAt: new Date('2026-04-27T10:00:00.000Z'),
  };

  await repository.upsertEventContentAndRollup(input);
  await repository.upsertEventContentAndRollup(input);
  const row = [...rollups.values()][0];
  assert.equal(row.requestCount, 1);
  assert.equal(row.totalTokens, 30);
});

test('AiHistoryRepository.upsertEventContentAndRollup moves buckets when status/model/date/type changes', async () => {
  const events = new Map<string, any>();
  const rollups = new Map<string, any>();
  const keyFor = (v: any) => `${v.userId}|${v.date.toISOString()}|${v.model}|${v.requestType}|${v.status}`;
  const prisma: any = {
    $transaction: async (fn: any) => fn(prisma),
    aiRequestEvent: {
      findUnique: async ({ where }: any) => events.get(where.id) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const next = events.has(where.id) ? { ...events.get(where.id), ...update } : create;
        events.set(where.id, next);
      },
    },
    aiRequestContent: { upsert: async () => undefined },
    aiUsageDailyRollup: {
      findUnique: async ({ where }: any) => rollups.get(keyFor(where.userId_date_model_requestType_status)) ?? null,
      create: async ({ data }: any) => rollups.set(keyFor(data), { id: `r_${rollups.size + 1}`, ...data }),
      update: async ({ where, data }: any) => {
        for (const [k, v] of rollups.entries()) {
          if (v.id === where.id) rollups.set(k, { ...v, ...data });
        }
      },
    },
  };
  const repository = new AiHistoryRepository(prisma);
  await repository.upsertEventContentAndRollup({
    eventId: 'evt_1', userId: 'user_1', provider: 'openrouter', model: 'm1', requestType: 'text', keySource: 'platform',
    status: 'error', promptTokens: 1, completionTokens: 0, totalTokens: 1, estimatedCostUsd: 1, occurredAt: new Date('2026-04-20T10:00:00.000Z'), expiresAt: new Date(),
  });
  await repository.upsertEventContentAndRollup({
    eventId: 'evt_1', userId: 'user_1', provider: 'openrouter', model: 'm2', requestType: 'image', keySource: 'platform',
    status: 'success', promptTokens: 3, completionTokens: 2, totalTokens: 5, estimatedCostUsd: 2, occurredAt: new Date('2026-04-21T10:00:00.000Z'), expiresAt: new Date(),
  });
  const all = [...rollups.values()];
  const oldBucket = all.find((row) => row.model === 'm1');
  const newBucket = all.find((row) => row.model === 'm2');
  assert.equal(oldBucket?.requestCount, 0);
  assert.equal(newBucket?.requestCount, 1);
  assert.equal(newBucket?.successCount, 1);
});

test('AiHistoryRepository.getAnalytics falls back to events when rollup coverage is partial', async () => {
  const prisma: any = {
    aiUsageDailyRollup: {
      findMany: async () => [{
        model: 'm1', status: 'success', requestCount: 1, successCount: 1, failedCount: 0, promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: 1, totalDurationMs: 10, date: new Date('2026-04-20T00:00:00.000Z'),
      }],
    },
    aiRequestEvent: {
      findMany: async ({ select }: any) => (select?.occurredAt ? [{ occurredAt: new Date('2026-04-20T12:00:00.000Z') }, { occurredAt: new Date('2026-04-21T12:00:00.000Z') }] : []),
      aggregate: async () => ({ _count: { id: 2 }, _sum: { promptTokens: 2, completionTokens: 2, totalTokens: 4, estimatedCostUsd: 2, durationMs: 20 } }),
      groupBy: async () => [{ model: 'm1', status: 'success', _count: { id: 2 }, _sum: { promptTokens: 2, completionTokens: 2, totalTokens: 4, estimatedCostUsd: 2, durationMs: 20 } }],
      count: async () => 2,
    },
  };
  const repository = new AiHistoryRepository(prisma);
  const snapshot = await repository.getAnalytics({ userId: 'user_1', from: new Date('2026-04-20T00:00:00.000Z'), to: new Date('2026-04-21T23:59:59.000Z') });
  assert.equal(snapshot.totalRequests, 2);
});

test('AiHistoryRepository.getAnalytics uses rollups when coverage is full', async () => {
  const prisma: any = {
    aiUsageDailyRollup: {
      findMany: async () => [{
        model: 'm1', status: 'success', requestCount: 2, successCount: 2, failedCount: 0, promptTokens: 2, completionTokens: 2, totalTokens: 4, estimatedCostUsd: 2, totalDurationMs: 20, date: new Date('2026-04-20T00:00:00.000Z'),
      }],
    },
    aiRequestEvent: {
      findMany: async () => [{ occurredAt: new Date('2026-04-20T12:00:00.000Z') }],
      aggregate: async () => ({ _count: { id: 99 }, _sum: { promptTokens: 99, completionTokens: 99, totalTokens: 99, estimatedCostUsd: 99, durationMs: 99 } }),
      groupBy: async () => [],
      count: async () => 0,
    },
  };
  const repository = new AiHistoryRepository(prisma);
  const snapshot = await repository.getAnalytics({ userId: 'user_1', from: new Date('2026-04-20T00:00:00.000Z'), to: new Date('2026-04-20T23:59:59.000Z') });
  assert.equal(snapshot.totalRequests, 2);
});

test('AiHistoryService.listHistory falls back to legacy list when no events exist', async () => {
  const { service } = createService({
    repository: {
      listEventsForUser: async () => [],
      countEventsForUser: async () => 0,
      listLegacyForUser: async () => [
        {
          id: 'legacy_1',
          provider: 'openrouter',
          model: 'openai/gpt-4o-mini',
          keySource: 'platform',
          status: 'success',
          errorCode: null,
          promptTokens: 1,
          completionTokens: 2,
          totalTokens: 3,
          durationMs: 1,
          requestType: 'text',
          fileMetadataJson: null,
          estimatedCostUsd: 0,
          occurredAt: new Date('2026-04-20T10:00:00.000Z'),
          expiresAt: null,
        } as any,
      ],
      countLegacyForUser: async () => 1,
    },
  });
  const result = await service.listHistory('user_1', { limit: 10, offset: 0 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.id, 'legacy_1');
});
