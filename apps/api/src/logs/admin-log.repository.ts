import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { type AdminLogSeverityFilter, type AdminLogStreamFilter } from '@quizmind/contracts';

import { PrismaService } from '../database/prisma.service';

const userSelect = {
  id: true,
  email: true,
  displayName: true,
} satisfies Prisma.UserSelect;

const auditLogSelect = {
  id: true,
  actorId: true,
  action: true,
  targetType: true,
  targetId: true,
  metadataJson: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

const activityLogSelect = {
  id: true,
  actorId: true,
  eventType: true,
  metadataJson: true,
  createdAt: true,
} satisfies Prisma.ActivityLogSelect;

const securityEventSelect = {
  id: true,
  actorId: true,
  eventType: true,
  severity: true,
  metadataJson: true,
  createdAt: true,
} satisfies Prisma.SecurityEventSelect;

const domainEventSelect = {
  id: true,
  eventType: true,
  payloadJson: true,
  createdAt: true,
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

// Number of rows fetched per Prisma query when draining a stream.
// This is an internal transport detail — it does NOT cap the total rows returned.
const DRAIN_BATCH_SIZE = 1_000;

interface ListAdminLogsInput {
  stream?: AdminLogStreamFilter;
  severity?: AdminLogSeverityFilter;
  from?: string;
  to?: string;
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

@Injectable()
export class AdminLogRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Exhaustively reads all rows from a single stream by issuing successive
   * skip/take queries until the stream returns fewer rows than the batch size.
   * This removes any per-stream hard cap while keeping individual DB round-trips
   * bounded to DRAIN_BATCH_SIZE rows.
   */
  private async drainStream<T>(
    fetcher: (skip: number, take: number) => Promise<T[]>,
  ): Promise<T[]> {
    const all: T[] = [];
    let skip = 0;
    while (true) {
      const batch = await fetcher(skip, DRAIN_BATCH_SIZE);
      all.push(...batch);
      if (batch.length < DRAIN_BATCH_SIZE) break;
      skip += batch.length;
    }
    return all;
  }

  async listRecent(input: ListAdminLogsInput = {}): Promise<ListAdminLogsResult> {
    const fromDate = input.from ? new Date(input.from) : undefined;
    const toDate = input.to ? new Date(input.to) : undefined;
    const dateWhere = {
      ...(fromDate && !isNaN(fromDate.getTime()) ? { createdAt: { gte: fromDate } } : {}),
      ...(toDate && !isNaN(toDate.getTime()) ? { createdAt: { lte: toDate } } : {}),
    };
    // Merge date range when both from and to are present
    const timeRange =
      fromDate && !isNaN(fromDate.getTime()) && toDate && !isNaN(toDate.getTime())
        ? { createdAt: { gte: fromDate, lte: toDate } }
        : dateWhere;
    const baseWhere = { ...timeRange };
    const securityWhere = {
      ...baseWhere,
      ...(input.severity && input.severity !== 'all' ? { severity: input.severity } : {}),
    };

    const [audit, activity, security, domain] = await Promise.all([
      shouldReadStream(input.stream, 'audit')
        ? this.drainStream((skip, take) =>
            this.prisma.auditLog.findMany({
              where: baseWhere,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip,
              take,
              select: auditLogSelect,
            }),
          )
        : Promise.resolve([]),
      shouldReadStream(input.stream, 'activity')
        ? this.drainStream((skip, take) =>
            this.prisma.activityLog.findMany({
              where: baseWhere,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip,
              take,
              select: activityLogSelect,
            }),
          )
        : Promise.resolve([]),
      shouldReadStream(input.stream, 'security')
        ? this.drainStream((skip, take) =>
            this.prisma.securityEvent.findMany({
              where: securityWhere,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip,
              take,
              select: securityEventSelect,
            }),
          )
        : Promise.resolve([]),
      shouldReadStream(input.stream, 'domain')
        ? this.drainStream((skip, take) =>
            this.prisma.domainEvent.findMany({
              where: baseWhere,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip,
              take,
              select: domainEventSelect,
            }),
          )
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

  async findOne(compositeId: string): Promise<ListAdminLogsResult | null> {
    const [stream, recordId] = compositeId.split(':');

    if (!stream || !recordId) {
      return null;
    }

    let audit: AdminLogAuditRecord[] = [];
    let activity: AdminLogActivityRecord[] = [];
    let security: AdminLogSecurityRecord[] = [];
    let domain: AdminLogDomainRecord[] = [];

    if (stream === 'audit') {
      const record = await this.prisma.auditLog.findUnique({ where: { id: recordId }, select: auditLogSelect });
      if (record) audit = [record];
    } else if (stream === 'activity') {
      const record = await this.prisma.activityLog.findUnique({ where: { id: recordId }, select: activityLogSelect });
      if (record) activity = [record];
    } else if (stream === 'security') {
      const record = await this.prisma.securityEvent.findUnique({ where: { id: recordId }, select: securityEventSelect });
      if (record) security = [record];
    } else if (stream === 'domain') {
      const record = await this.prisma.domainEvent.findUnique({ where: { id: recordId }, select: domainEventSelect });
      if (record) domain = [record];
    } else {
      return null;
    }

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
            where: { id: { in: actorIds } },
            select: userSelect,
          });

    const hasRecords = audit.length > 0 || activity.length > 0 || security.length > 0 || domain.length > 0;
    if (!hasRecords) return null;

    return { audit, activity, security, domain, actors };
  }
}
