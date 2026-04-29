import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class UserBillingOverrideRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getOverrideForUser(userId: string) {
    return this.prisma.userBillingOverride.findUnique({ where: { userId } });
  }

  async updateOverride(userId: string, patch: { aiPlatformFeeExempt?: boolean; aiMarkupPercentOverride?: number | null; reason: string }, actorId?: string) {
    const reason = patch.reason.trim();
    if (reason.length < 5 || reason.length > 500) throw new Error('reason length must be between 5 and 500.');
    if (patch.aiMarkupPercentOverride !== undefined && patch.aiMarkupPercentOverride !== null && (!Number.isFinite(patch.aiMarkupPercentOverride) || patch.aiMarkupPercentOverride < 0 || patch.aiMarkupPercentOverride > 500)) throw new Error('aiMarkupPercentOverride must be between 0 and 500.');
    return this.prisma.userBillingOverride.upsert({
      where: { userId },
      create: { userId, aiPlatformFeeExempt: patch.aiPlatformFeeExempt ?? false, aiMarkupPercentOverride: patch.aiMarkupPercentOverride ?? null, reason, createdById: actorId, updatedById: actorId },
      update: { ...(patch.aiPlatformFeeExempt !== undefined ? { aiPlatformFeeExempt: patch.aiPlatformFeeExempt } : {}), ...(patch.aiMarkupPercentOverride !== undefined ? { aiMarkupPercentOverride: patch.aiMarkupPercentOverride } : {}), reason, updatedById: actorId },
    });
  }

  async deleteOverride(userId: string, _actorId?: string) {
    await this.prisma.userBillingOverride.deleteMany({ where: { userId } });
  }
}
