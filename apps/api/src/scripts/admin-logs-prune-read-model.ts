import { loadApiEnv } from '@quizmind/config';
import { createPrismaClientOptions, PrismaClient } from '@quizmind/database';

import { AdminLogRepository } from '../logs/admin-log.repository';

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
    const execute = hasFlag('--execute');
    const explicitDryRun = hasFlag('--dry-run');
    const includeSensitive = hasFlag('--include-sensitive');
    const limit = Number(readArg('--limit') ?? '1000');
    const dryRun = execute ? false : explicitDryRun ? true : true;

    const result = await repository.pruneExpiredReadModel({
      dryRun,
      includeSensitive,
      limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1000,
    });

    console.log(
      JSON.stringify(
        {
          mode: dryRun ? 'dry-run' : 'execute',
          includeSensitive,
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
