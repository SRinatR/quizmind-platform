import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const extensionInstallationSessionInclude = {
  installation: {
    select: {
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
    },
  },
} satisfies Prisma.ExtensionInstallationSessionInclude;

export type ExtensionInstallationSessionRecord = Prisma.ExtensionInstallationSessionGetPayload<{
  include: typeof extensionInstallationSessionInclude;
}>;

const activeExtensionInstallationSessionSelect = {
  id: true,
  extensionInstallationId: true,
  createdAt: true,
  expiresAt: true,
} satisfies Prisma.ExtensionInstallationSessionSelect;

export type ActiveExtensionInstallationSessionRecord = Prisma.ExtensionInstallationSessionGetPayload<{
  select: typeof activeExtensionInstallationSessionSelect;
}>;

const recentExtensionInstallationSessionSelect = {
  id: true,
  extensionInstallationId: true,
  userId: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
} satisfies Prisma.ExtensionInstallationSessionSelect;

export type RecentExtensionInstallationSessionRecord = Prisma.ExtensionInstallationSessionGetPayload<{
  select: typeof recentExtensionInstallationSessionSelect;
}>;

@Injectable()
export class ExtensionInstallationSessionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(input: {
    extensionInstallationId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<ExtensionInstallationSessionRecord> {
    return this.prisma.extensionInstallationSession.create({
      data: input,
      include: extensionInstallationSessionInclude,
    });
  }

  listActiveByInstallationIds(
    installationIds: string[],
    now = new Date(),
  ): Promise<ActiveExtensionInstallationSessionRecord[]> {
    if (installationIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.extensionInstallationSession.findMany({
      where: {
        extensionInstallationId: {
          in: installationIds,
        },
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
      select: activeExtensionInstallationSessionSelect,
    });
  }

  listRecentByInstallationRecordId(
    extensionInstallationId: string,
    limit = 12,
  ): Promise<RecentExtensionInstallationSessionRecord[]> {
    return this.prisma.extensionInstallationSession.findMany({
      where: {
        extensionInstallationId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: recentExtensionInstallationSessionSelect,
    });
  }

  findActiveByTokenHash(tokenHash: string, now = new Date()): Promise<ExtensionInstallationSessionRecord | null> {
    return this.prisma.extensionInstallationSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      include: extensionInstallationSessionInclude,
    });
  }

  async revokeActiveByInstallationId(installationId: string, revokedAt = new Date()): Promise<number> {
    const result = await this.prisma.extensionInstallationSession.updateMany({
      where: {
        extensionInstallationId: installationId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });

    return result.count;
  }

  revoke(id: string, revokedAt = new Date()): Promise<ExtensionInstallationSessionRecord> {
    return this.prisma.extensionInstallationSession.update({
      where: {
        id,
      },
      data: {
        revokedAt,
      },
      include: extensionInstallationSessionInclude,
    });
  }
}
