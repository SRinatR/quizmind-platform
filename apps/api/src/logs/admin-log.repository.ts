import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type EventSeverity } from '@quizmind/database';
import { type AdminLogSeverityFilter, type AdminLogStream } from '@quizmind/contracts';

import { PrismaService } from '../database/prisma.service';

const listSelect = {
  id: true,
  stream: true,
  sourceRecordId: true,
  eventType: true,
  summary: true,
  occurredAt: true,
  severity: true,
  status: true,
  actorId: true,
  actorEmail: true,
  actorDisplayName: true,
  targetType: true,
  targetId: true,
  category: true,
  source: true,
  installationId: true,
  provider: true,
  model: true,
  durationMs: true,
  costUsd: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  errorSummary: true,
} satisfies Prisma.AdminLogEventSelect;

const detailSelect = {
  ...listSelect,
  metadataJson: true,
  payloadJson: true,
} satisfies Prisma.AdminLogEventSelect;

export interface AdminLogListRecord {
  id: string;
  stream: AdminLogStream;
  sourceRecordId: string;
  eventType: string;
  summary: string;
  occurredAt: Date;
  severity: EventSeverity | null;
  status: 'success' | 'failure' | null;
  actorId: string | null;
  actorEmail: string | null;
  actorDisplayName: string | null;
  targetType: string | null;
  targetId: string | null;
  category: 'auth' | 'extension' | 'ai' | 'admin' | 'system' | null;
  source: 'web' | 'extension' | 'api' | 'worker' | 'webhook' | null;
  installationId: string | null;
  provider: string | null;
  model: string | null;
  durationMs: number | null;
  costUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  errorSummary: string | null;
}

interface ListAdminLogsInput {
  stream?: AdminLogStream | 'all';
  severity?: AdminLogSeverityFilter;
  search?: string;
  category?: 'auth' | 'extension' | 'ai' | 'admin' | 'system';
  source?: 'web' | 'extension' | 'api' | 'worker' | 'webhook';
  status?: 'success' | 'failure';
  eventType?: string;
  from?: string;
  to?: string;
  limit: number;
  cursor?: string;
}

interface ListAdminLogsResult {
  items: AdminLogListRecord[];
  hasNext: boolean;
  nextCursor: string | null;
}

interface ParsedCursor {
  occurredAt: Date;
  id: string;
}

@Injectable()
export class AdminLogRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private parseCursor(cursor?: string): ParsedCursor | null {
    if (!cursor) return null;
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { occurredAt?: string; id?: string };
      if (!decoded.id || !decoded.occurredAt) return null;
      const occurredAt = new Date(decoded.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) return null;
      return { occurredAt, id: decoded.id };
    } catch {
      return null;
    }
  }

  private encodeCursor(item: AdminLogListRecord): string {
    return Buffer.from(JSON.stringify({ occurredAt: item.occurredAt.toISOString(), id: item.id }), 'utf8').toString('base64url');
  }

  async listPage(input: ListAdminLogsInput): Promise<ListAdminLogsResult> {
    const fromDate = input.from ? new Date(input.from) : undefined;
    const toDate = input.to ? new Date(input.to) : undefined;
    const cursor = this.parseCursor(input.cursor);
    const take = Math.min(100, Math.max(1, input.limit));

    const where: Prisma.AdminLogEventWhereInput = {
      ...(input.stream && input.stream !== 'all' ? { stream: input.stream } : {}),
      ...(input.severity && input.severity !== 'all' ? { severity: input.severity } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.eventType ? { eventType: { contains: input.eventType, mode: 'insensitive' } } : {}),
      ...(input.search?.trim() ? { searchText: { contains: input.search.trim(), mode: 'insensitive' } } : {}),
      ...(fromDate && !Number.isNaN(fromDate.getTime()) ? { occurredAt: { gte: fromDate } } : {}),
      ...(toDate && !Number.isNaN(toDate.getTime())
        ? { occurredAt: { ...(fromDate && !Number.isNaN(fromDate.getTime()) ? { gte: fromDate } : {}), lte: toDate } }
        : {}),
      ...(cursor
        ? {
            OR: [
              { occurredAt: { lt: cursor.occurredAt } },
              { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.adminLogEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: listSelect,
    });

    const hasNext = rows.length > take;
    const items = (hasNext ? rows.slice(0, take) : rows) as AdminLogListRecord[];
    const nextCursor = hasNext && items.length > 0 ? this.encodeCursor(items[items.length - 1]!) : null;

    return { items, hasNext, nextCursor };
  }

  async findOne(id: string): Promise<{ item: AdminLogListRecord; metadata: Record<string, unknown> | undefined } | null> {
    let row = await this.prisma.adminLogEvent.findUnique({ where: { id }, select: detailSelect });

    if (!row && id.includes(':')) {
      const [stream, sourceRecordId] = id.split(':');
      if (!stream || !sourceRecordId) return null;
      row = await this.prisma.adminLogEvent.findUnique({
        where: {
          stream_sourceRecordId: {
            stream,
            sourceRecordId,
          },
        },
        select: detailSelect,
      });
    }

    if (!row) return null;

    return {
      item: {
        id: row.id,
        stream: row.stream as AdminLogStream,
        sourceRecordId: row.sourceRecordId,
        eventType: row.eventType,
        summary: row.summary,
        occurredAt: row.occurredAt,
        severity: row.severity,
        status: (row.status as 'success' | 'failure' | null) ?? null,
        actorId: row.actorId,
        actorEmail: row.actorEmail,
        actorDisplayName: row.actorDisplayName,
        targetType: row.targetType,
        targetId: row.targetId,
        category: (row.category as AdminLogListRecord['category']) ?? null,
        source: (row.source as AdminLogListRecord['source']) ?? null,
        installationId: row.installationId,
        provider: row.provider,
        model: row.model,
        durationMs: row.durationMs,
        costUsd: row.costUsd,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        errorSummary: row.errorSummary,
      },
      metadata: this.toObject(row.metadataJson) ?? this.toObject(row.payloadJson),
    };
  }

  private toObject(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  }

  async pruneExpiredReadModel(_now = new Date()): Promise<{ deleted: number }> {
    return { deleted: 0 };
  }
}
