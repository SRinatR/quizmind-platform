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

const aiRequestSelect = {
  id: true,
  userId: true,
  installationId: true,
  provider: true,
  model: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  keySource: true,
  status: true,
  errorCode: true,
  durationMs: true,
  requestMetadata: true,
  occurredAt: true,
} satisfies Prisma.AiRequestSelect;

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

export type WorkspaceAiRequestRecord = Prisma.AiRequestGetPayload<{
  select: typeof aiRequestSelect;
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

  listTelemetryHistoryByWorkspaceId(input: {
    workspaceId: string;
    limit: number;
    eventType?: string;
    installationId?: string;
  }): Promise<WorkspaceTelemetryRecord[]> {
    return this.prisma.extensionTelemetry.findMany({
      where: {
        ...(input.eventType ? { eventType: input.eventType } : {}),
        installation: {
          workspaceId: input.workspaceId,
          ...(input.installationId ? { installationId: input.installationId } : {}),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: input.limit,
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

  listActivityHistoryByWorkspaceId(input: {
    workspaceId: string;
    limit: number;
    eventType?: string;
    actorId?: string;
  }): Promise<WorkspaceActivityRecord[]> {
    return this.prisma.activityLog.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.eventType ? { eventType: input.eventType } : {}),
        ...(input.actorId ? { actorId: input.actorId } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: input.limit,
      select: activitySelect,
    });
  }

  listRecentAiRequestsByWorkspaceId(workspaceId: string, limit = 8): Promise<WorkspaceAiRequestRecord[]> {
    return this.prisma.aiRequest.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: aiRequestSelect,
    });
  }

  listAiRequestHistoryByWorkspaceId(input: {
    workspaceId: string;
    limit: number;
    actorId?: string;
    installationId?: string;
  }): Promise<WorkspaceAiRequestRecord[]> {
    return this.prisma.aiRequest.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.actorId ? { userId: input.actorId } : {}),
        ...(input.installationId ? { installationId: input.installationId } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: input.limit,
      select: aiRequestSelect,
    });
  }

  listInstallationsByUserId(userId: string): Promise<WorkspaceUsageInstallationRecord[]> {
    return this.prisma.extensionInstallation.findMany({
      where: { userId },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      select: installationSelect,
    });
  }

  listRecentTelemetryByUserId(userId: string, limit = 8): Promise<WorkspaceTelemetryRecord[]> {
    return this.prisma.extensionTelemetry.findMany({
      where: { installation: { userId } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: telemetrySelect,
    });
  }

  listTelemetryHistoryByUserId(input: {
    userId: string;
    limit: number;
    eventType?: string;
    installationId?: string;
  }): Promise<WorkspaceTelemetryRecord[]> {
    return this.prisma.extensionTelemetry.findMany({
      where: {
        ...(input.eventType ? { eventType: input.eventType } : {}),
        installation: {
          userId: input.userId,
          ...(input.installationId ? { installationId: input.installationId } : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      select: telemetrySelect,
    });
  }

  listRecentActivityByUserId(userId: string, limit = 8): Promise<WorkspaceActivityRecord[]> {
    return this.prisma.activityLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: activitySelect,
    });
  }

  listActivityHistoryByUserId(input: {
    userId: string;
    limit: number;
    eventType?: string;
    actorId?: string;
  }): Promise<WorkspaceActivityRecord[]> {
    return this.prisma.activityLog.findMany({
      where: {
        actorId: input.actorId ?? input.userId,
        ...(input.eventType ? { eventType: input.eventType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      select: activitySelect,
    });
  }

  listRecentAiRequestsByUserId(userId: string, limit = 8): Promise<WorkspaceAiRequestRecord[]> {
    return this.prisma.aiRequest.findMany({
      where: { userId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: aiRequestSelect,
    });
  }

  listAiRequestHistoryByUserId(input: {
    userId: string;
    limit: number;
    actorId?: string;
    installationId?: string;
  }): Promise<WorkspaceAiRequestRecord[]> {
    return this.prisma.aiRequest.findMany({
      where: {
        userId: input.actorId ?? input.userId,
        ...(input.installationId ? { installationId: input.installationId } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: input.limit,
      select: aiRequestSelect,
    });
  }
}
