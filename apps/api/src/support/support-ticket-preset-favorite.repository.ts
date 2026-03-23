import { Inject, Injectable } from '@nestjs/common';
import { type SupportTicketQueuePreset, supportTicketQueuePresets } from '@quizmind/contracts';

import { PrismaService } from '../database/prisma.service';

const validSupportTicketPresetKeys = new Set<string>(supportTicketQueuePresets);

@Injectable()
export class SupportTicketPresetFavoriteRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listByUserId(userId: string): Promise<SupportTicketQueuePreset[]> {
    const records = await this.prisma.supportTicketPresetFavorite.findMany({
      where: {
        userId,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    return records
      .map((record) => record.presetKey)
      .filter((presetKey): presetKey is SupportTicketQueuePreset => validSupportTicketPresetKeys.has(presetKey));
  }

  async setFavorite(input: {
    userId: string;
    preset: SupportTicketQueuePreset;
    favorite: boolean;
  }): Promise<SupportTicketQueuePreset[]> {
    if (input.favorite) {
      await this.prisma.supportTicketPresetFavorite.upsert({
        where: {
          userId_presetKey: {
            userId: input.userId,
            presetKey: input.preset,
          },
        },
        update: {},
        create: {
          userId: input.userId,
          presetKey: input.preset,
        },
      });
    } else {
      await this.prisma.supportTicketPresetFavorite.deleteMany({
        where: {
          userId: input.userId,
          presetKey: input.preset,
        },
      });
    }

    return this.listByUserId(input.userId);
  }
}
