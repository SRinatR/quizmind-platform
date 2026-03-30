import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { type FeatureFlagStatus } from '@quizmind/contracts';

import { PrismaService } from '../database/prisma.service';

const featureFlagInclude = {
  overrides: true,
} satisfies Prisma.FeatureFlagInclude;

export type FeatureFlagRecord = Prisma.FeatureFlagGetPayload<{
  include: typeof featureFlagInclude;
}>;

export interface ReplaceFeatureFlagDefinitionInput {
  key: string;
  description: string;
  status: FeatureFlagStatus;
  enabled: boolean;
  rolloutPercentage?: number | null;
  minimumExtensionVersion?: string | null;
  allowRoles: string[];
  allowUsers: string[];
  allowWorkspaces: string[];
}

@Injectable()
export class FeatureFlagRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findAll(): Promise<FeatureFlagRecord[]> {
    return this.prisma.featureFlag.findMany({
      include: featureFlagInclude,
      orderBy: [{ key: 'asc' }],
    });
  }

  findByKey(key: string): Promise<FeatureFlagRecord | null> {
    return this.prisma.featureFlag.findUnique({
      where: { key },
      include: featureFlagInclude,
    });
  }

  async replaceDefinition(input: ReplaceFeatureFlagDefinitionInput): Promise<FeatureFlagRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.featureFlag.findUnique({
        where: { key: input.key },
        select: { id: true },
      });

      if (!existing) {
        return null;
      }

      await tx.featureFlag.update({
        where: { id: existing.id },
        data: {
          description: input.description,
          status: input.status,
          enabled: input.enabled,
          rolloutPercentage: input.rolloutPercentage ?? null,
          minimumExtensionVersion: input.minimumExtensionVersion ?? null,
          allowRolesJson: input.allowRoles,
        },
      });

      await tx.featureFlagOverride.deleteMany({
        where: { featureFlagId: existing.id },
      });

      const userOverrideData = input.allowUsers.map((userId) => ({
        featureFlagId: existing.id,
        userId,
        enabled: true,
      }));
      const workspaceOverrideData = input.allowWorkspaces.map((workspaceId) => ({
        featureFlagId: existing.id,
        workspaceId,
        enabled: true,
      }));

      if (userOverrideData.length > 0) {
        await tx.featureFlagOverride.createMany({
          data: userOverrideData,
        });
      }

      if (workspaceOverrideData.length > 0) {
        await tx.featureFlagOverride.createMany({
          data: workspaceOverrideData,
        });
      }

      return tx.featureFlag.findUnique({
        where: { id: existing.id },
        include: featureFlagInclude,
      });
    });
  }
}
