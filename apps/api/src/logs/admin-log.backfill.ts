import { buildAdminLogEventCreateInput, type PrismaClient } from '@quizmind/database';

export class AdminLogBackfillService {
  constructor(private readonly prisma: PrismaClient, private readonly batchSize = 500) {}

  private async upsertBatch(rows: Array<{ stream: 'audit' | 'activity' | 'security' | 'domain'; sourceRecordId: string; data: any }>) {
    for (const row of rows) {
      await this.prisma.adminLogEvent.upsert({
        where: { stream_sourceRecordId: { stream: row.stream, sourceRecordId: row.sourceRecordId } },
        create: row.data,
        update: row.data,
      });
    }
  }

  async run(): Promise<void> {
    await this.backfillAudit();
    await this.backfillActivity();
    await this.backfillSecurity();
    await this.backfillDomain();
  }

  private async backfillAudit() {
    let cursor: { createdAt: Date; id: string } | null = null;
    while (true) {
      const rows = await this.prisma.auditLog.findMany({
        where: cursor
          ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }
          : undefined,
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

  private async backfillActivity() {
    let cursor: { createdAt: Date; id: string } | null = null;
    while (true) {
      const rows = await this.prisma.activityLog.findMany({
        where: cursor
          ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }
          : undefined,
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

  private async backfillSecurity() {
    let cursor: { createdAt: Date; id: string } | null = null;
    while (true) {
      const rows = await this.prisma.securityEvent.findMany({
        where: cursor
          ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }
          : undefined,
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

  private async backfillDomain() {
    let cursor: { createdAt: Date; id: string } | null = null;
    while (true) {
      const rows = await this.prisma.domainEvent.findMany({
        where: cursor
          ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }
          : undefined,
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
