import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { type Prisma } from '@quizmind/database';
import {
  type AiAnalyticsModelBreakdown,
  type AiAnalyticsSnapshot,
  type AiHistoryAttachment,
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
import { AdminLogAiSyncService } from '../logs/admin-log-ai-sync.service';

export const HISTORY_RETENTION_DAYS = 7;
const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 200;
const EXCERPT_MAX = 300;
const CONTENT_EXPIRED_MESSAGE = 'Full content expired after the retention window.';
const MAX_PROMPT_IMAGE_ATTACHMENTS = 8;
const MAX_PROMPT_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_PROMPT_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface TokenPrice {
  inputPerM: number;
  outputPerM: number;
}

interface PersistablePromptAttachment {
  id: string;
  role: 'prompt' | 'response';
  kind: 'image' | 'file';
  mimeType: string;
  originalName?: string;
  sizeBytes: number;
  blobKey: string;
  expiresAt: Date;
  deletedAt?: Date | null;
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
        if (typeof c === 'string') {
          parts.push(c);
          continue;
        }
        if (Array.isArray(c)) {
          for (const block of c as Array<Record<string, unknown>>) {
            if (block['type'] === 'text' && typeof block['text'] === 'string') {
              parts.push(block['text']);
            }
          }
        }
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

function parseDataUrl(input: string): { mimeType: string; buffer: Buffer } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(input);
  if (!match) return null;
  try {
    return {
      mimeType: match[1]?.trim().toLowerCase() ?? 'application/octet-stream',
      buffer: Buffer.from(match[2] ?? '', 'base64'),
    };
  } catch {
    return null;
  }
}

function estimateDataUrlDecodedBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const base64Payload = dataUrl.slice(comma + 1).trim();
  const sanitized = base64Payload.replace(/[\r\n\s]/g, '');
  const padding = sanitized.endsWith('==') ? 2 : sanitized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((sanitized.length * 3) / 4) - padding);
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'bin';
}


function toAttachmentMetadata(detail: {
  id: string;
  role: string;
  kind: string;
  mimeType: string;
  originalName: string | null;
  sizeBytes: number;
  deletedAt: Date | null;
  expiresAt: Date;
}): AiHistoryAttachment {
  const isDeleted = Boolean(detail.deletedAt);
  const isExpired = isDeleted || detail.expiresAt < new Date();
  return {
    id: detail.id,
    role: detail.role === 'response' ? 'response' : 'prompt',
    kind: detail.kind === 'file' ? 'file' : 'image',
    mimeType: detail.mimeType,
    originalName: detail.originalName,
    sizeBytes: detail.sizeBytes,
    deleted: isDeleted,
    expired: isExpired,
  };
}

function toListItemFromEvent(record: AiHistoryEventListRecord, promptContentJson?: unknown): AiHistoryListItem {
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
    promptContentJson,
    promptExcerpt: record.promptExcerpt,
    responseExcerpt: record.responseExcerpt,
    fileMetadata: parseFileMetadata(record.content?.fileMetadataJson ?? null),
    attachments: (record.attachments ?? []).map((attachment) => toAttachmentMetadata(attachment)),
    occurredAt: record.occurredAt.toISOString(),
    expiresAt: record.content?.expiresAt?.toISOString() ?? null,
  };
}

