import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../../database/prisma.service';
import { BaseRepository } from './base.repository';

export type EmailVerificationRecord = Prisma.EmailVerificationGetPayload<Record<string, never>>;

export interface CreateEmailVerificationInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class EmailVerificationRepository extends BaseRepository<
  EmailVerificationRecord,
  CreateEmailVerificationInput,
  Prisma.EmailVerificationUpdateInput
> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma);
  }

  findById(id: string): Promise<EmailVerificationRecord | null> {
    return this.prisma.emailVerification.findUnique({
      where: { id },
    });
  }

  findActiveByTokenHash(tokenHash: string, now = new Date()): Promise<EmailVerificationRecord | null> {
    return this.prisma.emailVerification.findFirst({
      where: {
        tokenHash,
        verifiedAt: null,
        expiresAt: {
          gt: now,
        },
      },
    });
  }

  create(data: CreateEmailVerificationInput): Promise<EmailVerificationRecord> {
    return this.prisma.emailVerification.create({
      data,
    });
  }

  update(id: string, data: Prisma.EmailVerificationUpdateInput): Promise<EmailVerificationRecord> {
    return this.prisma.emailVerification.update({
      where: { id },
      data,
    });
  }

  markVerified(id: string, verifiedAt = new Date()): Promise<EmailVerificationRecord> {
    return this.update(id, {
      verifiedAt,
    });
  }
}
