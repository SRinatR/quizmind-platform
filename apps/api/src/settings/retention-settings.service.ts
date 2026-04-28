import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { buildAdminLogEventCreateInput, type Prisma } from '@quizmind/database';
import { type PlatformRetentionPolicy, type PlatformRetentionPolicySnapshot, type PlatformRetentionPolicyUpdateRequest } from '@quizmind/contracts';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { PlatformSettingsRepository } from './platform-settings.repository';
import { defaultRetentionPolicy, mergeRetentionPolicy, parseAndNormalizeRetentionPolicy, parseRetentionPolicyPatch } from './retention-policy';

const PLATFORM_RETENTION_POLICY_KEY = 'platform.retention_policy';

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

@Injectable()
export class RetentionSettingsService {
  constructor(
    @Inject(PlatformSettingsRepository)
    private readonly settingsRepository: PlatformSettingsRepository,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  private readEnvFallbackPolicy(): PlatformRetentionPolicy {
    return {
      ...defaultRetentionPolicy,
      adminLogRetentionEnabled: readBooleanEnv('ADMIN_LOG_RETENTION_ENABLED', defaultRetentionPolicy.adminLogRetentionEnabled),
      adminLogActivityDays: readPositiveIntEnv('ADMIN_LOG_RETENTION_ACTIVITY_DAYS', defaultRetentionPolicy.adminLogActivityDays),
      adminLogDomainDays: readPositiveIntEnv('ADMIN_LOG_RETENTION_DOMAIN_DAYS', defaultRetentionPolicy.adminLogDomainDays),
      adminLogSystemDays: readPositiveIntEnv('ADMIN_LOG_RETENTION_SYSTEM_DAYS', defaultRetentionPolicy.adminLogSystemDays),
      adminLogAuditDays: readPositiveIntEnv('ADMIN_LOG_RETENTION_AUDIT_DAYS', defaultRetentionPolicy.adminLogAuditDays),
      adminLogSecurityDays: readPositiveIntEnv('ADMIN_LOG_RETENTION_SECURITY_DAYS', defaultRetentionPolicy.adminLogSecurityDays),
      adminLogAdminDays: readPositiveIntEnv('ADMIN_LOG_RETENTION_ADMIN_DAYS', defaultRetentionPolicy.adminLogAdminDays),
      adminLogSensitiveRetentionEnabled: readBooleanEnv('ADMIN_LOG_RETENTION_SENSITIVE_ENABLED', defaultRetentionPolicy.adminLogSensitiveRetentionEnabled),
    };
  }

  async getEffectiveRetentionPolicy(): Promise<PlatformRetentionPolicy> {
    const fallback = this.readEnvFallbackPolicy();
    try {
      const row = await this.settingsRepository.findByKey(PLATFORM_RETENTION_POLICY_KEY);
      if (!row) return fallback;
      return parseAndNormalizeRetentionPolicy(row.valueJson);
    } catch {
      return fallback;
    }
  }

  async getRetentionPolicy(): Promise<PlatformRetentionPolicySnapshot> {
    const fallback = this.readEnvFallbackPolicy();
    const row = await this.settingsRepository.findByKey(PLATFORM_RETENTION_POLICY_KEY);
    if (!row) {
      return {
        policy: fallback,
        updatedAt: null,
        updatedById: null,
      };
    }

    return {
      policy: parseAndNormalizeRetentionPolicy(row.valueJson),
      updatedAt: row.updatedAt.toISOString(),
      updatedById: row.updatedById,
    };
  }

  async updateRetentionPolicy(
    session: CurrentSessionSnapshot,
    request?: Partial<PlatformRetentionPolicyUpdateRequest>,
  ): Promise<PlatformRetentionPolicySnapshot> {
    try {
      const current = await this.getRetentionPolicy();
      const patch = parseRetentionPolicyPatch(request ?? {});
      const nextPolicy = mergeRetentionPolicy(current.policy, patch);
      const changedFields = Object.keys(patch).filter((key) => {
        const typedKey = key as keyof PlatformRetentionPolicy;
        return current.policy[typedKey] !== nextPolicy[typedKey];
      });
      const row = await this.settingsRepository.upsertJson(
        PLATFORM_RETENTION_POLICY_KEY,
        nextPolicy as unknown as Prisma.InputJsonValue,
        session.user.id,
      );
      if (changedFields.length > 0) {
        const occurredAt = new Date();
        const sourceRecordId = `${session.user.id}:${occurredAt.toISOString()}`;
        const metadata: Prisma.InputJsonObject = {
          summary: 'Updated retention policy settings',
          actorEmail: session.user.email,
          actorDisplayName: session.user.displayName ?? null,
          changedFields,
          before: current.policy as unknown as Prisma.InputJsonValue,
          after: nextPolicy as unknown as Prisma.InputJsonValue,
        };
        await this.prisma.adminLogEvent.upsert({
          where: { stream_sourceRecordId: { stream: 'audit', sourceRecordId } },
          create: buildAdminLogEventCreateInput({
            stream: 'audit',
            sourceRecordId,
            eventType: 'admin.retention_policy_updated',
            occurredAt,
            actorId: session.user.id,
            targetType: 'platform_setting',
            targetId: PLATFORM_RETENTION_POLICY_KEY,
            metadata: metadata as unknown as Record<string, unknown>,
          }),
          update: buildAdminLogEventCreateInput({
            stream: 'audit',
            sourceRecordId,
            eventType: 'admin.retention_policy_updated',
            occurredAt,
            actorId: session.user.id,
            targetType: 'platform_setting',
            targetId: PLATFORM_RETENTION_POLICY_KEY,
            metadata: metadata as unknown as Record<string, unknown>,
          }),
        });
      }
      return {
        policy: parseAndNormalizeRetentionPolicy(row.valueJson),
        updatedAt: row.updatedAt.toISOString(),
        updatedById: row.updatedById,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid retention policy payload.';
      throw new BadRequestException(message);
    }
  }
}
