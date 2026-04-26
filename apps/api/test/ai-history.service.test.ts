import assert from 'node:assert/strict';
import test from 'node:test';

import { AiHistoryService } from '../src/history/ai-history.service';
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
