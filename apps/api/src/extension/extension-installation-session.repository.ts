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
