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
          metadataJson: true,
          payloadJson: true,
        },
      });

      if (rows.length === 0) break;
      totals.inspected += rows.length;

      const actorDirectory = await resolveActorIdentities(this.prisma, rows.map((row) => row.actorId ?? '').filter(Boolean));

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
        const nextActorEmail = rebuilt.actorEmail ?? identity?.email ?? null;
        const nextActorDisplayName = rebuilt.actorDisplayName ?? identity?.displayName ?? null;
        const nextSummary = rebuilt.summary;
        const nextSource = rebuilt.source ?? null;
        const nextCategory = rebuilt.category ?? null;
        const nextSearchText = enrichSearchTextWithActorIdentity(rebuilt.searchText ?? null, identity) ?? null;

        if (
          row.actorEmail !== nextActorEmail
          || row.actorDisplayName !== nextActorDisplayName
          || row.summary !== nextSummary
          || row.source !== nextSource
          || row.category !== nextCategory
          || row.searchText !== nextSearchText
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
