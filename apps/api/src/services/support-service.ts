import {
  type SupportImpersonationEndResult,
  type SupportImpersonationHistorySnapshot,
  type SupportImpersonationRequest,
  type SupportImpersonationResult,
  type SupportImpersonationSessionSnapshot,
  type SupportTicketQueueEntry,
  type SupportTicketQueueSnapshot,
} from '@quizmind/contracts';
import {
  createAuditLogEvent,
  createSecurityLogEvent,
} from '@quizmind/logger';

import { type RecentSupportImpersonationSessionRecord } from '../support/support-impersonation.repository';
import { type RecentSupportTicketRecord } from '../support/support-ticket.repository';

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
    ...(request.supportTicketId
      ? {
          supportTicket: {
            id: request.supportTicketId,
            subject: 'Linked support ticket',
            status: 'in_progress',
          },
        }
      : {}),
    ...(request.operatorNote ? { operatorNote: request.operatorNote } : {}),
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
        ...(request.supportTicketId ? { supportTicketId: request.supportTicketId } : {}),
        ...(request.operatorNote ? { operatorNote: request.operatorNote } : {}),
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
        ...(request.supportTicketId ? { supportTicketId: request.supportTicketId } : {}),
        ...(request.operatorNote ? { operatorNote: request.operatorNote } : {}),
      },
    }),
  };
}

export function endSupportImpersonation(input: {
  impersonationSessionId: string;
  endedById: string;
  targetUserId: string;
  workspaceId?: string;
  reason: string;
}): {
  endedAt: string;
  auditLog: ReturnType<typeof createAuditLogEvent>;
  securityLog: ReturnType<typeof createSecurityLogEvent>;
} {
  const endedAt = new Date().toISOString();

  return {
    endedAt,
    auditLog: createAuditLogEvent({
      eventId: `support-impersonation-ended:${input.impersonationSessionId}`,
      eventType: 'support.impersonation_ended',
      actorId: input.endedById,
      actorType: 'user',
      workspaceId: input.workspaceId,
      targetType: 'user',
      targetId: input.targetUserId,
      occurredAt: endedAt,
      severity: 'info',
      status: 'success',
      metadata: {
        impersonationSessionId: input.impersonationSessionId,
        reason: input.reason,
      },
    }),
    securityLog: createSecurityLogEvent({
      eventId: `support-impersonation-ended-security:${input.impersonationSessionId}`,
      eventType: 'security.impersonation_ended',
      actorId: input.endedById,
      actorType: 'user',
      workspaceId: input.workspaceId,
      targetType: 'user',
      targetId: input.targetUserId,
      occurredAt: endedAt,
      severity: 'warn',
      status: 'success',
      metadata: {
        impersonationSessionId: input.impersonationSessionId,
        reason: input.reason,
      },
    }),
  };
}

export function mapSupportImpersonationRecordToSnapshot(
  record: RecentSupportImpersonationSessionRecord,
): SupportImpersonationSessionSnapshot {
  return {
    impersonationSessionId: record.id,
    supportActor: {
      id: record.supportActor.id,
      email: record.supportActor.email,
      ...(record.supportActor.displayName ? { displayName: record.supportActor.displayName } : {}),
    },
    targetUser: {
      id: record.targetUser.id,
      email: record.targetUser.email,
      ...(record.targetUser.displayName ? { displayName: record.targetUser.displayName } : {}),
    },
    ...(record.workspace
      ? {
          workspace: {
            id: record.workspace.id,
            slug: record.workspace.slug,
            name: record.workspace.name,
          },
        }
      : {}),
    ...(record.supportTicket
      ? {
          supportTicket: {
            id: record.supportTicket.id,
            subject: record.supportTicket.subject,
            status: record.supportTicket.status,
          },
        }
      : {}),
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
    endedAt: record.endedAt?.toISOString() ?? null,
    ...(record.operatorNote ? { operatorNote: record.operatorNote } : {}),
  };
}

export function mapSupportImpersonationRecordToEndResult(
  record: RecentSupportImpersonationSessionRecord,
): SupportImpersonationEndResult {
  return {
    impersonationSessionId: record.id,
    targetUserId: record.targetUser.id,
    ...(record.workspace ? { workspaceId: record.workspace.id } : {}),
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
    endedAt: (record.endedAt ?? record.createdAt).toISOString(),
    ...(record.supportTicket
      ? {
          supportTicket: {
            id: record.supportTicket.id,
            subject: record.supportTicket.subject,
            status: record.supportTicket.status,
          },
        }
      : {}),
    ...(record.operatorNote ? { operatorNote: record.operatorNote } : {}),
  };
}

export function mapSupportTicketRecordToSnapshot(record: RecentSupportTicketRecord): SupportTicketQueueEntry {
  return {
    id: record.id,
    subject: record.subject,
    body: record.body,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    requester: {
      id: record.requester.id,
      email: record.requester.email,
      ...(record.requester.displayName ? { displayName: record.requester.displayName } : {}),
    },
    ...(record.workspace
      ? {
          workspace: {
            id: record.workspace.id,
            slug: record.workspace.slug,
            name: record.workspace.name,
          },
        }
      : {}),
  };
}

export function buildSupportTicketQueueSnapshot(input: {
  personaKey: string;
  accessDecision: SupportTicketQueueSnapshot['accessDecision'];
  items: SupportTicketQueueEntry[];
  permissions: string[];
}): SupportTicketQueueSnapshot {
  return {
    personaKey: input.personaKey,
    accessDecision: input.accessDecision,
    items: input.items,
    permissions: input.permissions,
  };
}

export function buildSupportImpersonationHistorySnapshot(input: {
  personaKey: string;
  accessDecision: SupportImpersonationHistorySnapshot['accessDecision'];
  items: SupportImpersonationSessionSnapshot[];
  permissions: string[];
}): SupportImpersonationHistorySnapshot {
  return {
    personaKey: input.personaKey,
    accessDecision: input.accessDecision,
    items: input.items,
    permissions: input.permissions,
  };
}
