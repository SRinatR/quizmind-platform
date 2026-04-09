import {
  type SupportImpersonationActor,
  supportTicketOwnershipFilters,
  supportTicketQueuePresetDefinitions,
  supportTicketStatusFilters,
  ticketStatuses,
  type SupportImpersonationEndResult,
  type SupportImpersonationHistorySnapshot,
  type SupportImpersonationRequest,
  type SupportImpersonationResult,
  type SupportImpersonationSessionSnapshot,
  type SupportTicketQueueEntry,
  type SupportTicketQueueFilters,
  type SupportTicketQueuePreset,
  type SupportTicketQueueSnapshot,
  type SupportTicketStatusFilter,
  type SupportTicketTimelineEntry,
  type TicketStatus,
} from '@quizmind/contracts';
import {
  createAuditLogEvent,
  createSecurityLogEvent,
} from '@quizmind/logger';

import { type RecentSupportImpersonationSessionRecord } from '../support/support-impersonation.repository';
import { type RecentSupportTicketRecord, type SupportTicketTimelineRecord } from '../support/support-ticket.repository';

const validTicketStatuses = new Set<string>(ticketStatuses);
const validSupportTicketStatusFilters = new Set<string>(supportTicketStatusFilters);
const validSupportTicketOwnershipFilters = new Set<string>(supportTicketOwnershipFilters);
const supportTicketPresetDefinitions = new Map(
  supportTicketQueuePresetDefinitions.map((preset) => [preset.key, preset] as const),
);
const activeSupportTicketStatuses: TicketStatus[] = ['open', 'in_progress'];

interface TimelineActorLike {
  id: string;
  email: string;
  displayName?: string | null;
}

interface SupportTicketTimelineMetadata {
  summary?: string;
  actorEmail?: string;
  actorDisplayName?: string | null;
  previousStatus?: string;
  nextStatus?: string;
  previousAssignee?: Partial<TimelineActorLike> | null;
  nextAssignee?: Partial<TimelineActorLike> | null;
  handoffNote?: string | null;
}

const defaultSupportTicketQueueFilters: SupportTicketQueueFilters = {
  status: 'active',
  ownership: 'all',
  limit: 8,
  timelineLimit: 4,
};

export interface SupportTicketQueueFilterInput {
  preset?: string;
  status?: string;
  ownership?: string;
  search?: string;
  limit?: number;
  timelineLimit?: number;
}

function clampInteger(input: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(input)) {
    return fallback;
  }

  const normalized = Math.trunc(input ?? fallback);

  return Math.min(Math.max(normalized, min), max);
}

export function normalizeSupportTicketQueueFilters(
  input?: SupportTicketQueueFilterInput,
): SupportTicketQueueFilters {
  const presetDefinition =
    input?.preset && supportTicketPresetDefinitions.has(input.preset as SupportTicketQueuePreset)
      ? supportTicketPresetDefinitions.get(input.preset as SupportTicketQueuePreset)
      : undefined;
  const baseFilters = presetDefinition?.filters ?? defaultSupportTicketQueueFilters;
  const normalizedStatus =
    input?.status && validSupportTicketStatusFilters.has(input.status)
      ? (input.status as SupportTicketStatusFilter)
      : baseFilters.status;
  const normalizedOwnership =
    input?.ownership && validSupportTicketOwnershipFilters.has(input.ownership)
      ? (input.ownership as SupportTicketQueueFilters['ownership'])
      : baseFilters.ownership;
  const normalizedSearch = input?.search?.trim() || undefined;
  const normalizedLimit = clampInteger(input?.limit, baseFilters.limit, 1, 24);
  const normalizedTimelineLimit = clampInteger(input?.timelineLimit, baseFilters.timelineLimit, 1, 12);
  const matchedPresetKey =
    presetDefinition &&
    normalizedStatus === presetDefinition.filters.status &&
    normalizedOwnership === presetDefinition.filters.ownership &&
    normalizedSearch === presetDefinition.filters.search &&
    normalizedLimit === presetDefinition.filters.limit &&
    normalizedTimelineLimit === presetDefinition.filters.timelineLimit
      ? presetDefinition.key
      : undefined;

  return {
    ...(matchedPresetKey ? { preset: matchedPresetKey } : {}),
    status: normalizedStatus,
    ownership: normalizedOwnership,
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
    limit: normalizedLimit,
    timelineLimit: normalizedTimelineLimit,
  };
}

export function resolveSupportTicketStatuses(filter: SupportTicketStatusFilter): TicketStatus[] | undefined {
  if (filter === 'all') {
    return undefined;
  }

  if (filter === 'active') {
    return activeSupportTicketStatuses;
  }

  return [filter];
}

