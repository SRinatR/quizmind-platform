import { loadApiEnv } from '@quizmind/config';
import { createPrismaClientOptions, PrismaClient } from '@quizmind/database';

import { AdminLogBackfillService } from '../logs/admin-log.backfill';

const BATCH_SIZE = Number(process.env.ADMIN_LOG_BACKFILL_BATCH ?? '500');

function readArg(name: string): string | undefined {
  const item = process.argv.find((value) => value.startsWith(`${name}=`));
  return item?.slice(name.length + 1);
}

async function main() {
  const env = loadApiEnv();
  const prisma = new PrismaClient(createPrismaClientOptions(env.databaseUrl));
  try {
    const service = new AdminLogBackfillService(prisma, BATCH_SIZE);
    await service.run({
      stream: (readArg('--stream') as 'audit' | 'activity' | 'security' | 'domain' | 'all' | undefined) ?? 'all',
      ...(readArg('--from') ? { from: new Date(readArg('--from')!) } : {}),
      ...(readArg('--to') ? { to: new Date(readArg('--to')!) } : {}),
    });
  } finally {
    await prisma.$disconnect();
  }
}

void main();
