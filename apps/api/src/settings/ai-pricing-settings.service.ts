import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { buildAdminLogEventCreateInput, type Prisma } from '@quizmind/database';
import {
  type PlatformAiPricingPolicy,
  type PlatformAiPricingPolicySnapshot,
  type PlatformAiPricingPolicyUpdateRequest,
} from '@quizmind/contracts';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { PlatformSettingsRepository } from './platform-settings.repository';
import {
  defaultAiPricingPolicy,
  mergeAiPricingPolicy,
  parseAndNormalizeAiPricingPolicy,
  parseAiPricingPolicyPatch,
} from './ai-pricing-policy';

const PLATFORM_AI_PRICING_POLICY_KEY = 'platform.ai_pricing_policy';
const EFFECTIVE_POLICY_CACHE_TTL_MS = 60_000;

@Injectable()
export class AiPricingSettingsService {
  constructor(
    @Inject(PlatformSettingsRepository)
    private readonly settingsRepository: PlatformSettingsRepository,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  private effectivePolicyCache: { value: PlatformAiPricingPolicy; expiresAtMs: number } | null = null;

  private getCachedEffectivePolicy(): PlatformAiPricingPolicy | null {
    const now = Date.now();
    if (!this.effectivePolicyCache || this.effectivePolicyCache.expiresAtMs <= now) {
      return null;
    }
    return this.effectivePolicyCache.value;
  }

  private setCachedEffectivePolicy(policy: PlatformAiPricingPolicy): void {
    this.effectivePolicyCache = {
      value: policy,
      expiresAtMs: Date.now() + EFFECTIVE_POLICY_CACHE_TTL_MS,
    };
  }

  async getEffectivePricingPolicy(): Promise<PlatformAiPricingPolicy> {
    const cached = this.getCachedEffectivePolicy();
    if (cached) return cached;

    try {
      const row = await this.settingsRepository.findByKey(PLATFORM_AI_PRICING_POLICY_KEY);
      const effective = row ? parseAndNormalizeAiPricingPolicy(row.valueJson) : defaultAiPricingPolicy;
      this.setCachedEffectivePolicy(effective);
      return effective;
    } catch {
      this.setCachedEffectivePolicy(defaultAiPricingPolicy);
      return defaultAiPricingPolicy;
    }
  }

  async getPricingPolicy(): Promise<PlatformAiPricingPolicySnapshot> {
    const row = await this.settingsRepository.findByKey(PLATFORM_AI_PRICING_POLICY_KEY);
    if (!row) {
      return {
        policy: defaultAiPricingPolicy,
        updatedAt: null,
        updatedById: null,
      };
    }

    const normalized = parseAndNormalizeAiPricingPolicy(row.valueJson);
    this.setCachedEffectivePolicy(normalized);

    return {
      policy: normalized,
      updatedAt: row.updatedAt.toISOString(),
      updatedById: row.updatedById,
    };
  }

  async updatePricingPolicy(
    session: CurrentSessionSnapshot,
    request?: Partial<PlatformAiPricingPolicyUpdateRequest>,
  ): Promise<PlatformAiPricingPolicySnapshot> {
    let current: PlatformAiPricingPolicySnapshot;
    let patch: PlatformAiPricingPolicyUpdateRequest;
    let nextPolicy: PlatformAiPricingPolicy;
    try {
      current = await this.getPricingPolicy();
      patch = parseAiPricingPolicyPatch(request ?? {});
      nextPolicy = mergeAiPricingPolicy(current.policy, patch);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid AI pricing policy payload.');
    }

    const changedFields = Object.keys(patch).filter((field) => {
      const key = field as keyof PlatformAiPricingPolicy;
      return current.policy[key] !== nextPolicy[key];
    });

    const row = await this.settingsRepository.upsertJson(
      PLATFORM_AI_PRICING_POLICY_KEY,
      nextPolicy as unknown as Prisma.InputJsonValue,
      session.user.id,
    );

    if (changedFields.length > 0) {
      const occurredAt = new Date();
      const sourceRecordId = `${session.user.id}:${occurredAt.toISOString()}:ai-pricing-policy`;
      const metadata: Prisma.InputJsonObject = {
        changedFields,
        before: current.policy as unknown as Prisma.InputJsonValue,
        after: nextPolicy as unknown as Prisma.InputJsonValue,
      };
      try {
        await this.prisma.adminLogEvent.upsert({
          where: { stream_sourceRecordId: { stream: 'audit', sourceRecordId } },
          create: buildAdminLogEventCreateInput({
            stream: 'audit',
            sourceRecordId,
            eventType: 'admin.ai_pricing_policy_updated',
            occurredAt,
            actorId: session.user.id,
            targetType: 'platform_setting',
            targetId: PLATFORM_AI_PRICING_POLICY_KEY,
            metadata: metadata as unknown as Record<string, unknown>,
          }),
          update: buildAdminLogEventCreateInput({
            stream: 'audit',
            sourceRecordId,
            eventType: 'admin.ai_pricing_policy_updated',
            occurredAt,
            actorId: session.user.id,
            targetType: 'platform_setting',
            targetId: PLATFORM_AI_PRICING_POLICY_KEY,
            metadata: metadata as unknown as Record<string, unknown>,
          }),
        });
      } catch (error) {
        console.warn('[ai-pricing-settings] audit log write failed', {
          actorId: session.user.id,
          changedFields,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const normalized = parseAndNormalizeAiPricingPolicy(row.valueJson);
    this.setCachedEffectivePolicy(normalized);

    return {
      policy: normalized,
      updatedAt: row.updatedAt.toISOString(),
      updatedById: row.updatedById,
    };
  }
}
