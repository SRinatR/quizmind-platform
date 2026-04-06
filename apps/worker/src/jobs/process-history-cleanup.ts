import { Prisma, type PrismaClient } from '@quizmind/database';
import { type HistoryCleanupJobPayload } from '@quizmind/contracts';
import { createLogEvent, type StructuredLogEvent } from '@quizmind/logger';

export interface HistoryCleanupResult {
  logEvent: StructuredLogEvent;
  deletedCount: number;
}

export async function processHistoryCleanupJob(
  payload: HistoryCleanupJobPayload,
  prisma: PrismaClient,
): Promise<HistoryCleanupResult> {
  const now = new Date();
  const batchSize = 500;
  let totalDeleted = 0;

  // Null out content on expired records in batches.
  while (true) {
    const expiredIds = await prisma.aiRequest.findMany({
      where: {
        contentExpiresAt: { lt: now },
        promptContentJson: { not: Prisma.JsonNull },
      },
      select: { id: true },
      take: batchSize,
    });

    if (expiredIds.length === 0) break;

    const ids = expiredIds.map((r) => r.id);
    await prisma.aiRequest.updateMany({
      where: { id: { in: ids } },
      data: {
        promptContentJson: Prisma.JsonNull,
        responseContentJson: Prisma.JsonNull,
        fileMetadataJson: Prisma.JsonNull,
        contentExpiresAt: null,
      },
    });

    totalDeleted += ids.length;

    if (ids.length < batchSize) break;
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
    metadata: { totalDeleted, triggeredAt: payload.triggeredAt },
  });

  return { logEvent, deletedCount: totalDeleted };
}
