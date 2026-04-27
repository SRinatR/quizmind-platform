import { buildAdminLogEventCreateInput, Prisma, type PrismaClient } from '@quizmind/database';
import { enrichSearchTextWithActorIdentity, resolveActorIdentities } from './admin-log-actor-enrichment';

function toMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function withActorMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    ...(typeof metadata?.actorEmail === 'string' ? { actorEmail: metadata.actorEmail } : {}),
    ...(typeof metadata?.actorDisplayName === 'string' ? { actorDisplayName: metadata.actorDisplayName } : {}),
  };
}

function enrichReadModelActorFields(
  data: Prisma.AdminLogEventCreateInput,
  actorIdentity?: { email: string; displayName: string | null },
): Prisma.AdminLogEventCreateInput {
  if (!data.actorId || !actorIdentity) {
    return data;
  }
  return {
    ...data,
    actorEmail: data.actorEmail ?? actorIdentity.email,
    actorDisplayName: data.actorDisplayName ?? actorIdentity.displayName ?? undefined,
    searchText: enrichSearchTextWithActorIdentity(data.searchText, actorIdentity),
  };
}

export type ReadModelUpsert = {
  stream: 'audit' | 'activity' | 'security' | 'domain';
  sourceRecordId: string;
  data: Prisma.AdminLogEventCreateInput;
};

export type CreatedAuditLogRow = {
  id: string;
  action: string;
  actorId: string | null;
  targetType: string;
  targetId: string;
  metadataJson: unknown;
  createdAt: Date;
};

export type CreatedActivityLogRow = {
  id: string;
  eventType: string;
  actorId: string | null;
  metadataJson: unknown;
  createdAt: Date;
};

export type CreatedSecurityEventRow = {
  id: string;
  eventType: string;
  actorId: string | null;
  severity: Prisma.EventSeverity;
  metadataJson: unknown;
  createdAt: Date;
};

export type CreatedDomainEventRow = {
  id: string;
  eventType: string;
  payloadJson: unknown;
  createdAt: Date;
};

export function buildReadModelFromAuditRow(row: CreatedAuditLogRow): ReadModelUpsert {
  const metadata = toMetadata(row.metadataJson);
  return {
    stream: 'audit',
    sourceRecordId: row.id,
    data: buildAdminLogEventCreateInput({
      stream: 'audit',
      sourceRecordId: row.id,
      eventType: row.action,
      occurredAt: row.createdAt,
      actorId: row.actorId,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: withActorMetadata(metadata),
    }),
  };
}

export function buildReadModelFromActivityRow(row: CreatedActivityLogRow): ReadModelUpsert {
  const metadata = toMetadata(row.metadataJson);
  return {
    stream: 'activity',
    sourceRecordId: row.id,
    data: buildAdminLogEventCreateInput({
      stream: 'activity',
      sourceRecordId: row.id,
      eventType: row.eventType,
      occurredAt: row.createdAt,
      actorId: row.actorId,
      metadata: withActorMetadata(metadata),
    }),
  };
}

export function buildReadModelFromSecurityRow(row: CreatedSecurityEventRow): ReadModelUpsert {
  const metadata = toMetadata(row.metadataJson);
  return {
    stream: 'security',
    sourceRecordId: row.id,
    data: buildAdminLogEventCreateInput({
      stream: 'security',
      sourceRecordId: row.id,
      eventType: row.eventType,
      occurredAt: row.createdAt,
      actorId: row.actorId,
      severity: row.severity,
      metadata: withActorMetadata(metadata),
    }),
  };
}

export function buildReadModelFromDomainRow(row: CreatedDomainEventRow): ReadModelUpsert {
  return {
    stream: 'domain',
    sourceRecordId: row.id,
    data: buildAdminLogEventCreateInput({
      stream: 'domain',
      sourceRecordId: row.id,
      eventType: row.eventType,
      occurredAt: row.createdAt,
      payload: toMetadata(row.payloadJson),
    }),
  };
}

export async function upsertAdminLogEventsBestEffort(
  prisma: Pick<PrismaClient, 'adminLogEvent' | 'user' | 'aiRequestEvent'>,
  events: ReadonlyArray<ReadModelUpsert>,
): Promise<void> {
  const actorDirectory = await resolveActorIdentities(
    prisma,
    events.map((event) => event.data.actorId ?? '').filter(Boolean),
  );

  for (const event of events) {
    try {
      const aiRequestId = typeof event.data.targetId === 'string' ? event.data.targetId : undefined;
      const aiRequest = aiRequestId && (prisma as { aiRequestEvent?: PrismaClient['aiRequestEvent'] }).aiRequestEvent
        ? await prisma.aiRequestEvent.findUnique({
            where: { id: aiRequestId },
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
        : null;

      const baseData = aiRequest
        ? {
            ...event.data,
            provider: event.data.provider ?? aiRequest.provider,
            model: event.data.model ?? aiRequest.model,
            durationMs: event.data.durationMs ?? aiRequest.durationMs ?? undefined,
            costUsd: event.data.costUsd ?? aiRequest.estimatedCostUsd ?? undefined,
            promptTokens: event.data.promptTokens ?? aiRequest.promptTokens,
            completionTokens: event.data.completionTokens ?? aiRequest.completionTokens,
            totalTokens: event.data.totalTokens ?? aiRequest.totalTokens,
            searchText: [event.data.searchText, aiRequest.promptExcerpt].filter(Boolean).join(' ').toLowerCase(),
          }
        : event.data;
      const data = enrichReadModelActorFields(baseData, event.data.actorId ? actorDirectory.get(event.data.actorId) : undefined);
      await prisma.adminLogEvent.upsert({
        where: { stream_sourceRecordId: { stream: event.stream, sourceRecordId: event.sourceRecordId } },
        create: data,
        update: data,
      });
    } catch (error) {
      console.warn('[admin-log-events] explicit dual-write failed', {
        stream: event.stream,
        sourceRecordId: event.sourceRecordId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function createAuditLogWithReadModel(
  transaction: Prisma.TransactionClient,
  data: Prisma.AuditLogUncheckedCreateInput,
): Promise<CreatedAuditLogRow> {
  return transaction.auditLog.create({
    data,
    select: { id: true, action: true, actorId: true, targetType: true, targetId: true, metadataJson: true, createdAt: true },
  });
}

export async function createActivityLogWithReadModel(
  transaction: Prisma.TransactionClient,
  data: Prisma.ActivityLogUncheckedCreateInput,
): Promise<CreatedActivityLogRow> {
  return transaction.activityLog.create({
    data,
    select: { id: true, eventType: true, actorId: true, metadataJson: true, createdAt: true },
  });
}

export async function createSecurityEventWithReadModel(
  transaction: Prisma.TransactionClient,
  data: Prisma.SecurityEventUncheckedCreateInput,
): Promise<CreatedSecurityEventRow> {
  return transaction.securityEvent.create({
    data,
    select: { id: true, eventType: true, actorId: true, severity: true, metadataJson: true, createdAt: true },
  });
}

export async function createDomainEventWithReadModel(
  transaction: Prisma.TransactionClient,
  data: Prisma.DomainEventUncheckedCreateInput,
): Promise<CreatedDomainEventRow> {
  return transaction.domainEvent.create({
    data,
    select: { id: true, eventType: true, payloadJson: true, createdAt: true },
  });
}
