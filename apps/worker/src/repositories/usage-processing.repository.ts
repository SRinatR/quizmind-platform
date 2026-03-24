import { Prisma, PrismaClient } from '@quizmind/database';

import {
  type UsageInstallationSnapshot,
  type UsageProcessingRepository,
  type UsageQuotaCounterSnapshot,
} from '../jobs/process-usage-event';

const installationSelect = {
  id: true,
  installationId: true,
  workspaceId: true,
  browser: true,
  extensionVersion: true,
  schemaVersion: true,
  capabilitiesJson: true,
  lastSeenAt: true,
} as const;

type InstallationRecord = Prisma.ExtensionInstallationGetPayload<{
  select: typeof installationSelect;
}>;

function normalizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function mapInstallationRecord(record: InstallationRecord): UsageInstallationSnapshot {
  return {
    id: record.id,
    installationId: record.installationId,
    workspaceId: record.workspaceId,
    browser: record.browser,
    extensionVersion: record.extensionVersion,
    schemaVersion: record.schemaVersion,
    capabilities: normalizeCapabilities(record.capabilitiesJson),
    lastSeenAt: record.lastSeenAt,
  };
}

export class WorkerUsageProcessingRepository implements UsageProcessingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findInstallationByInstallationId(installationId: string): Promise<UsageInstallationSnapshot | null> {
    const record = await this.prisma.extensionInstallation.findUnique({
      where: {
        installationId,
      },
      select: installationSelect,
    });

    return record ? mapInstallationRecord(record) : null;
  }

  async touchInstallation(input: {
    installationId: string;
    workspaceId?: string;
    browser?: string;
    extensionVersion?: string;
    schemaVersion?: string;
    capabilities?: string[];
    lastSeenAt: Date;
  }): Promise<void> {
    await this.prisma.extensionInstallation.update({
      where: {
        installationId: input.installationId,
      },
      data: {
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.browser ? { browser: input.browser } : {}),
        ...(input.extensionVersion ? { extensionVersion: input.extensionVersion } : {}),
        ...(input.schemaVersion ? { schemaVersion: input.schemaVersion } : {}),
        ...(input.capabilities ? { capabilitiesJson: input.capabilities } : {}),
        lastSeenAt: input.lastSeenAt,
      },
    });
  }

  async findUsageLimit(workspaceId: string, key: string): Promise<number | undefined> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId,
      },
      orderBy: [{ currentPeriodEnd: 'desc' }, { createdAt: 'desc' }],
      include: {
        plan: {
          include: {
            entitlements: true,
          },
        },
        workspace: {
          include: {
            entitlementOverrides: true,
          },
        },
      },
    });

    if (!subscription) {
      return undefined;
    }

    const override = subscription.workspace.entitlementOverrides.find((entry) => entry.key === key);

    if (override) {
      if (!override.enabled) {
        return 0;
      }

      return override.limitValue ?? undefined;
    }

    const planEntitlement = subscription.plan.entitlements.find((entry) => entry.key === key);

    if (!planEntitlement) {
      return undefined;
    }

    if (!planEntitlement.enabled) {
      return 0;
    }

    return planEntitlement.limitValue ?? undefined;
  }

  findActiveQuotaCounter(
    workspaceId: string,
    key: string,
    occurredAt: Date,
  ): Promise<UsageQuotaCounterSnapshot | null> {
    return this.prisma.quotaCounter.findFirst({
      where: {
        workspaceId,
        key,
        periodStart: {
          lte: occurredAt,
        },
        periodEnd: {
          gt: occurredAt,
        },
      },
      orderBy: [{ periodEnd: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  saveQuotaCounter(input: {
    workspaceId: string;
    key: string;
    consumed: number;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<UsageQuotaCounterSnapshot> {
    return this.prisma.quotaCounter.upsert({
      where: {
        workspaceId_key_periodStart_periodEnd: {
          workspaceId: input.workspaceId,
          key: input.key,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        },
      },
      update: {
        consumed: input.consumed,
      },
      create: {
        workspaceId: input.workspaceId,
        key: input.key,
        consumed: input.consumed,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    });
  }

  createTelemetry(input: {
    extensionInstallationId: string;
    eventType: string;
    severity: 'debug' | 'info' | 'warn' | 'error';
    payloadJson: Record<string, unknown>;
    createdAt: Date;
  }): Promise<{ id: string }> {
    return this.prisma.extensionTelemetry.create({
      data: {
        extensionInstallationId: input.extensionInstallationId,
        eventType: input.eventType,
        severity: input.severity,
        payloadJson: input.payloadJson as Prisma.InputJsonValue,
        createdAt: input.createdAt,
      },
      select: {
        id: true,
      },
    });
  }

  createActivityLog(input: {
    workspaceId: string;
    eventType: string;
    metadataJson: Record<string, unknown>;
    createdAt: Date;
  }): Promise<{ id: string }> {
    return this.prisma.activityLog.create({
      data: {
        workspaceId: input.workspaceId,
        eventType: input.eventType,
        metadataJson: input.metadataJson as Prisma.InputJsonValue,
        createdAt: input.createdAt,
      },
      select: {
        id: true,
      },
    });
  }
}
