import { loadApiEnv } from '@quizmind/config';
import { createPrismaClientOptions, PrismaClient } from '@quizmind/database';

import { AdminLogRepository } from '../logs/admin-log.repository';
import { PlatformSettingsRepository } from '../settings/platform-settings.repository';
import { RetentionSettingsService } from '../settings/retention-settings.service';

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readArg(name: string): string | undefined {
  const item = process.argv.find((value) => value.startsWith(`${name}=`));
  return item?.slice(name.length + 1);
}

async function main() {
  const env = loadApiEnv();
  const prisma = new PrismaClient(createPrismaClientOptions(env.databaseUrl));
  try {
    const repository = new AdminLogRepository(prisma as any);
    const settingsRepository = new PlatformSettingsRepository(prisma as any);
    const retentionSettingsService = new RetentionSettingsService(settingsRepository);
    const execute = hasFlag('--execute');
    const explicitDryRun = hasFlag('--dry-run');
    const includeSensitive = hasFlag('--include-sensitive');
    const limit = Number(readArg('--limit') ?? '1000');
    const dryRun = execute ? false : explicitDryRun ? true : true;

    const policy = await retentionSettingsService.getEffectiveRetentionPolicy();
    const result = await repository.pruneExpiredReadModel({
      dryRun,
      includeSensitive,
      limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1000,
      enabled: policy.adminLogRetentionEnabled,
      sensitiveEnabled: policy.adminLogSensitiveRetentionEnabled,
      retentionDays: {
        activity: policy.adminLogActivityDays,
        domain: policy.adminLogDomainDays,
        system: policy.adminLogSystemDays,
        audit: policy.adminLogAuditDays,
        security: policy.adminLogSecurityDays,
        admin: policy.adminLogAdminDays,
      },
    });

    console.log(
      JSON.stringify(
        {
          mode: dryRun ? 'dry-run' : 'execute',
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
