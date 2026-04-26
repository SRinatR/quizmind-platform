import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const aiHistoryEventListSelect = {
  id: true,
  provider: true,
  model: true,
  keySource: true,
  status: true,
  errorCode: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  durationMs: true,
  requestType: true,
  estimatedCostUsd: true,
  promptExcerpt: true,
  responseExcerpt: true,
  occurredAt: true,
  content: {
    select: {
      fileMetadataJson: true,
      expiresAt: true,
      deletedAt: true,
      promptBlobKey: true,
      responseBlobKey: true,
      fileBlobKey: true,
    },
  },
} satisfies Prisma.AiRequestEventSelect;

const aiHistoryEventDetailSelect = {
  ...aiHistoryEventListSelect,
  userId: true,
  installationId: true,
} satisfies Prisma.AiRequestEventSelect;

const aiHistoryLegacyListSelect = {
  id: true,
  provider: true,
  model: true,
  keySource: true,
  status: true,
  errorCode: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  durationMs: true,
  requestType: true,
  fileMetadataJson: true,
  estimatedCostUsd: true,
  occurredAt: true,
  expiresAt: true,
} satisfies Prisma.AiRequestSelect;

const aiHistoryLegacyDetailSelect = {
  ...aiHistoryLegacyListSelect,
  userId: true,
  installationId: true,
  requestMetadata: true,
} satisfies Prisma.AiRequestSelect;

export type AiHistoryEventListRecord = Prisma.AiRequestEventGetPayload<{ select: typeof aiHistoryEventListSelect }>;
export type AiHistoryEventDetailRecord = Prisma.AiRequestEventGetPayload<{ select: typeof aiHistoryEventDetailSelect }>;
export type AiHistoryLegacyListRecord = Prisma.AiRequestGetPayload<{ select: typeof aiHistoryLegacyListSelect }>;
export type AiHistoryLegacyDetailRecord = Prisma.AiRequestGetPayload<{ select: typeof aiHistoryLegacyDetailSelect }>;

