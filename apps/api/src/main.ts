import 'dotenv/config';
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { createLogEvent } from '@quizmind/logger';
import { loadApiEnv, validateApiEnv } from '@quizmind/config';

import { AppModule } from './app.module';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { RateLimitGuard } from './security/rate-limit.guard';
import { buildCorsOptions } from './security/cors';

async function bootstrap() {
  const env = loadApiEnv();
  const envIssues = validateApiEnv(env);

  if (envIssues.length > 0) {
    throw new Error(`Invalid API environment: ${envIssues.map((issue) => `${issue.key}: ${issue.message}`).join('; ')}`);
  }
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const httpAdapterInstance = app.getHttpAdapter().getInstance() as {
    set?: (name: string, value: unknown) => void;
  };

  httpAdapterInstance.set?.('trust proxy', env.trustProxyHops);
  app.enableCors(buildCorsOptions(env));
  app.useGlobalGuards(app.get(RateLimitGuard));

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
      trustProxyHops: env.trustProxyHops,
    },
  });

  console.log(JSON.stringify(event));
}

void bootstrap();
