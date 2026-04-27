import { buildAdminLogEventCreateInput, type PrismaClient } from '@quizmind/database';
import { enrichSearchTextWithActorIdentity, resolveActorIdentities } from './admin-log-actor-enrichment';

type Stream = 'audit' | 'activity' | 'security' | 'domain';

export interface AdminLogBackfillScope {
  stream?: Stream | 'all';
  from?: Date;
  to?: Date;
}

export interface AdminLogBackfillVerification {
  audit: { sourceCount: number; readModelCount: number; missing: number };
  activity: { sourceCount: number; readModelCount: number; missing: number };
  security: { sourceCount: number; readModelCount: number; missing: number };
  domain: { sourceCount: number; readModelCount: number; missing: number };
}

export class AdminLogBackfillService {
  constructor(private readonly prisma: PrismaClient, private readonly batchSize = 500) {}

  private shouldRun(scope: AdminLogBackfillScope, stream: Stream): boolean {
    return !scope.stream || scope.stream === 'all' || scope.stream === stream;
  }

  private async upsertBatch(rows: Array<{ stream: Stream; sourceRecordId: string; data: any }>) {
    const actorDirectory = await resolveActorIdentities(
      this.prisma,
      rows.map((row) => row.data.actorId ?? '').filter(Boolean),
    );

    const aiRequestIds = Array.from(new Set(
      rows
        .map((row) => (typeof row.data.targetType === 'string' && row.data.targetType === 'ai_request' ? row.data.targetId : undefined))
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ));
    const aiRequestRows = aiRequestIds.length > 0
      ? await this.prisma.aiRequestEvent.findMany({
          where: { id: { in: aiRequestIds } },
          select: {
            id: true,
            provider: true,
            model: true,
            durationMs: true,
            estimatedCostUsd: true,
            promptTokens: true,
            completionTokens: true,
            totalTokens: true,
            promptExcerpt: true,
          },
        })
      : [];
    const aiRequestById = new Map(aiRequestRows.map((row) => [row.id, row]));

    for (const row of rows) {
      const actorId = row.data.actorId as string | undefined;
      const actorIdentity = actorId ? actorDirectory.get(actorId) : undefined;
      const aiRequest = typeof row.data.targetId === 'string' ? aiRequestById.get(row.data.targetId) : undefined;
      const enrichedData = aiRequest
        ? {
            ...row.data,
            targetType: row.data.targetType ?? 'ai_request',
            targetId: row.data.targetId ?? aiRequest.id,
            provider: row.data.provider ?? aiRequest.provider,
            model: row.data.model ?? aiRequest.model,
            durationMs: row.data.durationMs ?? aiRequest.durationMs ?? undefined,
            costUsd: row.data.costUsd ?? aiRequest.estimatedCostUsd ?? undefined,
            promptTokens: row.data.promptTokens ?? aiRequest.promptTokens,
            completionTokens: row.data.completionTokens ?? aiRequest.completionTokens,
            totalTokens: row.data.totalTokens ?? aiRequest.totalTokens,
            searchText: [row.data.searchText, aiRequest.promptExcerpt].filter(Boolean).join(' ').toLowerCase(),
          }
        : row.data;
      await this.prisma.adminLogEvent.upsert({
        where: { stream_sourceRecordId: { stream: row.stream, sourceRecordId: row.sourceRecordId } },
        create: {
          ...enrichedData,
          actorEmail: enrichedData.actorEmail ?? actorIdentity?.email,
          actorDisplayName: enrichedData.actorDisplayName ?? actorIdentity?.displayName ?? undefined,
          searchText: enrichSearchTextWithActorIdentity(enrichedData.searchText, actorIdentity),
        },
        update: {
          ...enrichedData,
          actorEmail: enrichedData.actorEmail ?? actorIdentity?.email,
          actorDisplayName: enrichedData.actorDisplayName ?? actorIdentity?.displayName ?? undefined,
          searchText: enrichSearchTextWithActorIdentity(enrichedData.searchText, actorIdentity),
        },
      });
    }
  }

  async run(scope: AdminLogBackfillScope = {}): Promise<void> {
    if (this.shouldRun(scope, 'audit')) await this.backfillAudit(scope);
    if (this.shouldRun(scope, 'activity')) await this.backfillActivity(scope);
    if (this.shouldRun(scope, 'security')) await this.backfillSecurity(scope);
    if (this.shouldRun(scope, 'domain')) await this.backfillDomain(scope);
  }

