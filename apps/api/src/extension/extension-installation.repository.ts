import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const extensionInstallationSelect = {
  id: true,
  userId: true,
  workspaceId: true,
  installationId: true,
  browser: true,
  extensionVersion: true,
  schemaVersion: true,
  capabilitiesJson: true,
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
    return this.prisma.extensionInstallation.findUnique({
      where: {
        installationId,
      },
      select: extensionInstallationSelect,
    });
  }

  upsertBoundInstallation(input: {
    userId: string;
    workspaceId?: string;
    installationId: string;
    browser: string;
    extensionVersion: string;
    schemaVersion: string;
    capabilities: string[];
    lastSeenAt: Date;
  }): Promise<ExtensionInstallationRecord> {
    return this.prisma.extensionInstallation.upsert({
      where: {
        installationId: input.installationId,
      },
      create: {
        userId: input.userId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        installationId: input.installationId,
        browser: input.browser,
        extensionVersion: input.extensionVersion,
        schemaVersion: input.schemaVersion,
        capabilitiesJson: input.capabilities,
        lastSeenAt: input.lastSeenAt,
      },
      update: {
        userId: input.userId,
        workspaceId: input.workspaceId ?? null,
        browser: input.browser,
        extensionVersion: input.extensionVersion,
        schemaVersion: input.schemaVersion,
        capabilitiesJson: input.capabilities,
        lastSeenAt: input.lastSeenAt,
      },
      select: extensionInstallationSelect,
    });
  }
}
