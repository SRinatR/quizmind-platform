import { buildAdminLogEventCreateInput, Prisma, type PrismaClient } from '@quizmind/database';
import { enrichSearchTextWithActorIdentity, resolveActorIdentities } from './admin-log-actor-enrichment';
import { collectAdminAiRequestCandidateIds } from './admin-log-ai-request-candidates';
import { buildAdminAiLogPatchFromAiRequestEvent, normalizeAdminAiStatus } from './admin-log-ai-sync';

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


function toAdminLogEventUpdateInput(data: Prisma.AdminLogEventCreateInput): Prisma.AdminLogEventUpdateInput {
  const { stream: _stream, sourceRecordId: _sourceRecordId, ...mutable } = data;
  return mutable;
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
  severity: 'debug' | 'info' | 'warn' | 'error';
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
      const aiRequestCandidates = collectAdminAiRequestCandidateIds({
        targetType: event.data.targetType,
        targetId: event.data.targetId,
        sourceRecordId: event.sourceRecordId,
        metadata: toMetadata(event.data.metadataJson),
        payload: toMetadata(event.data.payloadJson),
      });
      const aiRequests = aiRequestCandidates.length > 0 && (prisma as { aiRequestEvent?: PrismaClient['aiRequestEvent'] }).aiRequestEvent
        ? await prisma.aiRequestEvent.findMany({
            where: { id: { in: aiRequestCandidates } },
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
      const aiRequestById = new Map(aiRequests.map((request) => [request.id, request]));
      const aiRequest = aiRequestCandidates
        .map((candidate) => aiRequestById.get(candidate))
        .find(Boolean);

      const baseData: Prisma.AdminLogEventCreateInput = {
        ...event.data,
        ...(aiRequest ? { targetType: event.data.targetType ?? 'ai_request', targetId: event.data.targetId ?? aiRequest.id } : {}),
        provider: event.data.provider ?? aiRequest?.provider ?? undefined,
        model: event.data.model ?? aiRequest?.model ?? undefined,
        status: event.data.status ?? normalizeAdminAiStatus(aiRequest?.status),
        durationMs: event.data.durationMs ?? aiRequest?.durationMs ?? undefined,
        costUsd: event.data.costUsd ?? aiRequest?.estimatedCostUsd ?? undefined,
        promptTokens: event.data.promptTokens ?? aiRequest?.promptTokens ?? undefined,
        completionTokens: event.data.completionTokens ?? aiRequest?.completionTokens ?? undefined,
        totalTokens: event.data.totalTokens ?? aiRequest?.totalTokens ?? undefined,
        searchText: [event.data.searchText, aiRequest?.promptExcerpt].filter(Boolean).join(' ').toLowerCase(),
      };
      const createData = enrichReadModelActorFields(baseData, event.data.actorId ? actorDirectory.get(event.data.actorId) : undefined);
      const updateData = toAdminLogEventUpdateInput(createData);
      await prisma.adminLogEvent.upsert({
        where: { stream_sourceRecordId: { stream: event.stream, sourceRecordId: event.sourceRecordId } },
        create: createData,
        update: updateData,
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
