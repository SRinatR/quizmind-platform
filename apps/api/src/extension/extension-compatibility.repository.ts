import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

export type ExtensionCompatibilityRuleRecord = Prisma.ExtensionCompatibilityRuleGetPayload<Record<string, never>>;

@Injectable()
export class ExtensionCompatibilityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findLatest(): Promise<ExtensionCompatibilityRuleRecord | null> {
    return this.prisma.extensionCompatibilityRule.findFirst({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
}
