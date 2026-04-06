import { Inject, Injectable } from '@nestjs/common';
import { type Prisma } from '@quizmind/database';
import {
  type AiAnalyticsModelBreakdown,
  type AiAnalyticsSnapshot,
  type AiHistoryDetail,
  type AiHistoryFileMetadata,
  type AiHistoryListFilters,
  type AiHistoryListItem,
  type AiHistoryListResponse,
  type AiRequestStatus,
  type AiRequestType,
} from '@quizmind/contracts';

import { AiHistoryRepository, type AiHistoryListRecord } from './ai-history.repository';

/** Cost per 1 M tokens in USD – rough blended estimate. */
const COST_PER_M_TOKENS_USD = 2.0;

const HISTORY_RETENTION_DAYS = 7;
const EXCERPT_MAX_LENGTH = 200;
const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 200;

function clampLimit(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIST_LIMIT;
  return Math.min(n, MAX_LIST_LIMIT);
}

function clampOffset(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

function excerptText(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length > EXCERPT_MAX_LENGTH ? trimmed.slice(0, EXCERPT_MAX_LENGTH) + '…' : trimmed;
}

function extractPromptExcerpt(promptContentJson: Prisma.JsonValue | null): string | null {
  if (promptContentJson === null || promptContentJson === undefined) return null;

  try {
    if (typeof promptContentJson === 'string') {
      return excerptText(promptContentJson);
    }

    if (Array.isArray(promptContentJson)) {
      // OpenAI message format: [{role, content}]
      const allText: string[] = [];
      for (const msg of promptContentJson) {
        if (!msg || typeof msg !== 'object') continue;
        const content = (msg as Record<string, unknown>).content;
        if (typeof content === 'string') {
          allText.push(content);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block && typeof block === 'object' && (block as Record<string, unknown>).type === 'text') {
              const t = (block as Record<string, unknown>).text;
              if (typeof t === 'string') allText.push(t);
            }
          }
        }
      }
      return excerptText(allText.join(' '));
    }
  } catch {
    // ignore
  }
  return null;
}

