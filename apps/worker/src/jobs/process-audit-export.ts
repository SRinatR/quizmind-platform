import { type AuditExportJobPayload } from '@quizmind/contracts';
import { createLogEvent } from '@quizmind/logger';

export interface AuditExportJobResult {
  processed: boolean;
  logEvent: ReturnType<typeof createLogEvent>;
}

export function processAuditExportJob(payload: AuditExportJobPayload): AuditExportJobResult {
  return {
    processed: true,
    logEvent: createLogEvent({
      eventId: `audit-export:${payload.exportType}:${payload.fileName}:${payload.exportedAt}`,
      eventType: 'audit.export_processed',
      actorId: payload.requestedByUserId,
      actorType: 'user',
      workspaceId: payload.workspaceId,
      targetType: payload.exportType === 'usage' ? 'usage_export' : 'audit_log_export',
      targetId: payload.fileName,
      occurredAt: payload.exportedAt,
      category: 'domain',
      severity: 'info',
      status: 'success',
      metadata:
        payload.exportType === 'usage'
          ? {
              format: payload.format,
              scope: payload.scope,
              contentType: payload.contentType,
            }
          : {
              format: payload.format,
              itemCount: payload.itemCount,
              contentType: payload.contentType,
            },
    }),
  };
}
