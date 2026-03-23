import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const featureFlagInclude = {
  overrides: true,
} satisfies Prisma.FeatureFlagInclude;

export type FeatureFlagRecord = Prisma.FeatureFlagGetPayload<{
  include: typeof featureFlagInclude;
}>;

@Injectable()
export class FeatureFlagRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findAll(): Promise<FeatureFlagRecord[]> {
    return this.prisma.featureFlag.findMany({
      include: featureFlagInclude,
      orderBy: [{ key: 'asc' }],
    });
  }
}
