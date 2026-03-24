import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../../database/prisma.service';
import { BaseRepository } from './base.repository';

export type PasswordResetRecord = Prisma.PasswordResetGetPayload<Record<string, never>>;

export interface CreatePasswordResetInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class PasswordResetRepository extends BaseRepository<
  PasswordResetRecord,
  CreatePasswordResetInput,
  Prisma.PasswordResetUpdateInput
> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma);
  }

  findById(id: string): Promise<PasswordResetRecord | null> {
    return this.prisma.passwordReset.findUnique({
      where: { id },
    });
  }

  findActiveByTokenHash(tokenHash: string, now = new Date()): Promise<PasswordResetRecord | null> {
    return this.prisma.passwordReset.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: now,
        },
      },
    });
  }

  create(data: CreatePasswordResetInput): Promise<PasswordResetRecord> {
    return this.prisma.passwordReset.create({
      data,
    });
  }

  update(id: string, data: Prisma.PasswordResetUpdateInput): Promise<PasswordResetRecord> {
    return this.prisma.passwordReset.update({
      where: { id },
      data,
    });
  }

  markUsed(id: string, usedAt = new Date()): Promise<PasswordResetRecord> {
    return this.update(id, {
      usedAt,
    });
  }

  async invalidateActiveForUser(userId: string, usedAt = new Date()): Promise<number> {
    const result = await this.prisma.passwordReset.updateMany({
      where: {
        userId,
        usedAt: null,
        expiresAt: {
          gt: usedAt,
        },
      },
      data: {
        usedAt,
      },
    });

    return result.count;
  }
}
