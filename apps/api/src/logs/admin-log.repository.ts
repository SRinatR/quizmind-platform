import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { type AdminLogSeverityFilter, type AdminLogStreamFilter } from '@quizmind/contracts';

import { PrismaService } from '../database/prisma.service';

const workspaceSelect = {
  id: true,
  slug: true,
  name: true,
} satisfies Prisma.WorkspaceSelect;

const userSelect = {
  id: true,
  email: true,
  displayName: true,
} satisfies Prisma.UserSelect;

const auditLogSelect = {
  id: true,
  workspaceId: true,
  actorId: true,
  action: true,
  targetType: true,
  targetId: true,
  metadataJson: true,
  createdAt: true,
  workspace: {
    select: workspaceSelect,
  },
} satisfies Prisma.AuditLogSelect;

const activityLogSelect = {
  id: true,
  workspaceId: true,
  actorId: true,
  eventType: true,
  metadataJson: true,
  createdAt: true,
  workspace: {
    select: workspaceSelect,
  },
} satisfies Prisma.ActivityLogSelect;

const securityEventSelect = {
  id: true,
  workspaceId: true,
  actorId: true,
  eventType: true,
  severity: true,
  metadataJson: true,
  createdAt: true,
  workspace: {
    select: workspaceSelect,
  },
} satisfies Prisma.SecurityEventSelect;

const domainEventSelect = {
  id: true,
  workspaceId: true,
  eventType: true,
  payloadJson: true,
  createdAt: true,
  workspace: {
    select: workspaceSelect,
  },
} satisfies Prisma.DomainEventSelect;

export type AdminLogAuditRecord = Prisma.AuditLogGetPayload<{
  select: typeof auditLogSelect;
}>;

export type AdminLogActivityRecord = Prisma.ActivityLogGetPayload<{
  select: typeof activityLogSelect;
}>;

export type AdminLogSecurityRecord = Prisma.SecurityEventGetPayload<{
  select: typeof securityEventSelect;
}>;

export type AdminLogDomainRecord = Prisma.DomainEventGetPayload<{
  select: typeof domainEventSelect;
}>;

export type AdminLogActorRecord = Prisma.UserGetPayload<{
  select: typeof userSelect;
}>;

interface ListAdminLogsInput {
  workspaceId?: string;
  stream?: AdminLogStreamFilter;
  severity?: AdminLogSeverityFilter;
  limit?: number;
}

interface ListAdminLogsResult {
  audit: AdminLogAuditRecord[];
  activity: AdminLogActivityRecord[];
  security: AdminLogSecurityRecord[];
  domain: AdminLogDomainRecord[];
  actors: AdminLogActorRecord[];
}

function shouldReadStream(stream: AdminLogStreamFilter | undefined, candidate: Exclude<AdminLogStreamFilter, 'all'>) {
  return !stream || stream === 'all' || stream === candidate;
}

function resolveTake(limit?: number, stream?: AdminLogStreamFilter) {
  const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit as number) : 12;

  return Math.min(Math.max(normalizedLimit * (stream && stream !== 'all' ? 3 : 2), 12), 60);
}

@Injectable()
export class AdminLogRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listRecent(input: ListAdminLogsInput = {}): Promise<ListAdminLogsResult> {
    const take = resolveTake(input.limit, input.stream);
    const workspaceWhere = input.workspaceId ? { workspaceId: input.workspaceId } : {};
    const securityWhere = {
      ...workspaceWhere,
      ...(input.severity && input.severity !== 'all' ? { severity: input.severity } : {}),
    };
    const [audit, activity, security, domain] = await Promise.all([
      shouldReadStream(input.stream, 'audit')
        ? this.prisma.auditLog.findMany({
            where: workspaceWhere,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: auditLogSelect,
          })
        : Promise.resolve([]),
      shouldReadStream(input.stream, 'activity')
        ? this.prisma.activityLog.findMany({
            where: workspaceWhere,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: activityLogSelect,
          })
        : Promise.resolve([]),
      shouldReadStream(input.stream, 'security')
        ? this.prisma.securityEvent.findMany({
            where: securityWhere,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: securityEventSelect,
          })
        : Promise.resolve([]),
      shouldReadStream(input.stream, 'domain')
        ? this.prisma.domainEvent.findMany({
            where: workspaceWhere,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: domainEventSelect,
          })
        : Promise.resolve([]),
    ]);
    const actorIds = Array.from(
      new Set(
        [...audit, ...activity, ...security]
          .map((record) => record.actorId)
          .filter((actorId): actorId is string => Boolean(actorId)),
      ),
    );
    const actors =
      actorIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: {
              id: {
                in: actorIds,
              },
            },
            select: userSelect,
          });

    return {
      audit,
      activity,
      security,
      domain,
      actors,
    };
  }
}
