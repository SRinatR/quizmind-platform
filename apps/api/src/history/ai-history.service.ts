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
import { AiHistoryRepository, type AiHistoryListRecord } from './ai-history.repository';

// ─── Constants ────────────────────────────────────────────────────────────────

export const HISTORY_RETENTION_DAYS = 7;
const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 200;
const EXCERPT_MAX = 300;

// ─── Model/provider-aware pricing (USD per 1M tokens) ────────────────────────
// Source: OpenRouter pricing as of 2025. Input/output split where known.
// Falls back to a conservative blended estimate for unknown models.

interface TokenPrice {
  inputPerM: number;
  outputPerM: number;
}

const PRICING: Record<string, TokenPrice> = {
  // OpenAI via OpenRouter
  'openai/gpt-4o':                    { inputPerM: 2.50,  outputPerM: 10.00 },
  'openai/gpt-4o-mini':               { inputPerM: 0.15,  outputPerM: 0.60  },
  'openai/gpt-4-turbo':               { inputPerM: 10.00, outputPerM: 30.00 },
  'openai/gpt-3.5-turbo':             { inputPerM: 0.50,  outputPerM: 1.50  },
  'openai/o1':                        { inputPerM: 15.00, outputPerM: 60.00 },
  'openai/o1-mini':                   { inputPerM: 1.10,  outputPerM: 4.40  },
  'openai/o3-mini':                   { inputPerM: 1.10,  outputPerM: 4.40  },
  // Anthropic via OpenRouter
  'anthropic/claude-3.5-sonnet':      { inputPerM: 3.00,  outputPerM: 15.00 },
  'anthropic/claude-3.5-haiku':       { inputPerM: 0.80,  outputPerM: 4.00  },
  'anthropic/claude-3-opus':          { inputPerM: 15.00, outputPerM: 75.00 },
  'anthropic/claude-3-sonnet':        { inputPerM: 3.00,  outputPerM: 15.00 },
  'anthropic/claude-3-haiku':         { inputPerM: 0.25,  outputPerM: 1.25  },
  // Google
  'google/gemini-pro-1.5':            { inputPerM: 1.25,  outputPerM: 5.00  },
  'google/gemini-flash-1.5':          { inputPerM: 0.075, outputPerM: 0.30  },
  'google/gemini-2.0-flash-001':      { inputPerM: 0.10,  outputPerM: 0.40  },
  // Meta
  'meta-llama/llama-3.1-8b-instruct': { inputPerM: 0.06,  outputPerM: 0.06  },
  'meta-llama/llama-3.1-70b-instruct':{ inputPerM: 0.59,  outputPerM: 0.79  },
  // Mistral
  'mistralai/mistral-7b-instruct':    { inputPerM: 0.07,  outputPerM: 0.07  },
  'mistralai/mixtral-8x7b-instruct':  { inputPerM: 0.24,  outputPerM: 0.24  },
};

const FALLBACK_PRICE: TokenPrice = { inputPerM: 2.00, outputPerM: 8.00 };

export function estimateRequestCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  // Normalise: OpenRouter often uses "provider/model:variant" — strip the variant.
  const normModel = model.split(':')[0]!.toLowerCase();
  const price = PRICING[normModel] ?? FALLBACK_PRICE;
  const cost = (promptTokens / 1_000_000) * price.inputPerM
             + (completionTokens / 1_000_000) * price.outputPerM;
  return Math.round(cost * 1_000_000) / 1_000_000; // round to 6dp
}

/** Extract actual cost from an OpenRouter usage object if present. */
export function extractProviderCostUsd(response: unknown): number | null {
  if (!response || typeof response !== 'object') return null;
  const obj = response as Record<string, unknown>;
  // OpenRouter: usage.cost (in USD)
  const usage = obj['usage'];
  if (usage && typeof usage === 'object') {
    const u = usage as Record<string, unknown>;
    if (typeof u['cost'] === 'number' && Number.isFinite(u['cost'])) {
      return u['cost'];
    }
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        else if (Array.isArray(c)) {
          for (const blk of c as Array<Record<string, unknown>>) {
            if (blk['type'] === 'text' && typeof blk['text'] === 'string') parts.push(blk['text']);
          }
        }
      }
      return excerptText(parts.join(' '));
    }
  } catch { /* ignore */ }
  return null;
}

function extractResponseExcerpt(responseContent: unknown): string | null {
  if (!responseContent) return null;
  try {
    const obj = responseContent as Record<string, unknown>;
    const choices = obj['choices'];
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown> | undefined;
      const msg = first?.['message'] as Record<string, unknown> | undefined;
      const text = msg?.['content'];
      if (typeof text === 'string') return excerptText(text);
    }
  } catch { /* ignore */ }
  return null;
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

