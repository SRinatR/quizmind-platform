import fs from 'node:fs/promises';
import path from 'node:path';

import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();
const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE ?? 500);
const blobDir = process.env.HISTORY_BLOB_DIR ?? path.join(process.cwd(), 'data', 'history');

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDateAtUtcStart(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveLegacyBlobKey(requestId: string, kind: 'prompt' | 'response' | 'file'): Promise<string | undefined> {
  const newPath = kind === 'file'
    ? `requests/${requestId}/file.bin`
    : `requests/${requestId}/${kind}.json`;
  const oldPath = kind === 'file' ? `${requestId}.file.bin` : `${requestId}.${kind}.json`;

  if (await fileExists(path.join(blobDir, newPath))) return newPath;
  if (await fileExists(path.join(blobDir, oldPath))) return oldPath;
  return undefined;
}

async function backfillEventsAndContent(): Promise<number> {
  let cursorId: string | undefined;
  let processed = 0;

  while (true) {
    const rows = await prisma.aiRequest.findMany({
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        installationId: true,
        provider: true,
        model: true,
        requestType: true,
        keySource: true,
        status: true,
        errorCode: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        estimatedCostUsd: true,
        durationMs: true,
        occurredAt: true,
        expiresAt: true,
        fileMetadataJson: true,
      },
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      const promptBlobKey = await resolveLegacyBlobKey(row.id, 'prompt');
      const responseBlobKey = await resolveLegacyBlobKey(row.id, 'response');
      const fileBlobKey = await resolveLegacyBlobKey(row.id, 'file');

      await prisma.aiRequestEvent.upsert({
        where: { id: row.id },
        create: {
          id: row.id,
          userId: row.userId,
          workspaceId: row.workspaceId,
          installationId: row.installationId,
          provider: row.provider,
          model: row.model,
          requestType: row.requestType ?? 'text',
          keySource: row.keySource,
          status: row.status,
          errorCode: row.errorCode,
          promptTokens: row.promptTokens,
          completionTokens: row.completionTokens,
          totalTokens: row.totalTokens,
          estimatedCostUsd: row.estimatedCostUsd,
          durationMs: row.durationMs,
          occurredAt: row.occurredAt,
        },
        update: {
          workspaceId: row.workspaceId,
          installationId: row.installationId,
          provider: row.provider,
          model: row.model,
          requestType: row.requestType ?? 'text',
          keySource: row.keySource,
          status: row.status,
          errorCode: row.errorCode,
          promptTokens: row.promptTokens,
          completionTokens: row.completionTokens,
          totalTokens: row.totalTokens,
          estimatedCostUsd: row.estimatedCostUsd,
          durationMs: row.durationMs,
          occurredAt: row.occurredAt,
        },
      });

      await prisma.aiRequestContent.upsert({
        where: { aiRequestEventId: row.id },
        create: {
          aiRequestEventId: row.id,
          promptBlobKey,
          responseBlobKey,
          fileBlobKey,
          fileMetadataJson: row.fileMetadataJson,
          expiresAt: row.expiresAt ?? new Date(row.occurredAt.getTime() + 7 * 24 * 60 * 60 * 1000),
          deletedAt: null,
        },
        update: {
          promptBlobKey,
          responseBlobKey,
          fileBlobKey,
          fileMetadataJson: row.fileMetadataJson,
          expiresAt: row.expiresAt ?? new Date(row.occurredAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      processed += 1;
    }

    cursorId = rows.at(-1)?.id;
  }

  return processed;
}

async function rebuildRollups(): Promise<number> {
  await prisma.aiUsageDailyRollup.deleteMany({});

  const events = await prisma.aiRequestEvent.findMany({
    select: {
      userId: true,
      occurredAt: true,
      requestType: true,
      model: true,
      modelDisplayName: true,
      status: true,
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      estimatedCostUsd: true,
      durationMs: true,
    },
  });

  const buckets = new Map<string, {
    userId: string;
    date: Date;
    requestType: string;
    model: string;
    modelDisplayName: string | null;
    status: string;
    requestCount: number;
    successCount: number;
    failedCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    totalDurationMs: number;
  }>();

  for (const event of events) {
    const dateKey = dayKey(event.occurredAt);
    const key = [event.userId, dateKey, event.model, event.requestType ?? 'text', event.status].join('|');
    const existing = buckets.get(key) ?? {
      userId: event.userId,
      date: toDateAtUtcStart(dateKey),
      requestType: event.requestType ?? 'text',
      model: event.model,
      modelDisplayName: event.modelDisplayName,
      status: event.status,
      requestCount: 0,
      successCount: 0,
      failedCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      totalDurationMs: 0,
    };
    existing.requestCount += 1;
    existing.successCount += event.status === 'success' ? 1 : 0;
    existing.failedCount += event.status === 'success' ? 0 : 1;
    existing.promptTokens += event.promptTokens;
    existing.completionTokens += event.completionTokens;
    existing.totalTokens += event.totalTokens;
    existing.estimatedCostUsd += event.estimatedCostUsd ?? 0;
    existing.totalDurationMs += event.durationMs ?? 0;
    buckets.set(key, existing);
  }

  const values = [...buckets.values()];
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const chunk = values.slice(i, i + BATCH_SIZE);
    await prisma.aiUsageDailyRollup.createMany({ data: chunk });
  }
  return values.length;
}

async function main() {
  const processed = await backfillEventsAndContent();
  const rollups = await rebuildRollups();
  console.log(`Backfill complete. events_processed=${processed} rollup_buckets=${rollups}`);
}

main()
  .catch((error) => {
    console.error('Backfill failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
