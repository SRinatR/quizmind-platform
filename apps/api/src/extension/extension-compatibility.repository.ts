import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

export type ExtensionCompatibilityRuleRecord = Prisma.ExtensionCompatibilityRuleGetPayload<Record<string, never>>;

export interface CreateExtensionCompatibilityRuleInput {
  minimumVersion: string;
  recommendedVersion: string;
  supportedSchemaVersions: Prisma.InputJsonValue;
  requiredCapabilities?: Prisma.InputJsonValue | null;
  resultStatus: 'supported' | 'supported_with_warnings' | 'deprecated' | 'unsupported';
  reason?: string | null;
}

@Injectable()
export class ExtensionCompatibilityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findLatest(): Promise<ExtensionCompatibilityRuleRecord | null> {
    return this.prisma.extensionCompatibilityRule.findFirst({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  findRecent(limit = 10): Promise<ExtensionCompatibilityRuleRecord[]> {
    return this.prisma.extensionCompatibilityRule.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  create(input: CreateExtensionCompatibilityRuleInput): Promise<ExtensionCompatibilityRuleRecord> {
    return this.prisma.extensionCompatibilityRule.create({
      data: {
        minimumVersion: input.minimumVersion,
        recommendedVersion: input.recommendedVersion,
        supportedSchemaVersions: input.supportedSchemaVersions,
        requiredCapabilities:
          input.requiredCapabilities === undefined
            ? undefined
            : input.requiredCapabilities === null
              ? Prisma.JsonNull
              : input.requiredCapabilities,
        resultStatus: input.resultStatus,
        reason: input.reason ?? null,
      },
    });
  }
}
