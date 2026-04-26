import { buildAdminLogEventCreateInput, Prisma, type PrismaClient } from '@quizmind/database';

function toMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

async function upsertReadModel(
  transaction: Prisma.TransactionClient,
  stream: 'audit' | 'activity' | 'security' | 'domain',
  sourceRecordId: string,
  create: Prisma.AdminLogEventCreateInput,
) {
  try {
    await transaction.adminLogEvent.upsert({
      where: { stream_sourceRecordId: { stream, sourceRecordId } },
      create,
      update: create,
    });
  } catch (error) {
    console.warn('[admin-log-events] explicit dual-write failed', {
      stream,
      sourceRecordId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function createAuditLogWithReadModel(
  transaction: Prisma.TransactionClient,
  data: Prisma.AuditLogUncheckedCreateInput,
) {
  const row = await transaction.auditLog.create({
    data,
    select: { id: true, action: true, actorId: true, targetType: true, targetId: true, metadataJson: true, createdAt: true },
  });

  await upsertReadModel(
    transaction,
    'audit',
    row.id,
    buildAdminLogEventCreateInput({
      stream: 'audit',
      sourceRecordId: row.id,
      eventType: row.action,
      occurredAt: row.createdAt,
      actorId: row.actorId,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: toMetadata(row.metadataJson),
    }),
  );

  return row;
}

export async function createActivityLogWithReadModel(
  transaction: Prisma.TransactionClient,
  data: Prisma.ActivityLogUncheckedCreateInput,
) {
  const row = await transaction.activityLog.create({
    data,
    select: { id: true, eventType: true, actorId: true, metadataJson: true, createdAt: true },
  });
  await upsertReadModel(
    transaction,
    'activity',
    row.id,
    buildAdminLogEventCreateInput({
      stream: 'activity',
      sourceRecordId: row.id,
      eventType: row.eventType,
      occurredAt: row.createdAt,
      actorId: row.actorId,
      metadata: toMetadata(row.metadataJson),
    }),
  );

  return row;
}

export async function createSecurityEventWithReadModel(
  transaction: Prisma.TransactionClient,
  data: Prisma.SecurityEventUncheckedCreateInput,
) {
  const row = await transaction.securityEvent.create({
    data,
    select: { id: true, eventType: true, actorId: true, severity: true, metadataJson: true, createdAt: true },
  });
  await upsertReadModel(
    transaction,
    'security',
    row.id,
    buildAdminLogEventCreateInput({
      stream: 'security',
      sourceRecordId: row.id,
      eventType: row.eventType,
      occurredAt: row.createdAt,
      actorId: row.actorId,
      severity: row.severity,
      metadata: toMetadata(row.metadataJson),
    }),
  );

  return row;
}

export async function createDomainEventWithReadModel(
  transaction: Prisma.TransactionClient,
  data: Prisma.DomainEventUncheckedCreateInput,
) {
  const row = await transaction.domainEvent.create({
    data,
    select: { id: true, eventType: true, payloadJson: true, createdAt: true },
  });
  await upsertReadModel(
    transaction,
    'domain',
    row.id,
    buildAdminLogEventCreateInput({
      stream: 'domain',
      sourceRecordId: row.id,
      eventType: row.eventType,
      occurredAt: row.createdAt,
      payload: toMetadata(row.payloadJson),
    }),
  );

  return row;
}
