import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const aiHistorySelect = {
  id: true,
  userId: true,
  workspaceId: true,
  installationId: true,
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
  promptContentJson: true,
  responseContentJson: true,
  fileMetadataJson: true,
  contentExpiresAt: true,
  occurredAt: true,
} satisfies Prisma.AiRequestSelect;

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
  promptContentJson: true,
  responseContentJson: true,
  fileMetadataJson: true,
  occurredAt: true,
} satisfies Prisma.AiRequestSelect;

export type AiHistoryRecord = Prisma.AiRequestGetPayload<{
  select: typeof aiHistorySelect;
}>;

export type AiHistoryListRecord = Prisma.AiRequestGetPayload<{
  select: typeof aiHistoryListSelect;
}>;

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

export interface PersistHistoryInput {
  userId: string;
  workspaceId?: string;
  installationId?: string | null;
  requestId: string;
  provider: string;
  model: string;
  keySource: string;
  requestType: 'text' | 'image' | 'file';
  promptContentJson: Prisma.InputJsonValue;
  responseContentJson?: Prisma.InputJsonValue;
  fileMetadataJson?: Prisma.InputJsonValue;
  contentExpiresAt: Date;
}

export interface AiAnalyticsRow {
  provider: string;
  model: string;
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
}

@Injectable()
export class AiHistoryRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForUser(input: ListHistoryInput): Promise<AiHistoryListRecord[]> {
    const where: Prisma.AiRequestWhereInput = {
      userId: input.userId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.requestType ? { requestType: input.requestType } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.from || input.to
        ? {
            occurredAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    };

    return this.prisma.aiRequest.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: input.offset,
      take: input.limit,
      select: aiHistoryListSelect,
    });
  }

  async countForUser(input: Omit<ListHistoryInput, 'limit' | 'offset'>): Promise<number> {
    const where: Prisma.AiRequestWhereInput = {
      userId: input.userId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.requestType ? { requestType: input.requestType } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.from || input.to
        ? {
            occurredAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    };

    return this.prisma.aiRequest.count({ where });
  }

  async getDetailForUser(id: string, userId: string): Promise<AiHistoryRecord | null> {
    return this.prisma.aiRequest.findFirst({
      where: { id, userId },
      select: aiHistorySelect,
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
    avgDurationMs: number | null;
    byModel: AiAnalyticsRow[];
  }> {
    const where: Prisma.AiRequestWhereInput = {
      userId: input.userId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      occurredAt: { gte: input.from, lte: input.to },
    };

    const [aggregates, modelGroups] = await Promise.all([
      this.prisma.aiRequest.aggregate({
        where,
        _count: { id: true },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
        _avg: { durationMs: true },
      }),
      this.prisma.aiRequest.groupBy({
        by: ['provider', 'model'],
        where,
        _count: { id: true },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
        orderBy: { _count: { id: 'desc' } },
        take: 20,
      }),
    ]);

    const successCount = await this.prisma.aiRequest.count({
      where: { ...where, status: 'success' },
    });

    return {
      totalRequests: aggregates._count.id,
      successfulRequests: successCount,
      failedRequests: aggregates._count.id - successCount,
      totalPromptTokens: aggregates._sum.promptTokens ?? 0,
      totalCompletionTokens: aggregates._sum.completionTokens ?? 0,
      totalTokens: aggregates._sum.totalTokens ?? 0,
      avgDurationMs: aggregates._avg.durationMs ?? null,
      byModel: modelGroups.map((row) => ({
        provider: row.provider,
        model: row.model,
        requestCount: row._count.id,
        totalPromptTokens: row._sum.promptTokens ?? 0,
        totalCompletionTokens: row._sum.completionTokens ?? 0,
        totalTokens: row._sum.totalTokens ?? 0,
        avgDurationMs: null,
      })),
    };
  }

  async updateHistoryContent(input: PersistHistoryInput): Promise<void> {
    await this.prisma.aiRequest.updateMany({
      where: {
        userId: input.userId,
        requestMetadata: {
          path: ['requestId'],
          equals: input.requestId,
        },
      },
      data: {
        requestType: input.requestType,
        promptContentJson: input.promptContentJson,
        ...(input.responseContentJson !== undefined
          ? { responseContentJson: input.responseContentJson }
          : {}),
        ...(input.fileMetadataJson !== undefined
          ? { fileMetadataJson: input.fileMetadataJson }
          : {}),
        contentExpiresAt: input.contentExpiresAt,
      },
    });
  }

  async cleanupExpiredContent(batchSize = 500): Promise<number> {
    const now = new Date();

    const expiredIds = await this.prisma.aiRequest.findMany({
      where: {
        contentExpiresAt: { lt: now },
        OR: [
          { promptContentJson: { not: Prisma.DbNull } },
          { responseContentJson: { not: Prisma.DbNull } },
          { fileMetadataJson: { not: Prisma.DbNull } },
        ],
      },
      select: { id: true },
      take: batchSize,
    });

    if (expiredIds.length === 0) return 0;

    const ids = expiredIds.map((r) => r.id);

    await this.prisma.aiRequest.updateMany({
      where: { id: { in: ids } },
      data: {
        promptContentJson: Prisma.JsonNull,
        responseContentJson: Prisma.JsonNull,
        fileMetadataJson: Prisma.JsonNull,
        contentExpiresAt: null,
      },
    });

    return ids.length;
  }
}
