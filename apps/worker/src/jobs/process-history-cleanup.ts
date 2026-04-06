import fs from 'node:fs/promises';
import path from 'node:path';

import { Prisma, type PrismaClient } from '@quizmind/database';
import { type HistoryCleanupJobPayload } from '@quizmind/contracts';
import { createLogEvent, type StructuredLogEvent } from '@quizmind/logger';

export interface HistoryCleanupResult {
  logEvent: StructuredLogEvent;
  deletedRows: number;
}

function resolveBlobDir(): string {
  return process.env['HISTORY_BLOB_DIR'] ?? path.join(process.cwd(), 'data', 'history');
}

async function tryUnlink(p: string): Promise<void> {
  try { await fs.unlink(p); } catch { /* already gone */ }
}

async function deleteBlobs(blobDir: string, requestId: string): Promise<void> {
  await Promise.all([
    tryUnlink(path.join(blobDir, `${requestId}.prompt.json`)),
    tryUnlink(path.join(blobDir, `${requestId}.response.json`)),
    tryUnlink(path.join(blobDir, `${requestId}.file.bin`)),
  ]);
}

export async function processHistoryCleanupJob(
  payload: HistoryCleanupJobPayload,
  prisma: PrismaClient,
): Promise<HistoryCleanupResult> {
  const blobDir = resolveBlobDir();
  const BATCH = 200;
  let deletedRows = 0;

  while (true) {
    // Find a batch of expired history rows.
    const expired = await prisma.aiRequest.findMany({
      where: { expiresAt: { lt: new Date() } },
      select: { id: true },
      take: BATCH,
      orderBy: { expiresAt: 'asc' },
    });

    if (expired.length === 0) break;

    const ids = expired.map((r) => r.id);

    // Delete blob files first (idempotent – missing files are fine).
    await Promise.all(ids.map((id) => deleteBlobs(blobDir, id)));

    // Hard-delete the DB rows.
    const result = await prisma.aiRequest.deleteMany({ where: { id: { in: ids } } });
    deletedRows += result.count;

    if (ids.length < BATCH) break;
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
    metadata: { deletedRows, triggeredAt: payload.triggeredAt },
  });

  return { logEvent, deletedRows };
}
