import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import { PrismaClient } from '@quizmind/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly env = loadApiEnv();

  constructor() {
    const env = loadApiEnv();

    super({
      datasources: {
        db: {
          url: env.databaseUrl,
        },
      },
      log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
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
