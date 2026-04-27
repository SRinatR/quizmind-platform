import { loadApiEnv } from '@quizmind/config';
import { createPrismaClientOptions, PrismaClient } from '@quizmind/database';
import { AdminLogRepairService } from '../logs/admin-log.repair';

async function main() {
  const env = loadApiEnv();
  const prisma = new PrismaClient(createPrismaClientOptions(env.databaseUrl));
  try {
    const batchSizeRaw = Number(process.env.BATCH_SIZE ?? '250');
    const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? Math.floor(batchSizeRaw) : 250;
    const service = new AdminLogRepairService(prisma, batchSize);
    const result = await service.repairReadModel();
    console.log('[admin-log-events] repair complete', result);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
