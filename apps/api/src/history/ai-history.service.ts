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
  resolveModelDisplayName,
} from '@quizmind/contracts';
import { providerModelCatalog } from '@quizmind/providers';

import { HistoryBlobService } from './history-blob.service';
import {
  AiHistoryRepository,
  type AiHistoryEventListRecord,
  type AiHistoryLegacyListRecord,
} from './ai-history.repository';

export const HISTORY_RETENTION_DAYS = 7;
const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 200;
const EXCERPT_MAX = 300;
const CONTENT_EXPIRED_MESSAGE = 'Full content expired after the retention window.';

interface TokenPrice {
  inputPerM: number;
  outputPerM: number;
}

const PRICING: Record<string, TokenPrice> = {
  'openai/gpt-4o':                    { inputPerM: 2.50,  outputPerM: 10.00 },
  'openai/gpt-4o-mini':               { inputPerM: 0.15,  outputPerM: 0.60  },
  'openai/gpt-4-turbo':               { inputPerM: 10.00, outputPerM: 30.00 },
  'openai/gpt-3.5-turbo':             { inputPerM: 0.50,  outputPerM: 1.50  },
  'openai/o1':                        { inputPerM: 15.00, outputPerM: 60.00 },
  'openai/o1-mini':                   { inputPerM: 1.10,  outputPerM: 4.40  },
  'openai/o3-mini':                   { inputPerM: 1.10,  outputPerM: 4.40  },
  'anthropic/claude-3.5-sonnet':      { inputPerM: 3.00,  outputPerM: 15.00 },
  'anthropic/claude-3.5-haiku':       { inputPerM: 0.80,  outputPerM: 4.00  },
  'anthropic/claude-3-opus':          { inputPerM: 15.00, outputPerM: 75.00 },
  'anthropic/claude-3-sonnet':        { inputPerM: 3.00,  outputPerM: 15.00 },
  'anthropic/claude-3-haiku':         { inputPerM: 0.25,  outputPerM: 1.25  },
  'google/gemini-pro-1.5':            { inputPerM: 1.25,  outputPerM: 5.00  },
  'google/gemini-flash-1.5':          { inputPerM: 0.075, outputPerM: 0.30  },
  'google/gemini-2.0-flash-001':      { inputPerM: 0.10,  outputPerM: 0.40  },
  'meta-llama/llama-3.1-8b-instruct': { inputPerM: 0.06,  outputPerM: 0.06  },
  'meta-llama/llama-3.1-70b-instruct':{ inputPerM: 0.59,  outputPerM: 0.79  },
  'mistralai/mistral-7b-instruct':    { inputPerM: 0.07,  outputPerM: 0.07  },
  'mistralai/mixtral-8x7b-instruct':  { inputPerM: 0.24,  outputPerM: 0.24  },
};

const FALLBACK_PRICE: TokenPrice = { inputPerM: 2.00, outputPerM: 8.00 };

export function estimateRequestCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const normModel = model.split(':')[0]!.toLowerCase();
  const price = PRICING[normModel] ?? FALLBACK_PRICE;
  const cost = (promptTokens / 1_000_000) * price.inputPerM + (completionTokens / 1_000_000) * price.outputPerM;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function extractProviderCostUsd(response: unknown): number | null {
  if (!response || typeof response !== 'object') return null;
  const usage = (response as Record<string, unknown>)['usage'];
  if (usage && typeof usage === 'object') {
    const cost = (usage as Record<string, unknown>)['cost'];
    if (typeof cost === 'number' && Number.isFinite(cost)) return cost;
  }
  return null;
}

function clampLimit(v: unknown): number {
  const n = Number(v);
  return !Number.isFinite(n) || n < 1 ? DEFAULT_LIST_LIMIT : Math.min(n, MAX_LIST_LIMIT);
}

function clampOffset(v: unknown): number {
  const n = Number(v);
  return !Number.isFinite(n) || n < 0 ? 0 : Math.trunc(n);
}

function excerptText(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length > EXCERPT_MAX ? t.slice(0, EXCERPT_MAX) + '…' : t;
}

function extractPromptExcerpt(promptContent: unknown): string | null {
  if (!promptContent) return null;
  try {
    if (typeof promptContent === 'string') return excerptText(promptContent);
    if (Array.isArray(promptContent)) {
      const parts: string[] = [];
      for (const msg of promptContent as Array<Record<string, unknown>>) {
        const c = msg['content'];
        if (typeof c === 'string') parts.push(c);
      }
      return excerptText(parts.join(' '));
    }
  } catch {
    return null;
  }
  return null;
}

