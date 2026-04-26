import { Prisma, type PrismaClient } from '@quizmind/database';
import { type HistoryCleanupJobPayload } from '@quizmind/contracts';
import { createLogEvent, type StructuredLogEvent } from '@quizmind/logger';

import fs from 'node:fs/promises';
import path from 'node:path';

export interface HistoryCleanupResult {
  logEvent: StructuredLogEvent;
  deletedRows: number;
}

async function tryUnlink(p: string): Promise<void> {
  try { await fs.unlink(p); } catch { /* already gone */ }
}

function toPath(blobDir: string, key: string): string {
  return path.join(blobDir, key);
}

export async function processHistoryCleanupJob(
  payload: HistoryCleanupJobPayload,
  prisma: PrismaClient,
): Promise<HistoryCleanupResult> {
  const blobDir = resolveHistoryBlobDir();
  const BATCH = 200;
  let deletedRows = 0;

  while (true) {
    const expiredContents = await prisma.aiRequestContent.findMany({
      where: {
        expiresAt: { lt: new Date() },
        deletedAt: null,
      },
      select: {
        id: true,
        aiRequestEventId: true,
        promptBlobKey: true,
        responseBlobKey: true,
        fileBlobKey: true,
      },
      take: BATCH,
      orderBy: { expiresAt: 'asc' },
    });

    if (expiredContents.length === 0) break;

    await Promise.all(expiredContents.flatMap((content) => {
      const keys = [content.promptBlobKey, content.responseBlobKey, content.fileBlobKey].filter((k): k is string => Boolean(k));
      return keys.map((key) => tryUnlink(toPath(blobDir, key)));
    }));

    const eventIds = expiredContents.map((row) => row.aiRequestEventId);
    const expiredAttachments = await prisma.aiRequestAttachment.findMany({
      where: {
        aiRequestEventId: { in: eventIds },
        deletedAt: null,
      },
      select: {
        id: true,
        blobKey: true,
      },
    });
    await Promise.all(expiredAttachments.map((attachment) => tryUnlink(toPath(blobDir, attachment.blobKey))));
    if (expiredAttachments.length > 0) {
      await prisma.aiRequestAttachment.updateMany({
        where: { id: { in: expiredAttachments.map((attachment) => attachment.id) }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }

    const ids = expiredContents.map((row) => row.id);
    const result = await prisma.aiRequestContent.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    deletedRows += result.count;

    if (expiredContents.length < BATCH) break;
  }

  // Legacy cleanup path remains only for old ai_requests rows.
  let legacyCursorId: string | null = null;
  while (true) {
    const legacy = await prisma.aiRequest.findMany({
      ...(legacyCursorId ? { cursor: { id: legacyCursorId }, skip: 1 } : {}),
      where: { expiresAt: { lt: new Date() } },
      select: { id: true },
      take: BATCH,
      orderBy: { id: 'asc' },
    });
    if (legacy.length === 0) break;
    legacyCursorId = legacy[legacy.length - 1]?.id ?? null;
    const legacyIds = legacy.map((row) => row.id);
    const matchingEventRows = await prisma.aiRequestEvent.findMany({
      where: { id: { in: legacyIds } },
      select: { id: true },
    });
    const matchingEventIds = new Set(matchingEventRows.map((row) => row.id));
    const legacyOnlyIds = legacyIds.filter((id) => !matchingEventIds.has(id));
    if (legacyOnlyIds.length > 0) {
      await Promise.all(legacyOnlyIds.flatMap((id) => [
        tryUnlink(path.join(blobDir, `requests/${id}/prompt.json`)),
        tryUnlink(path.join(blobDir, `requests/${id}/response.json`)),
        tryUnlink(path.join(blobDir, `requests/${id}/file.bin`)),
        tryUnlink(path.join(blobDir, `${id}.prompt.json`)),
        tryUnlink(path.join(blobDir, `${id}.response.json`)),
        tryUnlink(path.join(blobDir, `${id}.file.bin`)),
      ]));

      const removed = await prisma.aiRequest.deleteMany({ where: { id: { in: legacyOnlyIds } } });
      deletedRows += removed.count;
    }
    if (legacy.length < BATCH) break;
  }

  const logEvent = createLogEvent({
    eventId: `history-cleanup:${payload.triggeredAt}`,
    eventType: 'platform.history_cleanup_completed',
    actorId: 'worker',
    actorType: 'system',
    targetType: 'ai_request_history',
    targetId: 'all',
    occurredAt: new Date().toISOString(),
    category: 'system',
    severity: 'info',
    status: 'success',
    metadata: { deletedRows, triggeredAt: payload.triggeredAt } satisfies Prisma.InputJsonObject,
  });

  return { logEvent, deletedRows };
}
function resolveHistoryBlobDir(): string {
  return process.env['HISTORY_BLOB_DIR'] ?? path.join(process.cwd(), 'data', 'history');
}