function matchesSupportTicketSearch(ticket: SupportTicketQueueEntry, search: string): boolean {
  const haystack = [
    ticket.subject,
    ticket.body,
    ticket.requester.email,
    ticket.requester.displayName,
    ticket.workspace?.name,
    ticket.workspace?.slug,
    ticket.assignedTo?.email,
    ticket.assignedTo?.displayName,
    ticket.handoffNote,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

export function filterSupportTicketQueueEntries(
  items: SupportTicketQueueEntry[],
  filters: SupportTicketQueueFilters,
  currentUserId?: string | null,
): SupportTicketQueueEntry[] {
  const allowedStatuses = resolveSupportTicketStatuses(filters.status);

  return items
    .filter((ticket) => (allowedStatuses ? allowedStatuses.includes(ticket.status) : true))
    .filter((ticket) => {
      if (filters.ownership === 'mine') {
        return Boolean(currentUserId && ticket.assignedTo?.id === currentUserId);
      }

      if (filters.ownership === 'unassigned') {
        return !ticket.assignedTo;
      }

      return true;
    })
    .filter((ticket) => (filters.search ? matchesSupportTicketSearch(ticket, filters.search) : true))
    .slice(0, filters.limit)
    .map((ticket) => ({
      ...ticket,
      ...(ticket.timeline ? { timeline: ticket.timeline.slice(0, filters.timelineLimit) } : {}),
    }));
}

function normalizeTimelineActor(input: Partial<TimelineActorLike> | null | undefined): SupportImpersonationActor | null {
  if (!input?.id || !input.email) {
    return null;
  }

  return {
    id: input.id,
    email: input.email,
    ...(input.displayName ? { displayName: input.displayName } : {}),
  };
}

function readTimelineMetadata(record: SupportTicketTimelineRecord): SupportTicketTimelineMetadata {
  return record.metadataJson ? (record.metadataJson as SupportTicketTimelineMetadata) : {};
}

function normalizeTimelineStatus(input: string | undefined): SupportTicketTimelineEntry['nextStatus'] | undefined {
  if (!input || !validTicketStatuses.has(input)) {
    return undefined;
  }

  return input as SupportTicketTimelineEntry['nextStatus'];
}

function buildSupportTicketTimelineSummary(input: {
  previousStatus: string;
  nextStatus: string;
  previousAssignee: TimelineActorLike | null;
  nextAssignee: TimelineActorLike | null;
  previousHandoffNote?: string | null;
  nextHandoffNote?: string | null;
}): string {
  const changes: string[] = [];

  if (input.previousAssignee?.id !== input.nextAssignee?.id) {
    if (!input.nextAssignee) {
      changes.push('returned the ticket to the shared queue');
    } else if (!input.previousAssignee) {
      changes.push(`assigned the ticket to ${input.nextAssignee.displayName || input.nextAssignee.email}`);
    } else {
      changes.push(`reassigned the ticket to ${input.nextAssignee.displayName || input.nextAssignee.email}`);
    }
  }

  if (input.previousStatus !== input.nextStatus) {
    changes.push(`changed status from ${input.previousStatus.replace('_', ' ')} to ${input.nextStatus.replace('_', ' ')}`);
  }

  if (input.previousHandoffNote !== input.nextHandoffNote) {
    changes.push(input.nextHandoffNote ? 'updated the handoff note' : 'cleared the handoff note');
  }

  return changes.length > 0 ? changes.join('; ') : 'reviewed the ticket workflow';
}

export function createSupportTicketWorkflowAuditLog(input: {
  supportTicketId: string;
  ticketSubject: string;
  actor: TimelineActorLike;
  previousStatus: string;
  nextStatus: string;
  previousAssignee: TimelineActorLike | null;
  nextAssignee: TimelineActorLike | null;
  previousHandoffNote?: string | null;
  nextHandoffNote?: string | null;
  occurredAt?: string;
}) {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const summary = buildSupportTicketTimelineSummary({
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    previousAssignee: input.previousAssignee,
    nextAssignee: input.nextAssignee,
    previousHandoffNote: input.previousHandoffNote,
    nextHandoffNote: input.nextHandoffNote,
  });

  return createAuditLogEvent({
    eventId: `support-ticket:${input.supportTicketId}:${occurredAt}`,
    eventType: 'support.ticket_workflow_updated',
    actorId: input.actor.id,
    actorType: 'user',
    targetType: 'support_ticket',
    targetId: input.supportTicketId,
    occurredAt,
    severity: 'info',
    status: 'success',
    metadata: {
      summary,
      ticketSubject: input.ticketSubject,
      actorEmail: input.actor.email,
      ...(input.actor.displayName ? { actorDisplayName: input.actor.displayName } : {}),
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
      previousAssignee: input.previousAssignee,
      nextAssignee: input.nextAssignee,
      ...(input.nextHandoffNote ? { handoffNote: input.nextHandoffNote } : {}),
    },
  });
}

export function mapSupportTicketTimelineRecordToEntry(record: SupportTicketTimelineRecord): SupportTicketTimelineEntry {
  const metadata = readTimelineMetadata(record);
  const actor = normalizeTimelineActor({
    id: record.actorId ?? 'unknown-actor',
    email: metadata.actorEmail ?? 'unknown@quizmind.dev',
    displayName: metadata.actorDisplayName,
  }) ?? {
    id: record.actorId ?? 'unknown-actor',
    email: metadata.actorEmail ?? 'unknown@quizmind.dev',
  };
  const previousAssignee = normalizeTimelineActor(metadata.previousAssignee);
  const nextAssignee = normalizeTimelineActor(metadata.nextAssignee);

  return {
    id: record.id,
    eventType: record.action,
    summary: metadata.summary ?? record.action,
    occurredAt: record.createdAt.toISOString(),
    actor,
    ...(normalizeTimelineStatus(metadata.previousStatus) ? { previousStatus: normalizeTimelineStatus(metadata.previousStatus) } : {}),
    ...(normalizeTimelineStatus(metadata.nextStatus) ? { nextStatus: normalizeTimelineStatus(metadata.nextStatus) } : {}),
    ...(previousAssignee ? { previousAssignee } : {}),
    ...(nextAssignee ? { nextAssignee } : {}),
    ...(metadata.handoffNote ? { handoffNote: metadata.handoffNote } : {}),
  };
}

export function groupSupportTicketTimelineEntries(
  records: SupportTicketTimelineRecord[],
): Map<string, SupportTicketTimelineEntry[]> {
  const grouped = new Map<string, SupportTicketTimelineEntry[]>();

  for (const record of records) {
    const current = grouped.get(record.targetId) ?? [];
    current.push(mapSupportTicketTimelineRecordToEntry(record));
    grouped.set(record.targetId, current);
  }

  return grouped;
}

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
  reason: string;
  closeReason?: string;
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
      targetType: 'user',
      targetId: input.targetUserId,
      occurredAt: endedAt,
      severity: 'info',
      status: 'success',
      metadata: {
        impersonationSessionId: input.impersonationSessionId,
        reason: input.reason,
        ...(input.closeReason ? { closeReason: input.closeReason } : {}),
      },
    }),
    securityLog: createSecurityLogEvent({
      eventId: `support-impersonation-ended-security:${input.impersonationSessionId}`,
      eventType: 'security.impersonation_ended',
      actorId: input.endedById,
      actorType: 'user',
      targetType: 'user',
      targetId: input.targetUserId,
      occurredAt: endedAt,
      severity: 'warn',
      status: 'success',
      metadata: {
        impersonationSessionId: input.impersonationSessionId,
        reason: input.reason,
        ...(input.closeReason ? { closeReason: input.closeReason } : {}),
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
    ...(record.closeReason ? { closeReason: record.closeReason } : {}),
  };
}

export function mapSupportImpersonationRecordToEndResult(
  record: RecentSupportImpersonationSessionRecord,
): SupportImpersonationEndResult {
  return {
    impersonationSessionId: record.id,
    targetUserId: record.targetUser.id,
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
    ...(record.closeReason ? { closeReason: record.closeReason } : {}),
  };
}

export function mapSupportTicketRecordToSnapshot(
  record: RecentSupportTicketRecord,
  timelineEntries?: SupportTicketTimelineEntry[],
): SupportTicketQueueEntry {
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
    ...(record.assignedTo
      ? {
          assignedTo: {
            id: record.assignedTo.id,
            email: record.assignedTo.email,
            ...(record.assignedTo.displayName ? { displayName: record.assignedTo.displayName } : {}),
          },
        }
      : {}),
    ...(record.workspace
      ? {
          workspace: {
            id: record.workspace.id,
            slug: record.workspace.slug,
            name: record.workspace.name,
          },
        }
      : {}),
    ...(record.handoffNote ? { handoffNote: record.handoffNote } : {}),
    ...(timelineEntries && timelineEntries.length > 0 ? { timeline: timelineEntries } : {}),
  };
}

export function buildSupportTicketQueueSnapshot(input: {
  personaKey: string;
  accessDecision: SupportTicketQueueSnapshot['accessDecision'];
  items: SupportTicketQueueEntry[];
  permissions: string[];
  filters: SupportTicketQueueFilters;
  favoritePresets: SupportTicketQueueSnapshot['favoritePresets'];
}): SupportTicketQueueSnapshot {
  return {
    personaKey: input.personaKey,
    accessDecision: input.accessDecision,
    items: input.items,
    permissions: input.permissions,
    filters: input.filters,
    favoritePresets: input.favoritePresets,
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
