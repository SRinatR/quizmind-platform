import { loadApiEnv } from '@quizmind/config';
import { createPrismaClientOptions, PrismaClient } from '@quizmind/database';

import { AdminLogBackfillService } from '../logs/admin-log.backfill';

async function main() {
  const env = loadApiEnv();
  const prisma = new PrismaClient(createPrismaClientOptions(env.databaseUrl));

  try {
    const service = new AdminLogBackfillService(prisma);
    const result = await service.verifyCounts();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