function extractResponseExcerpt(responseContentJson: Prisma.JsonValue | null): string | null {
  if (responseContentJson === null || responseContentJson === undefined) return null;

  try {
    if (typeof responseContentJson === 'string') {
      return excerptText(responseContentJson);
    }

    if (typeof responseContentJson === 'object' && !Array.isArray(responseContentJson)) {
      const obj = responseContentJson as Record<string, unknown>;
      if (Array.isArray(obj.choices)) {
        const firstChoice = obj.choices[0] as Record<string, unknown> | undefined;
        const message = firstChoice?.message as Record<string, unknown> | undefined;
        const content = message?.content;
        if (typeof content === 'string') return excerptText(content);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function parseFileMetadata(fileMetadataJson: Prisma.JsonValue | null): AiHistoryFileMetadata | null {
  if (!fileMetadataJson || typeof fileMetadataJson !== 'object' || Array.isArray(fileMetadataJson)) {
    return null;
  }
  const obj = fileMetadataJson as Record<string, unknown>;
  if (typeof obj.originalName !== 'string') return null;
  return {
    originalName: obj.originalName as string,
    mimeType: (obj.mimeType as string) ?? '',
    sizeBytes: typeof obj.sizeBytes === 'number' ? obj.sizeBytes : 0,
    contentType: obj.contentType === 'image' ? 'image' : 'text',
  };
}

function toListItem(record: AiHistoryListRecord): AiHistoryListItem {
  return {
    id: record.id,
    requestType: (record.requestType ?? 'text') as AiRequestType,
    provider: record.provider,
    model: record.model,
    keySource: record.keySource,
    status: record.status as AiRequestStatus,
    errorCode: record.errorCode,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    totalTokens: record.totalTokens,
    durationMs: record.durationMs,
    promptExcerpt: extractPromptExcerpt(record.promptContentJson),
    responseExcerpt: extractResponseExcerpt(record.responseContentJson),
    fileMetadata: parseFileMetadata(record.fileMetadataJson),
    occurredAt: record.occurredAt.toISOString(),
  };
}

function estimateCostUsd(tokens: number): number {
  return Math.round((tokens / 1_000_000) * COST_PER_M_TOKENS_USD * 10_000) / 10_000;
}

@Injectable()
export class AiHistoryService {
  constructor(
    @Inject(AiHistoryRepository)
    private readonly repository: AiHistoryRepository,
  ) {}

  async listHistory(
    userId: string,
    workspaceId: string | undefined,
    rawFilters: Partial<AiHistoryListFilters>,
  ): Promise<AiHistoryListResponse> {
    const limit = clampLimit(rawFilters.limit);
    const offset = clampOffset(rawFilters.offset);
    const filters: AiHistoryListFilters = {
      limit,
      offset,
      ...(rawFilters.requestType ? { requestType: rawFilters.requestType } : {}),
      ...(rawFilters.status ? { status: rawFilters.status } : {}),
      ...(rawFilters.model ? { model: rawFilters.model } : {}),
      ...(rawFilters.provider ? { provider: rawFilters.provider } : {}),
      ...(rawFilters.from ? { from: rawFilters.from } : {}),
      ...(rawFilters.to ? { to: rawFilters.to } : {}),
    };
    const from = rawFilters.from ? new Date(rawFilters.from) : undefined;
    const to = rawFilters.to ? new Date(rawFilters.to) : undefined;
    const queryInput = {
      userId,
      workspaceId,
      requestType: rawFilters.requestType,
      status: rawFilters.status,
      model: rawFilters.model,
      provider: rawFilters.provider,
      from,
      to,
      limit,
      offset,
    };

    const [records, total] = await Promise.all([
      this.repository.listForUser(queryInput),
      this.repository.countForUser(queryInput),
    ]);

    return {
      items: records.map(toListItem),
      total,
      filters,
    };
  }

  async getDetail(id: string, userId: string): Promise<AiHistoryDetail | null> {
    const record = await this.repository.getDetailForUser(id, userId);
    if (!record) return null;

    const listItem = toListItem(record);
    return {
      ...listItem,
      promptContentJson: record.promptContentJson,
      responseContentJson: record.responseContentJson,
    };
  }

  async getAnalytics(
    userId: string,
    workspaceId: string | undefined,
    from: Date,
    to: Date,
  ): Promise<AiAnalyticsSnapshot> {
    const data = await this.repository.getAnalytics({ userId, workspaceId, from, to });
    const byModel: AiAnalyticsModelBreakdown[] = data.byModel.map((row) => ({
      model: row.model,
      provider: row.provider,
      requestCount: row.requestCount,
      totalTokens: row.totalTokens,
      estimatedCostUsd: estimateCostUsd(row.totalTokens),
    }));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalRequests: data.totalRequests,
      successfulRequests: data.successfulRequests,
      failedRequests: data.failedRequests,
      totalPromptTokens: data.totalPromptTokens,
      totalCompletionTokens: data.totalCompletionTokens,
      totalTokens: data.totalTokens,
      estimatedCostUsd: estimateCostUsd(data.totalTokens),
      avgDurationMs: data.avgDurationMs,
      byModel,
    };
  }

  /**
   * Persists prompt/response content onto the most recently created AiRequest
   * for this userId + requestId. Called after a successful proxy call completes.
   */
  async persistContent(input: {
    userId: string;
    workspaceId?: string;
    installationId?: string | null;
    requestId: string;
    provider: string;
    model: string;
    keySource: string;
    requestType: 'text' | 'image' | 'file';
    promptContentJson: unknown;
    responseContentJson?: unknown;
    fileMetadataJson?: unknown;
  }): Promise<void> {
    const contentExpiresAt = new Date();
    contentExpiresAt.setDate(contentExpiresAt.getDate() + HISTORY_RETENTION_DAYS);

    await this.repository.updateHistoryContent({
      userId: input.userId,
      workspaceId: input.workspaceId,
      installationId: input.installationId,
      requestId: input.requestId,
      provider: input.provider,
      model: input.model,
      keySource: input.keySource,
      requestType: input.requestType,
      promptContentJson: input.promptContentJson as never,
      responseContentJson: input.responseContentJson as never,
      fileMetadataJson: input.fileMetadataJson as never,
      contentExpiresAt,
    });
  }

  async cleanupExpiredContent(): Promise<number> {
    return this.repository.cleanupExpiredContent();
  }
}