export interface ListHistoryInput {
  userId: string;
  requestType?: string;
  status?: string;
  model?: string;
  provider?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface UpsertEventAndContentInput {
  eventId: string;
  userId: string;
  workspaceId?: string;
  installationId?: string;
  provider: string;
  model: string;
  modelDisplayName?: string;
  requestType: 'text' | 'image' | 'file';
  keySource: string;
  status: string;
  errorCode?: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs?: number;
  promptExcerpt?: string | null;
  responseExcerpt?: string | null;
  occurredAt: Date;
  expiresAt: Date;
  promptBlobKey?: string;
  responseBlobKey?: string;
  fileBlobKey?: string;
  fileMetadataJson?: Prisma.InputJsonValue;
}

export interface AiAnalyticsRow {
  provider: string;
  model: string;
  requestCount: number;
  successCount: number;
  failedCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgDurationMs: number | null;
}

function buildEventWhere(input: Omit<ListHistoryInput, 'limit' | 'offset'>): Prisma.AiRequestEventWhereInput {
  return {
    userId: input.userId,
    ...(input.requestType ? { requestType: input.requestType } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.from || input.to
      ? { occurredAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
      : {}),
  };
}

function buildLegacyWhere(input: Omit<ListHistoryInput, 'limit' | 'offset'>): Prisma.AiRequestWhereInput {
  return {
    userId: input.userId,
    ...(input.requestType ? { requestType: input.requestType } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.from || input.to
      ? { occurredAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
      : {}),
  };
}

@Injectable()
export class AiHistoryRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listEventsForUser(input: ListHistoryInput): Promise<AiHistoryEventListRecord[]> {
    return this.prisma.aiRequestEvent.findMany({
      where: buildEventWhere(input),
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: input.offset,
      take: input.limit,
      select: aiHistoryEventListSelect,
    });
  }

  countEventsForUser(input: Omit<ListHistoryInput, 'limit' | 'offset'>): Promise<number> {
    return this.prisma.aiRequestEvent.count({ where: buildEventWhere(input) });
  }

  listLegacyForUserExcludingEventIds(input: ListHistoryInput, excludedIds: string[]): Promise<AiHistoryLegacyListRecord[]> {
    return this.prisma.aiRequest.findMany({
      where: {
        ...buildLegacyWhere(input),
        ...(excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: 0,
      take: input.limit + input.offset,
      select: aiHistoryLegacyListSelect,
    });
  }

  countLegacyForUserExcludingEventIds(input: Omit<ListHistoryInput, 'limit' | 'offset'>, excludedIds: string[]): Promise<number> {
    return this.prisma.aiRequest.count({
      where: {
        ...buildLegacyWhere(input),
        ...(excludedIds.length > 0 ? { id: { notIn: excludedIds } } : {}),
      },
    });
  }

  getEventDetailForUser(id: string, userId: string): Promise<AiHistoryEventDetailRecord | null> {
    return this.prisma.aiRequestEvent.findFirst({ where: { id, userId }, select: aiHistoryEventDetailSelect });
  }

  getLegacyDetailForUser(id: string, userId: string): Promise<AiHistoryLegacyDetailRecord | null> {
    return this.prisma.aiRequest.findFirst({ where: { id, userId }, select: aiHistoryLegacyDetailSelect });
  }

  async upsertEventContentAndRollup(input: UpsertEventAndContentInput): Promise<void> {
    const day = new Date(Date.UTC(input.occurredAt.getUTCFullYear(), input.occurredAt.getUTCMonth(), input.occurredAt.getUTCDate()));

    await this.prisma.$transaction(async (tx) => {
      await tx.aiRequestEvent.upsert({
        where: { id: input.eventId },
        create: {
          id: input.eventId,
          userId: input.userId,
          workspaceId: input.workspaceId,
          installationId: input.installationId,
          provider: input.provider,
          model: input.model,
          modelDisplayName: input.modelDisplayName,
          requestType: input.requestType,
          keySource: input.keySource,
          status: input.status,
          errorCode: input.errorCode ?? null,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          totalTokens: input.totalTokens,
          estimatedCostUsd: input.estimatedCostUsd,
          durationMs: input.durationMs,
          promptExcerpt: input.promptExcerpt,
          responseExcerpt: input.responseExcerpt,
          occurredAt: input.occurredAt,
        },
        update: {
          workspaceId: input.workspaceId,
          installationId: input.installationId,
          provider: input.provider,
          model: input.model,
          modelDisplayName: input.modelDisplayName,
          requestType: input.requestType,
          keySource: input.keySource,
          status: input.status,
          errorCode: input.errorCode ?? null,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          totalTokens: input.totalTokens,
          estimatedCostUsd: input.estimatedCostUsd,
          durationMs: input.durationMs,
          promptExcerpt: input.promptExcerpt,
          responseExcerpt: input.responseExcerpt,
          occurredAt: input.occurredAt,
        },
      });

      await tx.aiRequestContent.upsert({
        where: { aiRequestEventId: input.eventId },
        create: {
          aiRequestEventId: input.eventId,
          promptBlobKey: input.promptBlobKey,
          responseBlobKey: input.responseBlobKey,
          fileBlobKey: input.fileBlobKey,
          ...(input.fileMetadataJson !== undefined ? { fileMetadataJson: input.fileMetadataJson } : {}),
          expiresAt: input.expiresAt,
          deletedAt: null,
        },
        update: {
          promptBlobKey: input.promptBlobKey,
          responseBlobKey: input.responseBlobKey,
          fileBlobKey: input.fileBlobKey,
          ...(input.fileMetadataJson !== undefined ? { fileMetadataJson: input.fileMetadataJson } : {}),
          expiresAt: input.expiresAt,
          deletedAt: null,
        },
      });

      await tx.aiUsageDailyRollup.upsert({
        where: {
          userId_date_model_requestType_status: {
            userId: input.userId,
            date: day,
            model: input.model,
            requestType: input.requestType,
            status: input.status,
          },
        },
        create: {
          userId: input.userId,
          date: day,
          requestType: input.requestType,
          model: input.model,
          modelDisplayName: input.modelDisplayName,
          status: input.status,
          requestCount: 1,
          successCount: input.status === 'success' ? 1 : 0,
          failedCount: input.status === 'success' ? 0 : 1,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          totalTokens: input.totalTokens,
          estimatedCostUsd: input.estimatedCostUsd,
          totalDurationMs: input.durationMs ?? 0,
        },
        update: {
          modelDisplayName: input.modelDisplayName,
          requestCount: { increment: 1 },
          successCount: { increment: input.status === 'success' ? 1 : 0 },
          failedCount: { increment: input.status === 'success' ? 0 : 1 },
          promptTokens: { increment: input.promptTokens },
          completionTokens: { increment: input.completionTokens },
          totalTokens: { increment: input.totalTokens },
          estimatedCostUsd: { increment: input.estimatedCostUsd },
          totalDurationMs: { increment: input.durationMs ?? 0 },
        },
      });
    });
  }

  async getAnalytics(input: { userId: string; from: Date; to: Date }): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCostUsd: number;
    avgDurationMs: number | null;
    byModel: AiAnalyticsRow[];
  }> {
    const fromDay = new Date(Date.UTC(input.from.getUTCFullYear(), input.from.getUTCMonth(), input.from.getUTCDate()));
    const toDay = new Date(Date.UTC(input.to.getUTCFullYear(), input.to.getUTCMonth(), input.to.getUTCDate()));

    const rollups = await this.prisma.aiUsageDailyRollup.findMany({
      where: { userId: input.userId, date: { gte: fromDay, lte: toDay } },
      select: {
        model: true,
        status: true,
        requestCount: true,
        successCount: true,
        failedCount: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        estimatedCostUsd: true,
        totalDurationMs: true,
      },
    });

    if (rollups.length > 0) {
      const byModelMap = new Map<string, AiAnalyticsRow & { durationMsTotal: number }>();
      let totalRequests = 0;
      let successfulRequests = 0;
      let failedRequests = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let totalTokens = 0;
      let totalCostUsd = 0;
      let durationTotal = 0;

      for (const row of rollups) {
        totalRequests += row.requestCount;
        successfulRequests += row.successCount;
        failedRequests += row.failedCount;
        totalPromptTokens += row.promptTokens;
        totalCompletionTokens += row.completionTokens;
        totalTokens += row.totalTokens;
        totalCostUsd += row.estimatedCostUsd;
        durationTotal += row.totalDurationMs;

        const existing = byModelMap.get(row.model) ?? {
          provider: 'hidden',
          model: row.model,
          requestCount: 0,
          successCount: 0,
          failedCount: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          totalCostUsd: 0,
          avgDurationMs: null,
          durationMsTotal: 0,
        };
        existing.requestCount += row.requestCount;
        existing.successCount += row.successCount;
        existing.failedCount += row.failedCount;
        existing.totalPromptTokens += row.promptTokens;
        existing.totalCompletionTokens += row.completionTokens;
        existing.totalTokens += row.totalTokens;
        existing.totalCostUsd += row.estimatedCostUsd;
        existing.durationMsTotal += row.totalDurationMs;
        existing.avgDurationMs = existing.requestCount > 0 ? existing.durationMsTotal / existing.requestCount : null;
        byModelMap.set(row.model, existing);
      }

      return {
        totalRequests,
        successfulRequests,
        failedRequests,
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens,
        totalCostUsd,
        avgDurationMs: totalRequests > 0 ? durationTotal / totalRequests : null,
        byModel: [...byModelMap.values()].sort((a, b) => b.requestCount - a.requestCount).slice(0, 20),
      };
    }

    // Fallback to event table aggregation when rollups are not available.
    const where: Prisma.AiRequestEventWhereInput = {
      userId: input.userId,
      occurredAt: { gte: input.from, lte: input.to },
    };

    const [aggregates, modelGroups, successCount] = await Promise.all([
      this.prisma.aiRequestEvent.aggregate({
        where,
        _count: { id: true },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, estimatedCostUsd: true, durationMs: true },
      }),
      this.prisma.aiRequestEvent.groupBy({
        by: ['model', 'status'],
        where,
        _count: { id: true },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, estimatedCostUsd: true, durationMs: true },
      }),
      this.prisma.aiRequestEvent.count({ where: { ...where, status: 'success' } }),
    ]);

    const byModelMap = new Map<string, AiAnalyticsRow>();
    for (const row of modelGroups) {
      const existing = byModelMap.get(row.model) ?? {
        provider: 'hidden',
        model: row.model,
        requestCount: 0,
        successCount: 0,
        failedCount: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        avgDurationMs: null,
      };
      existing.requestCount += row._count.id;
      if (row.status === 'success') existing.successCount += row._count.id;
      else existing.failedCount += row._count.id;
      existing.totalPromptTokens += row._sum.promptTokens ?? 0;
      existing.totalCompletionTokens += row._sum.completionTokens ?? 0;
      existing.totalTokens += row._sum.totalTokens ?? 0;
      existing.totalCostUsd += row._sum.estimatedCostUsd ?? 0;
      existing.avgDurationMs = existing.requestCount > 0
        ? ((existing.avgDurationMs ?? 0) * (existing.requestCount - row._count.id) + (row._sum.durationMs ?? 0)) / existing.requestCount
        : null;
      byModelMap.set(row.model, existing);
    }

    const total = aggregates._count.id;
    return {
      totalRequests: total,
      successfulRequests: successCount,
      failedRequests: total - successCount,
      totalPromptTokens: aggregates._sum.promptTokens ?? 0,
      totalCompletionTokens: aggregates._sum.completionTokens ?? 0,
      totalTokens: aggregates._sum.totalTokens ?? 0,
      totalCostUsd: aggregates._sum.estimatedCostUsd ?? 0,
      avgDurationMs: total > 0 ? (aggregates._sum.durationMs ?? 0) / total : null,
      byModel: [...byModelMap.values()].sort((a, b) => b.requestCount - a.requestCount).slice(0, 20),
    };
  }
}
