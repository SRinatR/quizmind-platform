import 'dotenv/config';
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { createLogEvent } from '@quizmind/logger';
import { loadApiEnv } from '@quizmind/config';

import { AppModule } from './app.module';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

async function bootstrap() {
  const env = loadApiEnv();
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  app.useGlobalInterceptors(app.get(RequestLoggingInterceptor));

  await app.listen(env.port);

  const event = createLogEvent({
    eventId: `api:start:${Date.now()}`,
    eventType: 'platform.api_started',
    actorId: 'api',
    actorType: 'system',
    targetType: 'service',
    targetId: 'quizmind-api',
    occurredAt: new Date().toISOString(),
    category: 'system',
    severity: 'info',
    status: 'success',
    metadata: {
      apiUrl: env.apiUrl,
      appUrl: env.appUrl,
      port: env.port,
      runtimeMode: env.runtimeMode,
    },
  });

  console.log(JSON.stringify(event));
}

void bootstrap();
