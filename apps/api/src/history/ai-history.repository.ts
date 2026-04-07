import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

// ─── Selects ─────────────────────────────────────────────────────────────────

const aiHistoryListSelect = {
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

const aiHistoryDetailSelect = {
  ...aiHistoryListSelect,
  userId: true,
  workspaceId: true,
  installationId: true,
  requestMetadata: true,
} satisfies Prisma.AiRequestSelect;

const aiHistoryCleanupSelect = {
  id: true,
} satisfies Prisma.AiRequestSelect;

export type AiHistoryListRecord = Prisma.AiRequestGetPayload<{
  select: typeof aiHistoryListSelect;
}>;

export type AiHistoryDetailRecord = Prisma.AiRequestGetPayload<{
  select: typeof aiHistoryDetailSelect;
}>;

// ─── Input types ─────────────────────────────────────────────────────────────

export interface ListHistoryInput {
  userId: string;
  workspaceId?: string;
  requestType?: string;
  status?: string;
  model?: string;
  provider?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface SetHistoryMetaInput {
  /** AiRequest id to update (found via requestMetadata.requestId JSON path). */
  userId: string;
  requestId: string;
  requestType: 'text' | 'image' | 'file';
  estimatedCostUsd: number;
  fileMetadataJson?: Prisma.InputJsonValue;
  expiresAt: Date;
}

export interface AiAnalyticsRow {
  provider: string;
  model: string;
  requestCount: number;
  successCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgDurationMs: number | null;
}

// ─── Repository ──────────────────────────────────────────────────────────────

function buildWhere(input: Omit<ListHistoryInput, 'limit' | 'offset'>): Prisma.AiRequestWhereInput {
  return {
    userId: input.userId,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
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

  listForUser(input: ListHistoryInput): Promise<AiHistoryListRecord[]> {
    return this.prisma.aiRequest.findMany({
      where: buildWhere(input),
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: input.offset,
      take: input.limit,
      select: aiHistoryListSelect,
    });
  }

  countForUser(input: Omit<ListHistoryInput, 'limit' | 'offset'>): Promise<number> {
    return this.prisma.aiRequest.count({ where: buildWhere(input) });
  }

  getDetailForUser(id: string, userId: string): Promise<AiHistoryDetailRecord | null> {
    return this.prisma.aiRequest.findFirst({
      where: { id, userId },
      select: aiHistoryDetailSelect,
    });
  }

  /** Set requestType, cost, fileMetadata and expiresAt on the AiRequest row that
   *  was just created by the proxy for this requestId. */
  async setHistoryMeta(input: SetHistoryMetaInput): Promise<void> {
    await this.prisma.aiRequest.updateMany({
      where: {
        userId: input.userId,
        requestMetadata: { path: ['requestId'], equals: input.requestId },
      },
      data: {
        requestType: input.requestType,
        estimatedCostUsd: input.estimatedCostUsd,
        ...(input.fileMetadataJson !== undefined ? { fileMetadataJson: input.fileMetadataJson } : {}),
        expiresAt: input.expiresAt,
      },
    });
  }

  async getAnalytics(input: {
    userId: string;
    workspaceId?: string;
    from: Date;
    to: Date;
  }): Promise<{
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
    const where: Prisma.AiRequestWhereInput = {
      userId: input.userId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      occurredAt: { gte: input.from, lte: input.to },
    };

    const [aggregates, modelGroups, successCount] = await Promise.all([
      this.prisma.aiRequest.aggregate({
        where,
        _count: { id: true },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, estimatedCostUsd: true },
        _avg: { durationMs: true },
      }),
      this.prisma.aiRequest.groupBy({
        by: ['provider', 'model', 'status'],
        where,
        _count: { id: true },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, estimatedCostUsd: true },
        _avg: { durationMs: true },
        orderBy: { _count: { id: 'desc' } },
        take: 30,
      }),
      this.prisma.aiRequest.count({ where: { ...where, status: 'success' } }),
    ]);

    // Collapse model groups across success/error for the breakdown.
    const byModelMap = new Map<string, AiAnalyticsRow>();
    for (const row of modelGroups) {
      const key = `${row.provider}::${row.model}`;
      const existing = byModelMap.get(key) ?? {
        provider: row.provider,
        model: row.model,
        requestCount: 0,
        successCount: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        avgDurationMs: null,
      };
      existing.requestCount += row._count.id;
      if (row.status === 'success') existing.successCount += row._count.id;
      existing.totalPromptTokens += row._sum.promptTokens ?? 0;
      existing.totalCompletionTokens += row._sum.completionTokens ?? 0;
      existing.totalTokens += row._sum.totalTokens ?? 0;
      existing.totalCostUsd += row._sum.estimatedCostUsd ?? 0;
      byModelMap.set(key, existing);
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
      avgDurationMs: aggregates._avg.durationMs ?? null,
      byModel: [...byModelMap.values()].sort((a, b) => b.requestCount - a.requestCount).slice(0, 20),
    };
  }

  /** Find AiRequest ids whose requestMetadata.requestId matches the given requestId. */
  async findIdsByRequestId(userId: string, requestId: string): Promise<string[]> {
    const rows = await this.prisma.aiRequest.findMany({
      where: {
        userId,
        requestMetadata: { path: ['requestId'], equals: requestId },
      },
      select: { id: true },
      take: 2,
    });
    return rows.map((r) => r.id);
  }

  /** Returns expired records (id only) for cleanup. */
  async findExpiredBatch(batchSize: number): Promise<string[]> {
    const rows = await this.prisma.aiRequest.findMany({
      where: { expiresAt: { lt: new Date() } },
      select: aiHistoryCleanupSelect,
      take: batchSize,
      orderBy: { expiresAt: 'asc' },
    });
    return rows.map((r) => r.id);
  }

  /** Hard-delete expired rows by id. */
  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.prisma.aiRequest.deleteMany({ where: { id: { in: ids } } });
    return result.count;
  }
}
