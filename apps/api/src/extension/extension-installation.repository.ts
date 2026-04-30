import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import type { ExtensionDeviceMetadata } from '@quizmind/contracts';

import { PrismaService } from '../database/prisma.service';

const extensionInstallationSelect = {
  id: true,
  userId: true,
  installationId: true,
  browser: true,
  extensionVersion: true,
  schemaVersion: true,
  capabilitiesJson: true,
  deviceLabel: true,
  platform: true,
  osName: true,
  osVersion: true,
  browserName: true,
  browserVersion: true,
  userAgent: true,
  createdAt: true,
  updatedAt: true,
  lastSeenAt: true,
} satisfies Prisma.ExtensionInstallationSelect;

export type ExtensionInstallationRecord = Prisma.ExtensionInstallationGetPayload<{
  select: typeof extensionInstallationSelect;
}>;

@Injectable()
export class ExtensionInstallationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findByInstallationId(installationId: string): Promise<ExtensionInstallationRecord | null> {
    return this.prisma.extensionInstallation.findUnique({ where: { installationId }, select: extensionInstallationSelect });
  }

  listAll(): Promise<ExtensionInstallationRecord[]> {
    return this.prisma.extensionInstallation.findMany({ orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }], select: extensionInstallationSelect });
  }

  listByUserId(userId: string): Promise<ExtensionInstallationRecord[]> {
    return this.prisma.extensionInstallation.findMany({ where: { userId }, orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }], select: extensionInstallationSelect });
  }

  upsertBoundInstallation(input: {
    userId: string;
    installationId: string;
    browser: string;
    extensionVersion: string;
    schemaVersion: string;
    capabilities: string[];
    lastSeenAt: Date;
    metadata?: ExtensionDeviceMetadata;
  }): Promise<ExtensionInstallationRecord> {
    const metadata = input.metadata ?? {};

    return this.prisma.extensionInstallation.upsert({
      where: { installationId: input.installationId },
      create: {
        userId: input.userId,
        installationId: input.installationId,
        browser: input.browser,
        extensionVersion: input.extensionVersion,
        schemaVersion: input.schemaVersion,
        capabilitiesJson: input.capabilities,
        lastSeenAt: input.lastSeenAt,
        ...metadata,
      },
      update: {
        userId: input.userId,
        browser: input.browser,
        extensionVersion: input.extensionVersion,
        schemaVersion: input.schemaVersion,
        capabilitiesJson: input.capabilities,
        lastSeenAt: input.lastSeenAt,
        ...(metadata.deviceLabel !== undefined ? { deviceLabel: metadata.deviceLabel } : {}),
        ...(metadata.platform !== undefined ? { platform: metadata.platform } : {}),
        ...(metadata.osName !== undefined ? { osName: metadata.osName } : {}),
        ...(metadata.osVersion !== undefined ? { osVersion: metadata.osVersion } : {}),
        ...(metadata.browserName !== undefined ? { browserName: metadata.browserName } : {}),
        ...(metadata.browserVersion !== undefined ? { browserVersion: metadata.browserVersion } : {}),
        ...(metadata.userAgent !== undefined ? { userAgent: metadata.userAgent } : {}),
      },
      select: extensionInstallationSelect,
    });
  }
}
