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
        return [{ id: 'cnt_1', aiRequestEventId: 'evt_1', promptBlobKey: null, responseBlobKey: null, fileBlobKey: null }];
      },
      updateMany: async ({ where }: any) => {
        updatedIds.push(...where.id.in);
        return { count: where.id.in.length };
      },
    },
    aiRequestAttachment: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
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
    aiRequestAttachment: {
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

test('processHistoryCleanupJob does not hang when a full legacy batch is entirely protected by events', async () => {
  const BATCH = 200;
  let calls = 0;
  let deleted = 0;
  const protectedRows = Array.from({ length: BATCH }, (_, i) => ({ id: `req_${String(i).padStart(3, '0')}` }));
  const prisma = {
    aiRequestContent: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    aiRequestAttachment: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    aiRequestEvent: {
      findMany: async () => protectedRows,
    },
    aiRequest: {
      findMany: async () => {
        calls += 1;
        if (calls === 1) return protectedRows;
        return [];
      },
      deleteMany: async ({ where }: any) => {
        deleted += where.id.in.length;
        return { count: where.id.in.length };
      },
    },
  } as any;

  const result = await processHistoryCleanupJob({ triggeredAt: '2026-04-26T00:00:00.000Z' }, prisma);
  assert.equal(result.deletedRows, 0);
  assert.equal(deleted, 0);
  assert.equal(calls, 2);
});

test('processHistoryCleanupJob deletes expired attachment blobs and marks attachment rows deleted', async () => {
  let pending = true;
  const updatedAttachmentIds: string[] = [];
  const prisma = {
    aiRequestContent: {
      findMany: async () => {
        if (!pending) return [];
        pending = false;
        return [{ id: 'cnt_1', aiRequestEventId: 'evt_1', promptBlobKey: null, responseBlobKey: null, fileBlobKey: null }];
      },
      updateMany: async ({ where }: any) => ({ count: where.id.in.length }),
    },
    aiRequestAttachment: {
      findMany: async () => [{ id: 'att_1', blobKey: 'requests/evt_1/attachments/att_1.bin' }],
      updateMany: async ({ where }: any) => {
        updatedAttachmentIds.push(...where.id.in);
        return { count: where.id.in.length };
      },
    },
    aiRequestEvent: {
      findMany: async () => [],
    },
    aiRequest: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
  } as any;

  await processHistoryCleanupJob({ triggeredAt: '2026-04-26T00:00:00.000Z' }, prisma);
  assert.deepEqual(updatedAttachmentIds, ['att_1']);
});