function extractResponseExcerpt(responseContent: unknown): string | null {
  if (!responseContent || typeof responseContent !== 'object') return null;
  const choices = (responseContent as Record<string, unknown>)['choices'];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as Record<string, unknown>;
  const message = first['message'] as Record<string, unknown> | undefined;
  return typeof message?.content === 'string' ? excerptText(message.content) : null;
}

function parseFileMetadata(v: Prisma.JsonValue | null): AiHistoryFileMetadata | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o['originalName'] !== 'string') return null;
  return {
    originalName: o['originalName'] as string,
    mimeType: String(o['mimeType'] ?? ''),
    sizeBytes: typeof o['sizeBytes'] === 'number' ? o['sizeBytes'] : 0,
    contentType: o['contentType'] === 'image' ? 'image' : 'text',
  };
}

function toListItemFromEvent(record: AiHistoryEventListRecord): AiHistoryListItem {
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
    estimatedCostUsd: record.estimatedCostUsd ?? 0,
    promptExcerpt: record.promptExcerpt,
    responseExcerpt: record.responseExcerpt,
    fileMetadata: parseFileMetadata(record.content?.fileMetadataJson ?? null),
    occurredAt: record.occurredAt.toISOString(),
    expiresAt: record.content?.expiresAt?.toISOString() ?? null,
  };
}

function toListItemFromLegacy(record: AiHistoryLegacyListRecord): AiHistoryListItem {
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
    estimatedCostUsd: record.estimatedCostUsd ?? 0,
    fileMetadata: parseFileMetadata(record.fileMetadataJson),
    occurredAt: record.occurredAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
  };
}

@Injectable()
export class AiHistoryService {
  constructor(
    @Inject(AiHistoryRepository) private readonly repository: AiHistoryRepository,
    @Inject(HistoryBlobService) private readonly blobs: HistoryBlobService,
  ) {}

  async listHistory(userId: string, rawFilters: Partial<AiHistoryListFilters>): Promise<AiHistoryListResponse> {
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

    const queryInput = {
      userId,
      requestType: rawFilters.requestType,
      status: rawFilters.status,
      model: rawFilters.model,
      provider: rawFilters.provider,
      from: rawFilters.from ? new Date(rawFilters.from) : undefined,
      to: rawFilters.to ? new Date(rawFilters.to) : undefined,
      limit,
      offset,
    };

    const [eventRecords, eventTotal] = await Promise.all([
      this.repository.listEventsForUser(queryInput),
      this.repository.countEventsForUser(queryInput),
    ]);

    const eventItems = eventRecords.map(toListItemFromEvent);

    if (eventItems.length >= limit) {
      return { items: eventItems, total: eventTotal, filters };
    }

    const excludedEventIds = eventRecords.map((row) => row.id);
    const [legacyRecords, legacyCount] = await Promise.all([
      this.repository.listLegacyForUserExcludingEventIds(queryInput, excludedEventIds),
      this.repository.countLegacyForUserExcludingEventIds(queryInput, excludedEventIds),
    ]);

    const legacyItems = await Promise.all(legacyRecords.map(async (row) => {
      const [promptContent, responseContent] = await Promise.all([
        this.blobs.readPrompt(row.id),
        this.blobs.readResponse(row.id),
      ]);
      return {
        ...toListItemFromLegacy(row),
        promptExcerpt: extractPromptExcerpt(promptContent),
        responseExcerpt: extractResponseExcerpt(responseContent),
      };
    }));

    const combined = [...eventItems, ...legacyItems]
      .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
      .slice(offset, offset + limit);

    return {
      items: combined,
      total: eventTotal + legacyCount,
      filters,
    };
  }

