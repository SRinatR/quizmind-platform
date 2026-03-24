import 'dotenv/config';

import { PrismaClient } from '@quizmind/database';
import { loadWorkerEnv, validateWorkerEnv } from '@quizmind/config';
import { queueNames } from '@quizmind/queue';
import { createLogEvent } from '@quizmind/logger';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

import { processBillingWebhookJob } from './jobs/process-billing-webhook';
import { processUsageEvent, processUsageEventJob } from './jobs/process-usage-event';
import { propagateRemoteConfigPublish } from './jobs/publish-remote-config';
import { resetQuotaCounter } from './jobs/reset-quota-counter';
import { WorkerBillingProcessingRepository } from './repositories/billing-processing.repository';
import { WorkerUsageProcessingRepository } from './repositories/usage-processing.repository';

async function bootstrap() {
  const env = loadWorkerEnv();
  const envIssues = validateWorkerEnv(env);

  if (envIssues.length > 0) {
    throw new Error(`Invalid worker environment: ${envIssues.map((issue) => `${issue.key}: ${issue.message}`).join('; ')}`);
  }
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
          queueCount: queueNames.length,
          redisUrl: env.redisUrl,
          runtimeMode: env.runtimeMode,
        },
      }),
    ),
  );

  let redisConnection: IORedis | null = null;
  let prisma: PrismaClient | null = null;

  if (env.runtimeMode === 'connected') {
    try {
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: env.databaseUrl,
          },
        },
        log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
      });
      await prisma.$connect();
      redisConnection = new IORedis(env.redisUrl, {
        enableReadyCheck: false,
        lazyConnect: true,
        maxRetriesPerRequest: null,
      });
      await redisConnection.connect();

      const queueBindings = queueNames.map(
        (queueName) =>
          new Queue(queueName, {
            connection: redisConnectionOptions,
          }),
      );
      const billingWebhookRepository = new WorkerBillingProcessingRepository(prisma);
      const usageProcessingRepository = new WorkerUsageProcessingRepository(prisma);
      const queueWorkers = [
        new Worker(
          'billing-webhooks',
          async (job) => {
            const result = await processBillingWebhookJob(job.data, billingWebhookRepository);

            console.log(JSON.stringify(result.logEvent));
            return result;
          },
          {
            connection: redisConnectionOptions,
          },
        ),
        new Worker(
          'usage-events',
          async (job) => {
            const result = await processUsageEventJob(job.data, usageProcessingRepository);

            console.log(JSON.stringify(result.logEvent));
            return result;
          },
          {
            connection: redisConnectionOptions,
          },
        ),
      ];

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
              queues: queueNames,
              boundQueueCount: queueBindings.length,
              processorCount: queueWorkers.length,
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
    await runDryRun();
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
            queues: queueNames,
          },
        }),
      ),
    );
  }, env.heartbeatIntervalMs);
}

async function runDryRun() {
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
  const webhookReceivedAt = new Date();
  const billingResult = await processBillingWebhookJob(
    {
      provider: 'stripe',
      webhookEventId: 'wh_local_1',
      externalEventId: 'evt_local_1',
      eventType: 'customer.subscription.updated',
      receivedAt: webhookReceivedAt.toISOString(),
    },
    {
      async findWebhookEventById() {
        return {
          id: 'wh_local_1',
          provider: 'stripe',
          externalEventId: 'evt_local_1',
          eventType: 'customer.subscription.updated',
          payloadJson: {
            id: 'evt_local_1',
            type: 'customer.subscription.updated',
            data: {
              object: {
                id: 'sub_local_1',
                customer: 'cus_local_1',
                status: 'active',
                cancel_at_period_end: false,
                current_period_start: Math.floor(Date.now() / 1000),
                current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
                metadata: {
                  workspaceId: 'ws_alpha',
                  planCode: 'pro',
                },
                items: {
                  data: [
                    {
                      quantity: 3,
                      price: {
                        recurring: {
                          interval: 'month',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          status: 'received',
          receivedAt: webhookReceivedAt,
          processedAt: null,
        };
      },
      async markWebhookEventProcessed() {},
      async markWebhookEventFailed() {},
      async findWorkspaceById() {
        return {
          id: 'ws_alpha',
          stripeCustomerId: null,
        };
      },
      async findWorkspaceByStripeCustomerId() {
        return null;
      },
      async setWorkspaceStripeCustomerId() {},
      async findPlanByCode(planCode) {
        return {
          id: `plan_${planCode}`,
          code: planCode,
        };
      },
      async findSubscriptionByStripeSubscriptionId() {
        return null;
      },
      async findCurrentSubscriptionByWorkspaceId() {
        return null;
      },
      async upsertStripeSubscriptionForWorkspace(input) {
        return {
          id: 'sub_local_record',
          workspaceId: input.workspaceId,
          planId: input.planId,
          status: input.status,
          billingInterval: input.billingInterval,
          seatCount: input.seatCount,
          stripeCustomerId: input.stripeCustomerId,
          stripePriceId: input.stripePriceId,
          stripeSubscriptionId: input.stripeSubscriptionId,
          trialStartAt: input.trialStartAt,
        };
      },
      async updateSubscriptionStatus() {},
      async upsertInvoice() {
        return {
          id: 'in_local_record',
        };
      },
      async upsertPayment() {
        return {
          id: 'pay_local_record',
        };
      },
    },
  );

  console.log(JSON.stringify(usageResult.logEvent));
  console.log(JSON.stringify(publishResult.logEvent));
  console.log(JSON.stringify(quotaResetResult.logEvent));
  console.log(JSON.stringify(billingResult.logEvent));
}

void bootstrap();
