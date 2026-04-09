import { Prisma, PrismaClient } from '@quizmind/database';

import {
  type UsageInstallationSnapshot,
  type UsageProcessingRepository,
} from '../jobs/process-usage-event';

const installationSelect = {
  id: true,
  installationId: true,
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
        ...(input.browser ? { browser: input.browser } : {}),
        ...(input.extensionVersion ? { extensionVersion: input.extensionVersion } : {}),
        ...(input.schemaVersion ? { schemaVersion: input.schemaVersion } : {}),
        ...(input.capabilities ? { capabilitiesJson: input.capabilities } : {}),
        lastSeenAt: input.lastSeenAt,
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
}
