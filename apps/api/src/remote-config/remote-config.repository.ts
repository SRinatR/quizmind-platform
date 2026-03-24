import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { type RemoteConfigLayer as RemoteConfigLayerDefinition } from '@quizmind/contracts';

import { PrismaService } from '../database/prisma.service';

const remoteConfigVersionInclude = {
  publishedBy: {
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  },
  layers: {
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.RemoteConfigVersionInclude;

const activeRemoteConfigLayerInclude = {
  remoteConfigVersion: true,
} satisfies Prisma.RemoteConfigLayerInclude;

export type RemoteConfigVersionRecord = Prisma.RemoteConfigVersionGetPayload<{
  include: typeof remoteConfigVersionInclude;
}>;

export type ActiveRemoteConfigLayerRecord = Prisma.RemoteConfigLayerGetPayload<{
  include: typeof activeRemoteConfigLayerInclude;
}>;

interface PublishRemoteConfigVersionInput {
  actorId: string;
  layers: RemoteConfigLayerDefinition[];
  versionLabel: string;
  workspaceId?: string;
}

@Injectable()
export class RemoteConfigRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findActiveLayers(workspaceId?: string): Promise<ActiveRemoteConfigLayerRecord[]> {
    const workspacePredicates = workspaceId ? [{ workspaceId: null }, { workspaceId }] : [{ workspaceId: null }];

    return this.prisma.remoteConfigLayer.findMany({
      where: {
        remoteConfigVersion: {
          isActive: true,
          OR: workspacePredicates,
        },
      },
      include: activeRemoteConfigLayerInclude,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findRecentVersions(workspaceId?: string, limit = 12): Promise<RemoteConfigVersionRecord[]> {
    const workspacePredicates = workspaceId ? [{ workspaceId: null }, { workspaceId }] : [{ workspaceId: null }];

    return this.prisma.remoteConfigVersion.findMany({
      where: {
        OR: workspacePredicates,
      },
      include: remoteConfigVersionInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
  }

  async publishVersion(input: PublishRemoteConfigVersionInput): Promise<RemoteConfigVersionRecord> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.remoteConfigVersion.updateMany({
        where: {
          workspaceId: input.workspaceId ?? null,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      return transaction.remoteConfigVersion.create({
        data: {
          workspaceId: input.workspaceId ?? null,
          publishedById: input.actorId,
          versionLabel: input.versionLabel,
          isActive: true,
          layers: {
            create: input.layers.map((layer) => ({
              scope: layer.scope,
              priority: layer.priority,
              ...(layer.conditions ? { conditionsJson: layer.conditions as Prisma.InputJsonValue } : {}),
              valuesJson: layer.values as Prisma.InputJsonValue,
            })),
          },
        },
        include: remoteConfigVersionInclude,
      });
    });
  }

  async activateVersion(versionId: string): Promise<RemoteConfigVersionRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.remoteConfigVersion.findUnique({
        where: {
          id: versionId,
        },
        select: {
          id: true,
          workspaceId: true,
        },
      });

      if (!existing) {
        return null;
      }

      await transaction.remoteConfigVersion.updateMany({
        where: {
          workspaceId: existing.workspaceId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      return transaction.remoteConfigVersion.update({
        where: {
          id: existing.id,
        },
        data: {
          isActive: true,
        },
        include: remoteConfigVersionInclude,
      });
    });
  }
}
