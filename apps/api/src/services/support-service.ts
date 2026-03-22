import {
  type SupportImpersonationRequest,
  type SupportImpersonationResult,
} from '@quizmind/contracts';
import {
  createAuditLogEvent,
  createSecurityLogEvent,
} from '@quizmind/logger';

export function startSupportImpersonation(
  request: SupportImpersonationRequest,
): {
  result: SupportImpersonationResult;
  auditLog: ReturnType<typeof createAuditLogEvent>;
  securityLog: ReturnType<typeof createSecurityLogEvent>;
} {
  const createdAt = new Date().toISOString();
  const result: SupportImpersonationResult = {
    impersonationSessionId: `${request.supportActorId}:${request.targetUserId}:${createdAt}`,
    supportActorId: request.supportActorId,
    targetUserId: request.targetUserId,
    workspaceId: request.workspaceId,
    reason: request.reason,
    createdAt,
  };

  return {
    result,
    auditLog: createAuditLogEvent({
      eventId: `support-impersonation:${result.impersonationSessionId}`,
      eventType: 'support.impersonation_started',
      actorId: request.supportActorId,
      actorType: 'user',
      workspaceId: request.workspaceId,
      targetType: 'user',
      targetId: request.targetUserId,
      occurredAt: createdAt,
      severity: 'info',
      status: 'success',
      metadata: {
        reason: request.reason,
      },
    }),
    securityLog: createSecurityLogEvent({
      eventId: `support-impersonation-security:${result.impersonationSessionId}`,
      eventType: 'security.impersonation_started',
      actorId: request.supportActorId,
      actorType: 'user',
      workspaceId: request.workspaceId,
      targetType: 'user',
      targetId: request.targetUserId,
      occurredAt: createdAt,
      severity: 'warn',
      status: 'success',
      metadata: {
        reason: request.reason,
      },
    }),
  };
}
