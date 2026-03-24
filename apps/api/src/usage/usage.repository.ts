import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const installationSelect = {
  installationId: true,
  browser: true,
  extensionVersion: true,
  schemaVersion: true,
  capabilitiesJson: true,
  lastSeenAt: true,
} satisfies Prisma.ExtensionInstallationSelect;

const quotaCounterSelect = {
  key: true,
  consumed: true,
  periodStart: true,
  periodEnd: true,
  updatedAt: true,
} satisfies Prisma.QuotaCounterSelect;

const telemetrySelect = {
  id: true,
  eventType: true,
  severity: true,
  payloadJson: true,
  createdAt: true,
  installation: {
    select: {
      installationId: true,
    },
  },
} satisfies Prisma.ExtensionTelemetrySelect;

const activitySelect = {
  id: true,
  actorId: true,
  eventType: true,
  metadataJson: true,
  createdAt: true,
} satisfies Prisma.ActivityLogSelect;

export type WorkspaceUsageInstallationRecord = Prisma.ExtensionInstallationGetPayload<{
  select: typeof installationSelect;
}>;

export type WorkspaceQuotaCounterRecord = Prisma.QuotaCounterGetPayload<{
  select: typeof quotaCounterSelect;
}>;

export type WorkspaceTelemetryRecord = Prisma.ExtensionTelemetryGetPayload<{
  select: typeof telemetrySelect;
}>;

export type WorkspaceActivityRecord = Prisma.ActivityLogGetPayload<{
  select: typeof activitySelect;
}>;

@Injectable()
export class UsageRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listInstallationsByWorkspaceId(workspaceId: string): Promise<WorkspaceUsageInstallationRecord[]> {
    return this.prisma.extensionInstallation.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      select: installationSelect,
    });
  }

  listQuotaCountersByWorkspaceId(workspaceId: string): Promise<WorkspaceQuotaCounterRecord[]> {
    return this.prisma.quotaCounter.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ periodEnd: 'desc' }, { updatedAt: 'desc' }],
      select: quotaCounterSelect,
    });
  }

  listRecentTelemetryByWorkspaceId(
    workspaceId: string,
    limit = 8,
  ): Promise<WorkspaceTelemetryRecord[]> {
    return this.prisma.extensionTelemetry.findMany({
      where: {
        installation: {
          workspaceId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      select: telemetrySelect,
    });
  }

  listRecentActivityByWorkspaceId(workspaceId: string, limit = 8): Promise<WorkspaceActivityRecord[]> {
    return this.prisma.activityLog.findMany({
      where: {
        workspaceId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      select: activitySelect,
    });
  }
}
