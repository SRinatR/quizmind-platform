import { Prisma, type PrismaClient } from '@quizmind/database';

export interface AdminAiRequestProjection {
  id: string;
  provider: string | null;
  model: string | null;
  durationMs: number | null;
  estimatedCostUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  promptExcerpt?: string | null;
  status: string | null;
}

export function normalizeAdminAiStatus(status: string | null | undefined): 'success' | 'failure' | undefined {
  if (status === 'success') return 'success';
  if (status === 'error' || status === 'failed' || status === 'failure' || status === 'quota_exceeded' || status === 'timeout') {
    return 'failure';
  }
  return undefined;
}

export function buildAdminAiLogPatchFromAiRequestEvent(
  aiRequest: AdminAiRequestProjection,
): Prisma.AdminLogEventUpdateManyMutationInput {
  return {
    targetType: 'ai_request',
    targetId: aiRequest.id,
    provider: aiRequest.provider,
    model: aiRequest.model,
    status: normalizeAdminAiStatus(aiRequest.status) ?? null,
    durationMs: aiRequest.durationMs,
    costUsd: aiRequest.estimatedCostUsd,
    promptTokens: aiRequest.promptTokens,
    completionTokens: aiRequest.completionTokens,
    totalTokens: aiRequest.totalTokens,
  };
}

export function buildAdminAiLogSyncWhere(aiRequestEventId: string): Prisma.AdminLogEventWhereInput {
  const id = aiRequestEventId.trim();
  const aiAliasWhere: Prisma.AdminLogEventWhereInput = {
    OR: [
      { targetType: 'ai_request', targetId: id },
      { metadataJson: { path: ['aiRequestEventId'], equals: id } },
      { metadataJson: { path: ['requestId'], equals: id } },
      { metadataJson: { path: ['aiRequestId'], equals: id } },
      { metadataJson: { path: ['requestMetadata', 'aiRequestEventId'], equals: id } },
      { metadataJson: { path: ['requestMetadata', 'requestId'], equals: id } },
      { metadataJson: { path: ['requestMetadata', 'aiRequestId'], equals: id } },
      { payloadJson: { path: ['aiRequestEventId'], equals: id } },
      { payloadJson: { path: ['requestId'], equals: id } },
      { payloadJson: { path: ['aiRequestId'], equals: id } },
      { payloadJson: { path: ['requestMetadata', 'aiRequestEventId'], equals: id } },
      { payloadJson: { path: ['requestMetadata', 'requestId'], equals: id } },
      { payloadJson: { path: ['requestMetadata', 'aiRequestId'], equals: id } },
      { sourceRecordId: id },
    ],
  };
  return {
    AND: [
      {
        OR: [
          { category: 'ai' },
          { eventType: { in: ['ai.proxy.completed', 'ai.proxy.failed', 'ai.proxy.quota_exceeded', 'ai.proxy.timeout'] } },
        ],
      },
      aiAliasWhere,
    ],
  };
}

export async function syncAdminAiLogEventsFromAiRequestEvent(
  prisma: Pick<PrismaClient, 'adminLogEvent'>,
  aiRequest: AdminAiRequestProjection,
): Promise<number> {
  const where = buildAdminAiLogSyncWhere(aiRequest.id);
  const data = buildAdminAiLogPatchFromAiRequestEvent(aiRequest);
  const result = await prisma.adminLogEvent.updateMany({ where, data });
  return result.count;
}