function toListItemFromLegacy(record: AiHistoryLegacyListRecord, promptContentJson?: unknown): AiHistoryListItem {
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
    promptContentJson,
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
    @Inject(AdminLogAiSyncService) private readonly adminLogAiSync: AdminLogAiSyncService,
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

    if (eventTotal > 0) {
      const eventItems = await Promise.all(eventRecords.map(async (record) => {
        const content = record.content;
        if (!content || content.deletedAt || content.expiresAt < new Date() || !content.promptBlobKey) {
          return toListItemFromEvent(record);
        }
        const promptContentJson = await this.blobs.readJson(content.promptBlobKey);
        return toListItemFromEvent(record, promptContentJson);
      }));
      return { items: eventItems, total: eventTotal, filters };
    }

    const [legacyRecords, legacyCount] = await Promise.all([
      this.repository.listLegacyForUser(queryInput),
      this.repository.countLegacyForUser(queryInput),
    ]);

    const legacyItems = await Promise.all(legacyRecords.map(async (row) => {
      const [promptContent, responseContent] = await Promise.all([
        this.blobs.readPrompt(row.id),
        this.blobs.readResponse(row.id),
      ]);
      return {
        ...toListItemFromLegacy(row, promptContent),
        promptExcerpt: extractPromptExcerpt(promptContent),
        responseExcerpt: extractResponseExcerpt(responseContent),
      };
    }));

    return {
      items: legacyItems,
      total: legacyCount,
      filters,
    };
  }

  async getDetail(id: string, userId: string): Promise<AiHistoryDetail | null> {
    const event = await this.repository.getEventDetailForUser(id, userId);
    if (event) {
      const listItem = toListItemFromEvent(event);
      const content = event.content;
      const attachments = event.attachments.map((attachment) => toAttachmentMetadata(attachment));
      if (!content || content.deletedAt || content.expiresAt < new Date()) {
        return {
          ...listItem,
          promptContentJson: CONTENT_EXPIRED_MESSAGE,
          responseContentJson: CONTENT_EXPIRED_MESSAGE,
          attachments,
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
        attachments,
      };
    }

    const legacy = await this.repository.getLegacyDetailForUser(id, userId);
    if (!legacy) return null;

    const [promptContent, responseContent] = await Promise.all([
      this.blobs.readPrompt(id),
      this.blobs.readResponse(id),
    ]);

    const listItem = toListItemFromLegacy(legacy, promptContent);
    return {
      ...listItem,
      promptExcerpt: extractPromptExcerpt(promptContent),
      responseExcerpt: extractResponseExcerpt(responseContent),
      responseContentJson: responseContent,
      attachments: [],
    };
  }

  async getAttachmentForUser(input: {
    userId: string;
    aiRequestEventId: string;
    attachmentId: string;
  }): Promise<{
    bytes: Buffer;
    mimeType: string;
    originalName: string;
    expired: boolean;
  } | null> {
    const attachment = await this.repository.getAttachmentForUser(input);
    if (!attachment) return null;

    if (attachment.deletedAt || attachment.expiresAt < new Date()) {
      return {
        bytes: Buffer.alloc(0),
        mimeType: attachment.mimeType,
        originalName: attachment.originalName ?? `attachment-${attachment.id}`,
        expired: true,
      };
    }

    const bytes = await this.blobs.readBinary(attachment.blobKey);
    if (!bytes) return null;

    return {
      bytes,
      mimeType: attachment.mimeType,
      originalName: attachment.originalName ?? `attachment-${attachment.id}`,
      expired: false,
    };
  }

  async getDetailForAdminByAnyId(ids: string[]): Promise<AiHistoryDetail | null> {
    const event = await this.repository.getEventDetailForAdminByAnyId({ ids });
    if (!event) return null;

    const listItem = toListItemFromEvent(event);
    const content = event.content;
    const attachments = event.attachments.map((attachment) => toAttachmentMetadata(attachment));
    if (!content) {
      return {
        ...listItem,
        promptContentJson: 'Full content not available.',
        responseContentJson: 'Full content not available.',
        attachments,
      };
    }
    if (content.deletedAt || content.expiresAt < new Date()) {
      return {
        ...listItem,
        promptContentJson: CONTENT_EXPIRED_MESSAGE,
        responseContentJson: CONTENT_EXPIRED_MESSAGE,
        attachments,
      };
    }

    const [promptContent, responseContent] = await Promise.all([
      content.promptBlobKey ? this.blobs.readJson(content.promptBlobKey) : Promise.resolve(null),
      content.responseBlobKey ? this.blobs.readJson(content.responseBlobKey) : Promise.resolve(null),
    ]);

    return {
      ...listItem,
      promptContentJson: promptContent ?? 'Prompt content not available.',
      responseContentJson: responseContent ?? 'Response content not available.',
      attachments,
    };
  }

  async getAttachmentForAdmin(input: {
    aiRequestEventId: string;
    attachmentId: string;
  }): Promise<{
    bytes: Buffer;
    mimeType: string;
    originalName: string;
    expired: boolean;
  } | null> {
    const attachment = await this.repository.getAttachmentForAdmin(input);
    if (!attachment) return null;

    if (attachment.deletedAt || attachment.expiresAt < new Date()) {
      return {
        bytes: Buffer.alloc(0),
        mimeType: attachment.mimeType,
        originalName: attachment.originalName ?? `attachment-${attachment.id}`,
        expired: true,
      };
    }

    const bytes = await this.blobs.readBinary(attachment.blobKey);
    if (!bytes) return null;

    return {
      bytes,
      mimeType: attachment.mimeType,
      originalName: attachment.originalName ?? `attachment-${attachment.id}`,
      expired: false,
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
    const promptAttachments: PersistablePromptAttachment[] = [];
    const sanitizedPromptContent = await this.extractPromptAttachments(
      input.promptContent,
      eventId,
      expiresAt,
      promptAttachments,
    );

    const promptKey = await this.blobs.writePrompt(eventId, sanitizedPromptContent);
    const responseKey = input.responseContent !== undefined ? await this.blobs.writeResponse(eventId, input.responseContent) : undefined;
    const fileKey = input.fileBuffer ? await this.blobs.writeFileContent(eventId, input.fileBuffer) : undefined;

    const promptExcerpt = extractPromptExcerpt(sanitizedPromptContent);
    const responseExcerpt = extractResponseExcerpt(input.responseContent);

    const cost = extractProviderCostUsd(input.responseContent)
      ?? estimateRequestCostUsd(input.model, input.promptTokens ?? 0, input.completionTokens ?? 0);

    const previousPromptAttachments = await this.repository.listPromptAttachmentsForEvent(eventId);

    const persistedEvent = await this.repository.upsertEventContentAndRollup({
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
      promptAttachments,
      ...(input.fileMetadata ? { fileMetadataJson: input.fileMetadata as Prisma.InputJsonValue } : {}),
    });
    try {
      await this.adminLogAiSync.syncFromAiRequestEvent(persistedEvent);
    } catch (error) {
      console.warn('[ai-history] admin log ai sync failed', {
        aiRequestEventId: persistedEvent.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await Promise.all(
      previousPromptAttachments
        .map((attachment) => attachment.blobKey)
        .filter((blobKey) => !promptAttachments.some((nextAttachment) => nextAttachment.blobKey === blobKey))
        .map((blobKey) => this.blobs.deleteByKey(blobKey)),
    );
  }

  private async extractPromptAttachments(
    promptContent: unknown,
    requestId: string,
    expiresAt: Date,
    output: PersistablePromptAttachment[],
  ): Promise<unknown> {
    if (!Array.isArray(promptContent)) return promptContent;

    const cloned = structuredClone(promptContent) as Array<Record<string, unknown>>;
    for (const message of cloned) {
      if (!Array.isArray(message.content)) continue;
      const blocks = message.content as Array<Record<string, unknown>>;
      for (const block of blocks) {
        if (block.type !== 'image_url') continue;

        const imageUrlObj = block.image_url && typeof block.image_url === 'object' && !Array.isArray(block.image_url)
          ? (block.image_url as Record<string, unknown>)
          : null;
        if (!imageUrlObj || typeof imageUrlObj.url !== 'string') continue;
        if (!imageUrlObj.url.startsWith('data:')) continue;

        const dataUrlMimeType = this.extractDataUrlMimeType(imageUrlObj.url) ?? 'unknown';
        const estimatedDecodedBytes = estimateDataUrlDecodedBytes(imageUrlObj.url);
        if (estimatedDecodedBytes > MAX_PROMPT_IMAGE_ATTACHMENT_BYTES) {
          this.replaceWithOmittedMarker(block, {
            reason: 'attachment_too_large',
            mimeType: dataUrlMimeType,
            sizeBytes: estimatedDecodedBytes,
          });
          continue;
        }

        const parsed = parseDataUrl(imageUrlObj.url);
        const mimeType = parsed?.mimeType ?? dataUrlMimeType;
        const sizeBytes = parsed?.buffer.byteLength ?? estimateDataUrlDecodedBytes(imageUrlObj.url);

        if (!parsed) {
          this.replaceWithOmittedMarker(block, {
            reason: 'invalid_data_url',
            mimeType,
            sizeBytes,
          });
          continue;
        }

        if (!ALLOWED_PROMPT_IMAGE_MIME_TYPES.has(parsed.mimeType)) {
          this.replaceWithOmittedMarker(block, {
            reason: 'unsupported_mime_type',
            mimeType: parsed.mimeType,
            sizeBytes: parsed.buffer.byteLength,
          });
          continue;
        }

        if (parsed.buffer.byteLength > MAX_PROMPT_IMAGE_ATTACHMENT_BYTES) {
          this.replaceWithOmittedMarker(block, {
            reason: 'attachment_too_large',
            mimeType: parsed.mimeType,
            sizeBytes: parsed.buffer.byteLength,
          });
          continue;
        }

        if (output.length >= MAX_PROMPT_IMAGE_ATTACHMENTS) {
          this.replaceWithOmittedMarker(block, {
            reason: 'attachment_limit_exceeded',
            mimeType: parsed.mimeType,
            sizeBytes: parsed.buffer.byteLength,
          });
          continue;
        }

        const attachmentId = randomUUID();
        const blobKey = await this.blobs.writeAttachmentContent(requestId, attachmentId, parsed.buffer);

        output.push({
          id: attachmentId,
          role: 'prompt',
          kind: 'image',
          mimeType: parsed.mimeType,
          originalName: `image-${output.length + 1}.${extensionForMimeType(parsed.mimeType)}`,
          sizeBytes: parsed.buffer.byteLength,
          blobKey,
          expiresAt,
        });

        delete block.image_url;
        block.type = 'image_attachment';
        block.attachmentId = attachmentId;
        block.mimeType = parsed.mimeType;
        block.sizeBytes = parsed.buffer.byteLength;
      }
    }

    return cloned;
  }

  private extractDataUrlMimeType(dataUrl: string): string | null {
    const match = /^data:([^;,]+)/.exec(dataUrl);
    return match?.[1]?.trim().toLowerCase() ?? null;
  }

  private replaceWithOmittedMarker(
    block: Record<string, unknown>,
    details: { reason: string; mimeType: string; sizeBytes: number },
  ): void {
    delete block.image_url;
    block.type = 'image_omitted';
    block.reason = details.reason;
    block.mimeType = details.mimeType;
    block.sizeBytes = details.sizeBytes;
  }
}
