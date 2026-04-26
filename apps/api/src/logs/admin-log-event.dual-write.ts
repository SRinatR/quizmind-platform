import { buildAdminLogEventCreateInput, type PrismaClient } from '@quizmind/database';

interface MiddlewareParams {
  model?: string;
  action: string;
  args: { data: Record<string, any> };
}

export async function upsertAdminLogEventForCreate(
  prisma: Pick<PrismaClient, 'adminLogEvent'>,
  params: MiddlewareParams,
  result: { id?: string } | null | undefined,
): Promise<void> {
  if (!result?.id) return;
  if (params.action !== 'create') return;

  if (params.model === 'AuditLog') {
    const upsertData = buildAdminLogEventCreateInput({
      stream: 'audit',
      sourceRecordId: result.id,
      eventType: params.args.data.action,
      occurredAt: params.args.data.createdAt ?? new Date(),
      actorId: params.args.data.actorId,
      targetType: params.args.data.targetType,
      targetId: params.args.data.targetId,
      metadata: params.args.data.metadataJson,
    });
    await prisma.adminLogEvent.upsert({
      where: { stream_sourceRecordId: { stream: 'audit', sourceRecordId: result.id } },
      create: upsertData,
      update: upsertData,
    });
    return;
  }

  if (params.model === 'ActivityLog') {
    const upsertData = buildAdminLogEventCreateInput({
      stream: 'activity',
      sourceRecordId: result.id,
      eventType: params.args.data.eventType,
      occurredAt: params.args.data.createdAt ?? new Date(),
      actorId: params.args.data.actorId,
      metadata: params.args.data.metadataJson,
    });
    await prisma.adminLogEvent.upsert({
      where: { stream_sourceRecordId: { stream: 'activity', sourceRecordId: result.id } },
      create: upsertData,
      update: upsertData,
    });
    return;
  }

  if (params.model === 'SecurityEvent') {
    const upsertData = buildAdminLogEventCreateInput({
      stream: 'security',
      sourceRecordId: result.id,
      eventType: params.args.data.eventType,
      occurredAt: params.args.data.createdAt ?? new Date(),
      actorId: params.args.data.actorId,
      severity: params.args.data.severity,
      metadata: params.args.data.metadataJson,
    });
    await prisma.adminLogEvent.upsert({
      where: { stream_sourceRecordId: { stream: 'security', sourceRecordId: result.id } },
      create: upsertData,
      update: upsertData,
    });
    return;
  }

  if (params.model === 'DomainEvent') {
    const upsertData = buildAdminLogEventCreateInput({
      stream: 'domain',
      sourceRecordId: result.id,
      eventType: params.args.data.eventType,
      occurredAt: params.args.data.createdAt ?? new Date(),
      payload: params.args.data.payloadJson,
    });
    await prisma.adminLogEvent.upsert({
      where: { stream_sourceRecordId: { stream: 'domain', sourceRecordId: result.id } },
      create: upsertData,
      update: upsertData,
    });
  }
}
