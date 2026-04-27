import { buildAdminLogEventCreateInput, type PrismaClient } from '@quizmind/database';
import { enrichSearchTextWithActorIdentity, resolveActorIdentities } from './admin-log-actor-enrichment';

interface RepairCursor {
  occurredAt: Date;
  id: string;
}

export interface AdminLogRepairResult {
  inspected: number;
  updated: number;
}

export class AdminLogRepairService {
  constructor(private readonly prisma: PrismaClient, private readonly batchSize = 250) {}

  async repairReadModel(): Promise<AdminLogRepairResult> {
    let cursor: RepairCursor | null = null;
    const totals: AdminLogRepairResult = { inspected: 0, updated: 0 };

    while (true) {
      const rows = await this.prisma.adminLogEvent.findMany({
        where: cursor
          ? {
              OR: [
                { occurredAt: { gt: cursor.occurredAt } },
                { occurredAt: cursor.occurredAt, id: { gt: cursor.id } },
              ],
            }
          : undefined,
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: this.batchSize,
        select: {
          id: true,
          stream: true,
          sourceRecordId: true,
          eventType: true,
          occurredAt: true,
          severity: true,
          actorId: true,
          targetType: true,
          targetId: true,
          actorEmail: true,
          actorDisplayName: true,
          summary: true,
          source: true,
          category: true,
          searchText: true,
          provider: true,
          model: true,
          durationMs: true,
          costUsd: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          metadataJson: true,
          payloadJson: true,
        },
      });

      if (rows.length === 0) break;
      totals.inspected += rows.length;

      const actorDirectory = await resolveActorIdentities(this.prisma, rows.map((row) => row.actorId ?? '').filter(Boolean));
      const aiRequestIds = Array.from(new Set(rows.flatMap((row) => {
        const metadata = this.toObject(row.metadataJson);
        const payload = this.toObject(row.payloadJson);
        return [
          row.targetType === 'ai_request' ? row.targetId : null,
          typeof metadata?.requestId === 'string' ? metadata.requestId : null,
          typeof payload?.requestId === 'string' ? payload.requestId : null,
          row.sourceRecordId,
        ].filter((value): value is string => typeof value === 'string' && value.length > 0);
      })));
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
      const aiRequestById = new Map(aiRequestRows.map((request) => [request.id, request]));

      for (const row of rows) {
        const metadata = this.toObject(row.metadataJson);
        const payload = this.toObject(row.payloadJson);
        const rebuilt = buildAdminLogEventCreateInput({
          stream: row.stream as 'audit' | 'activity' | 'security' | 'domain',
          sourceRecordId: row.sourceRecordId,
          eventType: row.eventType,
          occurredAt: row.occurredAt,
          actorId: row.actorId,
          severity: row.severity,
          targetType: row.targetType,
          targetId: row.targetId,
          ...(metadata ? { metadata } : {}),
          ...(payload ? { payload } : {}),
        });

        const identity = row.actorId ? actorDirectory.get(row.actorId) : undefined;
        const aiRequest = [
          row.targetType === 'ai_request' ? row.targetId : null,
          typeof metadata?.requestId === 'string' ? metadata.requestId : null,
          typeof payload?.requestId === 'string' ? payload.requestId : null,
          row.sourceRecordId,
        ]
          .map((candidate) => (candidate ? aiRequestById.get(candidate) : undefined))
          .find(Boolean);
        const nextActorEmail = rebuilt.actorEmail ?? identity?.email ?? null;
        const nextActorDisplayName = rebuilt.actorDisplayName ?? identity?.displayName ?? null;
        const nextSummary = rebuilt.summary;
        const nextSource = rebuilt.source ?? null;
        const nextCategory = rebuilt.category ?? null;
        const nextSearchText = enrichSearchTextWithActorIdentity(
          [rebuilt.searchText, aiRequest?.promptExcerpt].filter(Boolean).join(' ').toLowerCase() || null,
          identity,
        ) ?? null;
        const nextTargetType = rebuilt.targetType ?? (aiRequest ? 'ai_request' : null);
        const nextTargetId = rebuilt.targetId ?? aiRequest?.id ?? null;
        const nextProvider = rebuilt.provider ?? aiRequest?.provider ?? null;
        const nextModel = rebuilt.model ?? aiRequest?.model ?? null;
        const nextDurationMs = rebuilt.durationMs ?? aiRequest?.durationMs ?? null;
        const nextCostUsd = rebuilt.costUsd ?? aiRequest?.estimatedCostUsd ?? null;
        const nextPromptTokens = rebuilt.promptTokens ?? aiRequest?.promptTokens ?? null;
        const nextCompletionTokens = rebuilt.completionTokens ?? aiRequest?.completionTokens ?? null;
        const nextTotalTokens = rebuilt.totalTokens ?? aiRequest?.totalTokens ?? null;

        if (
          row.actorEmail !== nextActorEmail
          || row.actorDisplayName !== nextActorDisplayName
          || row.summary !== nextSummary
          || row.source !== nextSource
          || row.category !== nextCategory
          || row.searchText !== nextSearchText
          || row.targetType !== nextTargetType
          || row.targetId !== nextTargetId
          || row.provider !== nextProvider
          || row.model !== nextModel
          || row.durationMs !== nextDurationMs
          || row.costUsd !== nextCostUsd
          || row.promptTokens !== nextPromptTokens
          || row.completionTokens !== nextCompletionTokens
          || row.totalTokens !== nextTotalTokens
        ) {
          await this.prisma.adminLogEvent.update({
            where: { id: row.id },
            data: {
              actorEmail: nextActorEmail,
              actorDisplayName: nextActorDisplayName,
              summary: nextSummary,
              source: nextSource,
              category: nextCategory,
              searchText: nextSearchText,
              targetType: nextTargetType,
              targetId: nextTargetId,
              provider: nextProvider,
              model: nextModel,
              durationMs: nextDurationMs,
              costUsd: nextCostUsd,
              promptTokens: nextPromptTokens,
              completionTokens: nextCompletionTokens,
              totalTokens: nextTotalTokens,
            },
          });
          totals.updated += 1;
        }
      }

      const last = rows[rows.length - 1]!;
      cursor = { occurredAt: last.occurredAt, id: last.id };
    }

    return totals;
  }

  private toObject(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  }
}
