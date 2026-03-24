import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../../database/prisma.service';
import { BaseRepository } from './base.repository';
import { authUserInclude } from './user.repository';

const authSessionInclude = {
  user: {
    include: authUserInclude,
  },
} satisfies Prisma.SessionInclude;

export type AuthSessionRecord = Prisma.SessionGetPayload<{
  include: typeof authSessionInclude;
}>;

export interface CreateSessionInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  browser?: string;
  deviceName?: string;
}

@Injectable()
export class SessionRepository extends BaseRepository<AuthSessionRecord, CreateSessionInput, Prisma.SessionUpdateInput> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma);
  }

  findById(id: string): Promise<AuthSessionRecord | null> {
    return this.prisma.session.findUnique({
      where: { id },
      include: authSessionInclude,
    });
  }

  findActiveByTokenHash(tokenHash: string, now = new Date()): Promise<AuthSessionRecord | null> {
    return this.prisma.session.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      include: authSessionInclude,
    });
  }

  listActiveByUserId(userId: string, now = new Date()): Promise<AuthSessionRecord[]> {
    return this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      include: authSessionInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  create(data: CreateSessionInput): Promise<AuthSessionRecord> {
    return this.prisma.session.create({
      data,
      include: authSessionInclude,
    });
  }

  update(id: string, data: Prisma.SessionUpdateInput): Promise<AuthSessionRecord> {
    return this.prisma.session.update({
      where: { id },
      data,
      include: authSessionInclude,
    });
  }

  async revoke(id: string, revokedAt = new Date()): Promise<AuthSessionRecord> {
    return this.update(id, { revokedAt });
  }

  async revokeAllForUser(userId: string, revokedAt = new Date()): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });

    return result.count;
  }

  async cleanExpired(referenceTime = new Date()): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        revokedAt: null,
        expiresAt: {
          lt: referenceTime,
        },
      },
      data: {
        revokedAt: referenceTime,
      },
    });

    return result.count;
  }
}
