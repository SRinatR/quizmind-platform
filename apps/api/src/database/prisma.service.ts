import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import { createPrismaClientOptions, PrismaClient } from '@quizmind/database';

import { upsertAdminLogEventForCreate } from '../logs/admin-log-event.dual-write';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly env = loadApiEnv();

  constructor() {
    const env = loadApiEnv();

    super(createPrismaClientOptions(env.databaseUrl, env.nodeEnv === 'development' ? ['warn', 'error'] : ['error']));

    this.$use(async (params, next) => {
      const result = await next(params);

      if (params.model === 'AdminLogEvent' || params.action !== 'create') {
        return result;
      }

      try {
        await upsertAdminLogEventForCreate(this, params as any, result as any);
      } catch (error) {
        console.warn('[admin-log-events] failed to upsert read-model event', {
          model: params.model,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return result;
    });
  }

  async onModuleInit() {
    if (this.env.runtimeMode !== 'connected') {
      return;
    }

    await this.$connect();
  }

  async onModuleDestroy() {
    if (this.env.runtimeMode !== 'connected') {
      return;
    }

    await this.$disconnect();
  }
}