  async getDetail(id: string, userId: string): Promise<AiHistoryDetail | null> {
    const event = await this.repository.getEventDetailForUser(id, userId);
    if (event) {
      const listItem = toListItemFromEvent(event);
      const content = event.content;
      if (!content || content.deletedAt || content.expiresAt < new Date()) {
        return {
          ...listItem,
          promptContentJson: CONTENT_EXPIRED_MESSAGE,
          responseContentJson: CONTENT_EXPIRED_MESSAGE,
        };
      }

      const [promptContent, responseContent] = await Promise.all([
        content.promptBlobKey ? this.blobs.readJson(content.promptBlobKey) : Promise.resolve(null),
        content.responseBlobKey ? this.blobs.readJson(content.responseBlobKey) : Promise.resolve(null),
      ]);

      return {
        ...listItem,
        promptContentJson: promptContent ?? CONTENT_EXPIRED_MESSAGE,
        responseContentJson: responseContent ?? CONTENT_EXPIRED_MESSAGE,
      };
    }

    const legacy = await this.repository.getLegacyDetailForUser(id, userId);
    if (!legacy) return null;

    const [promptContent, responseContent] = await Promise.all([
      this.blobs.readPrompt(id),
      this.blobs.readResponse(id),
    ]);

    const listItem = toListItemFromLegacy(legacy);
    return {
      ...listItem,
      promptExcerpt: extractPromptExcerpt(promptContent),
      responseExcerpt: extractResponseExcerpt(responseContent),
      promptContentJson: promptContent,
      responseContentJson: responseContent,
    };
  }

  async getAnalytics(userId: string, from: Date, to: Date): Promise<AiAnalyticsSnapshot> {
    const data = await this.repository.getAnalytics({ userId, from, to });

    const byModel: AiAnalyticsModelBreakdown[] = data.byModel.map((row) => ({
      model: row.model,
      provider: row.provider,
      displayName: resolveModelDisplayName(row.model, providerModelCatalog),
      requestCount: row.requestCount,
      successCount: row.successCount,
      failedCount: row.failedCount,
      totalPromptTokens: row.totalPromptTokens,
      totalCompletionTokens: row.totalCompletionTokens,
      totalTokens: row.totalTokens,
      estimatedCostUsd: Math.round(row.totalCostUsd * 1_000_000) / 1_000_000,
      avgDurationMs: row.avgDurationMs,
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
      estimatedCostUsd: Math.round(data.totalCostUsd * 1_000_000) / 1_000_000,
      avgDurationMs: data.avgDurationMs,
      byModel,
    };
  }

  async persistContent(input: {
    requestId: string;
    aiRequestId?: string;
    userId: string;
    workspaceId?: string;
    installationId?: string;
    provider: string;
    model: string;
    requestType: 'text' | 'image' | 'file';
    keySource?: 'platform' | 'user';
    status?: 'success' | 'error' | 'quota_exceeded';
    errorCode?: string;
    occurredAt?: Date;
    promptContent: unknown;
    responseContent?: unknown;
    fileBuffer?: Buffer;
    fileMetadata?: {
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      contentType: 'text' | 'image';
    };
    promptTokens?: number;
    completionTokens?: number;
    durationMs?: number;
  }): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + HISTORY_RETENTION_DAYS);

    const eventId = input.aiRequestId ?? input.requestId;
    const promptKey = await this.blobs.writePrompt(eventId, input.promptContent);
    const responseKey = input.responseContent !== undefined ? await this.blobs.writeResponse(eventId, input.responseContent) : undefined;
    const fileKey = input.fileBuffer ? await this.blobs.writeFileContent(eventId, input.fileBuffer) : undefined;

    const promptExcerpt = extractPromptExcerpt(input.promptContent);
    const responseExcerpt = extractResponseExcerpt(input.responseContent);

    const cost = extractProviderCostUsd(input.responseContent)
      ?? estimateRequestCostUsd(input.model, input.promptTokens ?? 0, input.completionTokens ?? 0);

    await this.repository.upsertEventContentAndRollup({
      eventId,
      userId: input.userId,
      workspaceId: input.workspaceId,
      installationId: input.installationId,
      provider: input.provider,
      model: input.model,
      modelDisplayName: resolveModelDisplayName(input.model, providerModelCatalog),
      requestType: input.requestType,
      keySource: input.keySource ?? 'platform',
      status: input.status ?? 'success',
      errorCode: input.errorCode ?? null,
      promptTokens: input.promptTokens ?? 0,
      completionTokens: input.completionTokens ?? 0,
      totalTokens: (input.promptTokens ?? 0) + (input.completionTokens ?? 0),
      estimatedCostUsd: cost,
      durationMs: input.durationMs,
      promptExcerpt,
      responseExcerpt,
      occurredAt: input.occurredAt ?? new Date(),
      expiresAt,
      promptBlobKey: promptKey,
      responseBlobKey: responseKey,
      fileBlobKey: fileKey,
      ...(input.fileMetadata ? { fileMetadataJson: input.fileMetadata as Prisma.InputJsonValue } : {}),
    });
  }
}
