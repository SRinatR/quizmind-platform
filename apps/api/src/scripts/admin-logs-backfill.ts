import { loadApiEnv } from '@quizmind/config';
import { createPrismaClientOptions, PrismaClient } from '@quizmind/database';

import { AdminLogBackfillService } from '../logs/admin-log.backfill';

const BATCH_SIZE = Number(process.env.ADMIN_LOG_BACKFILL_BATCH ?? '500');

async function main() {
  const env = loadApiEnv();
  const prisma = new PrismaClient(createPrismaClientOptions(env.databaseUrl));
  try {
    const service = new AdminLogBackfillService(prisma, BATCH_SIZE);
    await service.run();
  } finally {
    await prisma.$disconnect();
  }
}

void main();