  async verifyCounts(): Promise<AdminLogBackfillVerification> {
    const [auditSource, activitySource, securitySource, domainSource, auditRead, activityRead, securityRead, domainRead] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.activityLog.count(),
      this.prisma.securityEvent.count(),
      this.prisma.domainEvent.count(),
      this.prisma.adminLogEvent.count({ where: { stream: 'audit' } }),
      this.prisma.adminLogEvent.count({ where: { stream: 'activity' } }),
      this.prisma.adminLogEvent.count({ where: { stream: 'security' } }),
      this.prisma.adminLogEvent.count({ where: { stream: 'domain' } }),
    ]);

    return {
      audit: { sourceCount: auditSource, readModelCount: auditRead, missing: Math.max(auditSource - auditRead, 0) },
      activity: { sourceCount: activitySource, readModelCount: activityRead, missing: Math.max(activitySource - activityRead, 0) },
      security: { sourceCount: securitySource, readModelCount: securityRead, missing: Math.max(securitySource - securityRead, 0) },
      domain: { sourceCount: domainSource, readModelCount: domainRead, missing: Math.max(domainSource - domainRead, 0) },
    };
  }

  private timeWhere(cursor: { createdAt: Date; id: string } | null, scope: AdminLogBackfillScope) {
    const andFilters: Record<string, unknown>[] = [];
    if (scope.from || scope.to) {
      andFilters.push({ createdAt: { ...(scope.from ? { gte: scope.from } : {}), ...(scope.to ? { lte: scope.to } : {}) } });
    }
    if (cursor) {
      andFilters.push({ OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] });
    }
    return andFilters.length > 0 ? { AND: andFilters } : undefined;
  }

  private async backfillAudit(scope: AdminLogBackfillScope) {
    let cursor: { createdAt: Date; id: string } | null = null;
    while (true) {
      const rows = await this.prisma.auditLog.findMany({
        where: this.timeWhere(cursor, scope),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: this.batchSize,
        select: { id: true, actorId: true, action: true, targetType: true, targetId: true, metadataJson: true, createdAt: true },
      });
      if (rows.length === 0) break;
      await this.upsertBatch(rows.map((row) => ({
        stream: 'audit' as const,
        sourceRecordId: row.id,
        data: buildAdminLogEventCreateInput({
          stream: 'audit',
          sourceRecordId: row.id,
          eventType: row.action,
          occurredAt: row.createdAt,
          actorId: row.actorId,
          targetType: row.targetType,
          targetId: row.targetId,
          metadata: (row.metadataJson as Record<string, unknown> | null) ?? undefined,
        }),
      })));
      const last = rows[rows.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
    }
  }

  private async backfillActivity(scope: AdminLogBackfillScope) {
    let cursor: { createdAt: Date; id: string } | null = null;
    while (true) {
      const rows = await this.prisma.activityLog.findMany({
        where: this.timeWhere(cursor, scope),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: this.batchSize,
        select: { id: true, actorId: true, eventType: true, metadataJson: true, createdAt: true },
      });
      if (rows.length === 0) break;
      await this.upsertBatch(rows.map((row) => ({
        stream: 'activity' as const,
        sourceRecordId: row.id,
        data: buildAdminLogEventCreateInput({
          stream: 'activity',
          sourceRecordId: row.id,
          eventType: row.eventType,
          occurredAt: row.createdAt,
          actorId: row.actorId,
          metadata: (row.metadataJson as Record<string, unknown> | null) ?? undefined,
        }),
      })));
      const last = rows[rows.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
    }
  }

  private async backfillSecurity(scope: AdminLogBackfillScope) {
    let cursor: { createdAt: Date; id: string } | null = null;
    while (true) {
      const rows = await this.prisma.securityEvent.findMany({
        where: this.timeWhere(cursor, scope),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: this.batchSize,
        select: { id: true, actorId: true, eventType: true, severity: true, metadataJson: true, createdAt: true },
      });
      if (rows.length === 0) break;
      await this.upsertBatch(rows.map((row) => ({
        stream: 'security' as const,
        sourceRecordId: row.id,
        data: buildAdminLogEventCreateInput({
          stream: 'security',
          sourceRecordId: row.id,
          eventType: row.eventType,
          occurredAt: row.createdAt,
          actorId: row.actorId,
          severity: row.severity,
          metadata: (row.metadataJson as Record<string, unknown> | null) ?? undefined,
        }),
      })));
      const last = rows[rows.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
    }
  }

  private async backfillDomain(scope: AdminLogBackfillScope) {
    let cursor: { createdAt: Date; id: string } | null = null;
    while (true) {
      const rows = await this.prisma.domainEvent.findMany({
        where: this.timeWhere(cursor, scope),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: this.batchSize,
        select: { id: true, eventType: true, payloadJson: true, createdAt: true },
      });
      if (rows.length === 0) break;
      await this.upsertBatch(rows.map((row) => ({
        stream: 'domain' as const,
        sourceRecordId: row.id,
        data: buildAdminLogEventCreateInput({
          stream: 'domain',
          sourceRecordId: row.id,
          eventType: row.eventType,
          occurredAt: row.createdAt,
          payload: (row.payloadJson as Record<string, unknown> | null) ?? undefined,
        }),
      })));
      const last = rows[rows.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
    }
  }
}
