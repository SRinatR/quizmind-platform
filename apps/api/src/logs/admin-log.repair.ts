import { buildAdminLogEventCreateInput, Prisma, type PrismaClient } from '@quizmind/database';
import { enrichSearchTextWithActorIdentity, resolveActorIdentities } from './admin-log-actor-enrichment';
import { collectAdminAiRequestCandidateIds } from './admin-log-ai-request-candidates';
import { buildAdminAiLogPatchFromAiRequestEvent, normalizeAdminAiStatus } from './admin-log-ai-sync';


const adminLogRepairSelect = {
  id: true, stream: true, sourceRecordId: true, eventType: true, occurredAt: true, severity: true, status: true, actorId: true,
  targetType: true, targetId: true, actorEmail: true, actorDisplayName: true, summary: true, source: true, category: true, searchText: true,
  provider: true, model: true, durationMs: true, costUsd: true, promptTokens: true, completionTokens: true, totalTokens: true, metadataJson: true, payloadJson: true,
} satisfies Prisma.AdminLogEventSelect;
type AdminLogRepairRow = Prisma.AdminLogEventGetPayload<{ select: typeof adminLogRepairSelect }>;
function isNonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }

interface RepairCursor {
  occurredAt: Date;
  id: string;
}

export interface AdminLogRepairResult {
  inspected: number;
  updated: number;
  enrichedAi: number;
  duplicateAiDomainDeleted: number;
}

const AI_PROXY_FAILURE_EVENT_TYPES = new Set([
  'ai.proxy.failed',
  'ai.proxy.timeout',
  'ai.proxy.quota_exceeded',
  'ai.proxy.user_key_failed',
]);

function deriveAiStatusFromEventType(eventType: string): 'success' | 'failure' | undefined {
  const normalized = eventType.toLowerCase();
  if (normalized === 'ai.proxy.completed') return 'success';
  if (AI_PROXY_FAILURE_EVENT_TYPES.has(normalized)) return 'failure';
  return undefined;
}

export class AdminLogRepairService {
  constructor(private readonly prisma: PrismaClient, private readonly batchSize = 250) {}

  async repairReadModel(): Promise<AdminLogRepairResult> {
    let cursor: RepairCursor | null = null;
    const totals: AdminLogRepairResult = { inspected: 0, updated: 0, enrichedAi: 0, duplicateAiDomainDeleted: 0 };

    while (true) {
      const rows: AdminLogRepairRow[] = await this.prisma.adminLogEvent.findMany({
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
        select: adminLogRepairSelect,
      });

      if (rows.length === 0) break;
      totals.inspected += rows.length;

      const actorDirectory = await resolveActorIdentities(this.prisma, rows.map((row) => row.actorId ?? '').filter(isNonEmptyString));
      const aiRequestIds = Array.from(new Set(rows.flatMap((row) => {
        const metadata = this.toObject(row.metadataJson);
        const payload = this.toObject(row.payloadJson);
        return collectAdminAiRequestCandidateIds({
          targetType: row.targetType,
          targetId: row.targetId,
          sourceRecordId: row.sourceRecordId,
          metadata,
          payload,
        });
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
              status: true,
            },
          })
        : [];
      const aiRequestById = new Map(aiRequestRows.map((request) => [request.id, request]));

      const duplicateDomainRowIds: string[] = [];
      const domainRequestIdByRowId = new Map<string, string>();
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
        const aiRequest = collectAdminAiRequestCandidateIds({
          targetType: row.targetType,
          targetId: row.targetId,
          sourceRecordId: row.sourceRecordId,
          metadata,
          payload,
        })
          .map((candidate) => (candidate ? aiRequestById.get(candidate) : undefined))
          .find(Boolean);
        const nextActorEmail = rebuilt.actorEmail ?? identity?.email ?? null;
        const nextActorDisplayName = rebuilt.actorDisplayName ?? identity?.displayName ?? null;
        const nextSummary = rebuilt.summary;
        const nextSource = rebuilt.source ?? null;
        const nextCategory = rebuilt.category ?? null;
        const nextSearchText = enrichSearchTextWithActorIdentity(
          [rebuilt.searchText, aiRequest?.promptExcerpt].filter(isNonEmptyString).join(' ').toLowerCase() || null,
          identity,
        ) ?? null;
        const aiPatch = aiRequest ? buildAdminAiLogPatchFromAiRequestEvent(aiRequest) : undefined;
        const nextTargetType = rebuilt.targetType ?? (aiPatch?.targetType as string | undefined) ?? null;
        const nextTargetId = rebuilt.targetId ?? (aiPatch?.targetId as string | undefined) ?? null;
        const nextProvider = rebuilt.provider ?? aiRequest?.provider ?? null;
        const nextModel = rebuilt.model ?? aiRequest?.model ?? null;
        const nextStatus = rebuilt.status ?? normalizeAdminAiStatus(aiRequest?.status) ?? deriveAiStatusFromEventType(row.eventType) ?? null;
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
          || row.status !== nextStatus
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
              status: nextStatus,
              durationMs: nextDurationMs,
              costUsd: nextCostUsd,
              promptTokens: nextPromptTokens,
              completionTokens: nextCompletionTokens,
              totalTokens: nextTotalTokens,
            },
          });
          totals.updated += 1;
        }

        const rowIsAi = row.eventType.toLowerCase().startsWith('ai.proxy.');
        if (rowIsAi && aiRequest && row.costUsd !== nextCostUsd) {
          totals.enrichedAi += 1;
        }
        if (row.stream === 'domain' && rowIsAi && nextTargetId) {
          domainRequestIdByRowId.set(row.id, nextTargetId);
        }
      }

      const domainRequestIds = Array.from(new Set(domainRequestIdByRowId.values()));
      if (domainRequestIds.length > 0) {
        const activityRows = await this.prisma.adminLogEvent.findMany({
          where: {
            stream: 'activity',
            eventType: { in: ['ai.proxy.completed', 'ai.proxy.failed', 'ai.proxy.timeout', 'ai.proxy.quota_exceeded'] },
            targetId: { in: domainRequestIds },
          },
          select: { id: true, targetId: true },
        });
        const activityTargetIds = new Set(activityRows.map((activityRow) => activityRow.targetId).filter(isNonEmptyString));
        for (const [rowId, requestId] of domainRequestIdByRowId.entries()) {
          if (activityTargetIds.has(requestId)) {
            duplicateDomainRowIds.push(rowId);
          }
        }
      }

      if (duplicateDomainRowIds.length > 0) {
        const deleteResult = await this.prisma.adminLogEvent.deleteMany({
          where: { id: { in: duplicateDomainRowIds } },
        });
        totals.duplicateAiDomainDeleted += deleteResult.count;
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
