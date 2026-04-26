import assert from 'node:assert/strict';
import test from 'node:test';

import { processHistoryCleanupJob } from '../src/jobs/process-history-cleanup';

test('processHistoryCleanupJob marks expired content deleted and keeps event rows', async () => {
  const updatedIds: string[] = [];
  let legacyDeleted = false;
  let pending = true;
  const prisma = {
    aiRequestContent: {
      findMany: async () => {
        if (!pending) return [];
        pending = false;
        return [{ id: 'cnt_1', promptBlobKey: null, responseBlobKey: null, fileBlobKey: null }];
      },
      updateMany: async ({ where }: any) => {
        updatedIds.push(...where.id.in);
        return { count: where.id.in.length };
      },
    },
    aiRequestEvent: {
      findMany: async () => [],
    },
    aiRequest: {
      findMany: async () => [],
      deleteMany: async () => {
        legacyDeleted = true;
        return { count: 0 };
      },
    },
  } as any;

  const result = await processHistoryCleanupJob({ triggeredAt: '2026-04-26T00:00:00.000Z' }, prisma);

  assert.equal(result.deletedRows, 1);
  assert.deepEqual(updatedIds, ['cnt_1']);
  assert.equal(legacyDeleted, false);
});

test('processHistoryCleanupJob deletes only legacy ai_requests without matching event ids', async () => {
  let legacyPending = true;
  let deletedIds: string[] = [];
  const prisma = {
    aiRequestContent: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    aiRequestEvent: {
      findMany: async () => [{ id: 'req_keep' }],
    },
    aiRequest: {
      findMany: async () => {
        if (!legacyPending) return [];
        legacyPending = false;
        return [{ id: 'req_keep' }, { id: 'req_delete' }];
      },
      deleteMany: async ({ where }: any) => {
        deletedIds = where.id.in;
        return { count: where.id.in.length };
      },
    },
  } as any;

  const result = await processHistoryCleanupJob({ triggeredAt: '2026-04-26T00:00:00.000Z' }, prisma);
  assert.equal(result.deletedRows, 1);
  assert.deepEqual(deletedIds, ['req_delete']);
});
