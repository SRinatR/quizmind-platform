import 'dotenv/config';

import { Queue } from 'bullmq';
import { loadWorkerEnv } from '@quizmind/config';
import { platformQueues } from '@quizmind/contracts';
import { createLogEvent } from '@quizmind/logger';
import IORedis from 'ioredis';

import { processUsageEvent } from './jobs/process-usage-event';
import { propagateRemoteConfigPublish } from './jobs/publish-remote-config';
import { resetQuotaCounter } from './jobs/reset-quota-counter';

async function bootstrap() {
  const env = loadWorkerEnv();
  const startedAt = new Date().toISOString();
  const redisUrl = new URL(env.redisUrl);
  const redisConnectionOptions = {
    db: redisUrl.pathname ? Number(redisUrl.pathname.slice(1) || '0') : undefined,
    host: redisUrl.hostname,
    password: redisUrl.password || undefined,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
  };

  console.log(
    JSON.stringify(
      createLogEvent({
        eventId: `worker:start:${Date.now()}`,
        eventType: 'platform.worker_started',
        actorId: 'worker',
        actorType: 'system',
        targetType: 'service',
        targetId: 'quizmind-worker',
        occurredAt: startedAt,
        category: 'system',
        severity: 'info',
        status: 'success',
        metadata: {
          heartbeatIntervalMs: env.heartbeatIntervalMs,
          queueCount: platformQueues.length,
          redisUrl: env.redisUrl,
          runtimeMode: env.runtimeMode,
        },
      }),
    ),
  );

  let redisConnection: IORedis | null = null;

  if (env.runtimeMode === 'connected') {
    try {
      redisConnection = new IORedis(env.redisUrl, {
        enableReadyCheck: false,
        lazyConnect: true,
        maxRetriesPerRequest: null,
      });
      await redisConnection.connect();

      const queueBindings = platformQueues.map(
        (queueName) =>
          new Queue(queueName, {
            connection: redisConnectionOptions,
          }),
      );

      console.log(
        JSON.stringify(
          createLogEvent({
            eventId: `worker:queues-bound:${Date.now()}`,
            eventType: 'platform.worker_queues_bound',
            actorId: 'worker',
            actorType: 'system',
            targetType: 'queue_group',
            targetId: 'platformQueues',
            occurredAt: new Date().toISOString(),
            category: 'system',
            severity: 'info',
            status: 'success',
            metadata: {
              queues: platformQueues,
              boundQueueCount: queueBindings.length,
            },
          }),
        ),
      );
    } catch (error) {
      console.log(
        JSON.stringify(
          createLogEvent({
            eventId: `worker:redis-fallback:${Date.now()}`,
            eventType: 'platform.worker_fallback_mode',
            actorId: 'worker',
            actorType: 'system',
            targetType: 'redis',
            targetId: env.redisUrl,
            occurredAt: new Date().toISOString(),
            category: 'system',
            severity: 'warn',
            status: 'failure',
            metadata: {
              message: error instanceof Error ? error.message : 'Unknown Redis connection failure',
            },
          }),
        ),
      );
    }
  }

  if (!redisConnection) {
    runDryRun();
  }

  setInterval(() => {
    console.log(
      JSON.stringify(
        createLogEvent({
          eventId: `worker:heartbeat:${Date.now()}`,
          eventType: 'platform.worker_heartbeat',
          actorId: 'worker',
          actorType: 'system',
          targetType: 'service',
          targetId: 'quizmind-worker',
          occurredAt: new Date().toISOString(),
          category: 'system',
          severity: 'debug',
          status: 'success',
          metadata: {
            mode: redisConnection ? 'connected' : 'dry-run',
            queues: platformQueues,
          },
        }),
      ),
    );
  }, env.heartbeatIntervalMs);
}

function runDryRun() {
  const usageResult = processUsageEvent(
    {
      installationId: 'inst_local_browser',
      workspaceId: 'ws_alpha',
      eventType: 'extension.quiz_answer_requested',
      occurredAt: new Date().toISOString(),
      payload: {
        questionType: 'multiple_choice',
        source: 'dry-run',
      },
    },
    {
      consumed: 42,
      limit: 500,
    },
  );
  const publishResult = propagateRemoteConfigPublish({
    versionLabel: 'local-preview',
    appliedLayerCount: 3,
    publishedAt: new Date().toISOString(),
    actorId: 'user_platform_admin',
    workspaceId: 'ws_alpha',
  });
  const quotaResetResult = resetQuotaCounter(
    {
      workspaceId: 'ws_alpha',
      key: 'limit.requests_per_day',
      consumed: 99,
      periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: new Date().toISOString(),
    },
    new Date().toISOString(),
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  );

  console.log(JSON.stringify(usageResult.logEvent));
  console.log(JSON.stringify(publishResult.logEvent));
  console.log(JSON.stringify(quotaResetResult.logEvent));
}

void bootstrap();