function toListItem(record: AiHistoryListRecord, promptExcerpt: string | null = null, responseExcerpt: string | null = null): AiHistoryListItem {
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
    promptExcerpt,
    responseExcerpt,
    fileMetadata: parseFileMetadata(record.fileMetadataJson),
    occurredAt: record.occurredAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiHistoryService {
  constructor(
    @Inject(AiHistoryRepository) private readonly repository: AiHistoryRepository,
    @Inject(HistoryBlobService) private readonly blobs: HistoryBlobService,
  ) {}

  async listHistory(
    userId: string,
    rawFilters: Partial<AiHistoryListFilters>,
  ): Promise<AiHistoryListResponse> {
    const limit = clampLimit(rawFilters.limit);
    const offset = clampOffset(rawFilters.offset);
    const filters: AiHistoryListFilters = {
      limit, offset,
      ...(rawFilters.requestType ? { requestType: rawFilters.requestType } : {}),
      ...(rawFilters.status     ? { status: rawFilters.status }           : {}),
      ...(rawFilters.model      ? { model: rawFilters.model }             : {}),
      ...(rawFilters.provider   ? { provider: rawFilters.provider }       : {}),
      ...(rawFilters.from       ? { from: rawFilters.from }               : {}),
      ...(rawFilters.to         ? { to: rawFilters.to }                   : {}),
    };
    const queryInput = {
      userId,
      requestType: rawFilters.requestType,
      status: rawFilters.status,
      model: rawFilters.model,
      provider: rawFilters.provider,
      from: rawFilters.from ? new Date(rawFilters.from) : undefined,
      to:   rawFilters.to   ? new Date(rawFilters.to)   : undefined,
      limit, offset,
    };

    const [records, total] = await Promise.all([
      this.repository.listForUser(queryInput),
      this.repository.countForUser(queryInput),
    ]);

    // Eagerly load excerpts for list items (reads blob files).
    const items = await Promise.all(records.map(async (rec) => {
      const [prompt, response] = await Promise.all([
        this.blobs.readPrompt(rec.id),
        this.blobs.readResponse(rec.id),
      ]);
      return toListItem(rec, extractPromptExcerpt(prompt), extractResponseExcerpt(response));
    }));

    return { items, total, filters };
  }

  async getDetail(id: string, userId: string): Promise<AiHistoryDetail | null> {
    const record = await this.repository.getDetailForUser(id, userId);
    if (!record) return null;

    const [promptContent, responseContent] = await Promise.all([
      this.blobs.readPrompt(id),
      this.blobs.readResponse(id),
    ]);

    const listItem = toListItem(
      record,
      extractPromptExcerpt(promptContent),
      extractResponseExcerpt(responseContent),
    );

    return {
      ...listItem,
      promptContentJson: promptContent,
      responseContentJson: responseContent,
    };
  }

  async getAnalytics(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<AiAnalyticsSnapshot> {
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

  /**
   * Persist blob content + set metadata on the AiRequest row.
   * Called fire-and-forget after both successful and failed proxy calls.
   */
  async persistContent(input: {
    requestId: string;        // matches requestMetadata.requestId on the AiRequest row
    aiRequestId?: string;     // direct id of the AiRequest row (preferred for blob key)
    userId: string;
    provider: string;
    model: string;
    requestType: 'text' | 'image' | 'file';
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
  }): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + HISTORY_RETENTION_DAYS);

    const cost = extractProviderCostUsd(input.responseContent)
      ?? estimateRequestCostUsd(
           input.model,
           input.promptTokens ?? 0,
           input.completionTokens ?? 0,
         );

    // Find the AiRequest row id so blobs can use it as a stable key.
    const ids = await this.repository.findIdsByRequestId(input.userId, input.requestId);
    const rowId = ids[0] ?? input.requestId; // fallback to requestId if row not yet visible

    // Write blobs (parallel).
    await Promise.all([
      this.blobs.writePrompt(rowId, input.promptContent),
      ...(input.responseContent !== undefined ? [this.blobs.writeResponse(rowId, input.responseContent)] : []),
      ...(input.fileBuffer !== undefined ? [this.blobs.writeFileContent(rowId, input.fileBuffer)] : []),
    ]);

    // Update metadata row.
    await this.repository.setHistoryMeta({
      userId: input.userId,
      requestId: input.requestId,
      requestType: input.requestType,
      estimatedCostUsd: cost,
      ...(input.fileMetadata ? { fileMetadataJson: input.fileMetadata as Prisma.InputJsonValue } : {}),
      expiresAt,
    });
  }

  async cleanupExpired(): Promise<number> {
    const BATCH = 200;
    let total = 0;

    while (true) {
      const ids = await this.repository.findExpiredBatch(BATCH);
      if (ids.length === 0) break;

      // Delete blobs first, then rows (safe: worst case blobs outlive rows briefly).
      await Promise.all(ids.map((id) => this.blobs.deleteAllForRequest(id)));
      const deleted = await this.repository.deleteByIds(ids);
      total += deleted;

      if (ids.length < BATCH) break;
    }

    return total;
  }
}
