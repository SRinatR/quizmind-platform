import { Inject, Injectable } from '@nestjs/common';
import { type Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

export interface PlatformSettingRecord {
  key: string;
  valueJson: Prisma.JsonValue;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PlatformSettingsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByKey(key: string): Promise<PlatformSettingRecord | null> {
    return this.prisma.platformSetting.findUnique({
      where: { key },
    });
  }

  async upsertJson(key: string, valueJson: Prisma.InputJsonValue, updatedById?: string): Promise<PlatformSettingRecord> {
    return this.prisma.platformSetting.upsert({
      where: { key },
      create: {
        key,
        valueJson,
        updatedById: updatedById ?? null,
      },
      update: {
        valueJson,
        updatedById: updatedById ?? null,
      },
    });
  }
}
