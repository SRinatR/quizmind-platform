import 'dotenv/config';
import http from 'node:http';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

import { createPrismaClientOptions, PrismaClient } from '@quizmind/database';
import { loadWorkerEnv, validateWorkerEnv } from '@quizmind/config';
import {
  type AuditExportJobPayload,
  type EmailQueueJobPayload,
  type HistoryCleanupJobPayload,
  platformQueues,
  type PlatformQueueHistoryPolicy,
  type QuotaResetJobPayload,
  type RemoteConfigPublishResult,
} from '@quizmind/contracts';
import { createNoopEmailAdapter } from '@quizmind/email';
import { QUEUE_HISTORY_DEFAULTS, createThrottledErrorLogger, getQueueRuntimeOptions, queueNames, resolveRedisConnectionOptions } from '@quizmind/queue';
import { createLogEvent, type StructuredLogEvent } from '@quizmind/logger';
import { type Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

import { createWorkerEmailAdapter } from './email/email-adapter';
import { processAuditExportJob } from './jobs/process-audit-export';
import { processBillingWebhookJob } from './jobs/process-billing-webhook';
import {
  buildEmailJobFailedDomainEvent,
  buildEmailJobProcessedDomainEvent,
} from './jobs/email-job-domain-event';
import { processEmailJob } from './jobs/process-email';
import { processQuotaResetJob } from './jobs/process-quota-reset';
import { processUsageEvent, processUsageEventJob } from './jobs/process-usage-event';
import { buildQueueJobFailedDomainEvent, buildQueueLogDomainEvent, type QueueJobContext } from './jobs/queue-log-domain-event';
import { propagateRemoteConfigPublish } from './jobs/publish-remote-config';
import { processHistoryCleanupJob } from './jobs/process-history-cleanup';
import { WorkerBillingProcessingRepository } from './repositories/billing-processing.repository';
import { type CreateWorkerDomainEventInput, WorkerDomainEventRepository } from './repositories/domain-event.repository';
import { WorkerUsageProcessingRepository } from './repositories/usage-processing.repository';

// ---------------------------------------------------------------------------
// Prometheus metrics
// ---------------------------------------------------------------------------
const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry, prefix: 'quizmind_worker_' });

const jobsProcessedTotal = new Counter({
  name: 'quizmind_worker_jobs_processed_total',
  help: 'Total number of successfully processed jobs',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

const jobsFailedTotal = new Counter({
  name: 'quizmind_worker_jobs_failed_total',
  help: 'Total number of failed jobs',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

const historyCleanupRunsTotal = new Counter({
  name: 'quizmind_worker_history_cleanup_runs_total',
  help: 'Total number of history cleanup runs',
  registers: [metricsRegistry],
});

const historyCleanupDeletedTotal = new Counter({
  name: 'quizmind_worker_history_cleanup_deleted_total',
  help: 'Total number of history records deleted by cleanup',
  registers: [metricsRegistry],
});

function startMetricsServer(port: number) {
  const server = http.createServer(async (_req, res) => {
    try {
      res.writeHead(200, { 'Content-Type': metricsRegistry.contentType });
      res.end(await metricsRegistry.metrics());
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  server.listen(port, '0.0.0.0');
  return server;
}

// ---------------------------------------------------------------------------

function resolveQueueJobContext(job: Job<unknown>): QueueJobContext {
  return {
    queueName: job.queueName || 'unknown',
    queueJobId: typeof job.id === 'number' || typeof job.id === 'string' ? String(job.id) : 'unknown',
    attemptNumber: job.attemptsMade + 1,
    processedAt: new Date().toISOString(),
  };
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return 'Unknown error';
}

function parseQueuePolicyFromUnknown(input: unknown): PlatformQueueHistoryPolicy | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }

  const source = input as Record<string, unknown>;
  const parsed: PlatformQueueHistoryPolicy = { ...QUEUE_HISTORY_DEFAULTS };

  for (const queueName of platformQueues) {
    const queueEntry = source[queueName];
    if (!queueEntry || typeof queueEntry !== 'object' || Array.isArray(queueEntry)) {
      continue;
    }
    const item = queueEntry as Record<string, unknown>;
    for (const field of ['attempts', 'removeOnComplete', 'removeOnFail'] as const) {
      const value = item[field];
      if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isFinite(value)) {
        continue;
      }
      if (field === 'attempts' && (value < 1 || value > 20)) continue;
      if ((field === 'removeOnComplete' || field === 'removeOnFail') && (value < 0 || value > 10000)) continue;
      parsed[queueName] = {
        ...parsed[queueName],
        [field]: value,
      };
    }
  }

  return parsed;
}

async function resolveWorkerQueuePolicy(prisma: PrismaClient): Promise<PlatformQueueHistoryPolicy | undefined> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: 'platform.retention_policy' },
      select: { valueJson: true },
    });
    if (!row || !row.valueJson || typeof row.valueJson !== 'object' || Array.isArray(row.valueJson)) {
      return undefined;
    }
    const queueHistory = (row.valueJson as Record<string, unknown>).queueHistory;
    return parseQueuePolicyFromUnknown(queueHistory);
  } catch {
    return undefined;
  }
}

async function persistDomainEvent(
  repository: WorkerDomainEventRepository,
  domainEvent: CreateWorkerDomainEventInput,
  queueContext: QueueJobContext,
) {
  try {
    await repository.create(domainEvent);
  } catch (error) {
    console.log(
      JSON.stringify(
        createLogEvent({
          eventId: `worker:email-domain-event:persist-failed:${queueContext.queueJobId}:${Date.now()}`,
          eventType: 'platform.worker_domain_event_persist_failed',
          actorId: 'worker',
          actorType: 'system',
          targetType: 'queue_job',
          targetId: queueContext.queueJobId,
          occurredAt: new Date().toISOString(),
          category: 'system',
          severity: 'warn',
          status: 'failure',
          metadata: {
            queue: queueContext.queueName,
            queueAttempt: queueContext.attemptNumber,
            domainEventType: domainEvent.eventType,
            message: readErrorMessage(error),
          },
        }),
      ),
    );
  }
}

interface QueueJobProcessingResult {
  logEvent: StructuredLogEvent;
}

async function processQueueJobWithDomainLogging<T extends QueueJobProcessingResult>(
  job: Job<unknown>,
  domainEventRepository: WorkerDomainEventRepository,
  processJob: () => Promise<T>,
): Promise<T> {
  const queueContext = resolveQueueJobContext(job);

  try {
    const result = await processJob();
    const processedEvent = buildQueueLogDomainEvent(result.logEvent, queueContext);

    await persistDomainEvent(domainEventRepository, processedEvent, queueContext);
    console.log(JSON.stringify(result.logEvent));
    jobsProcessedTotal.inc({ queue: queueContext.queueName });

    return result;
  } catch (error) {
    const failedEvent = buildQueueJobFailedDomainEvent(queueContext, error);

    await persistDomainEvent(domainEventRepository, failedEvent, queueContext);
    jobsFailedTotal.inc({ queue: queueContext.queueName });
    throw error;
  }
}


const logWorkerRedisError = createThrottledErrorLogger({ context: 'worker-redis', intervalMs: 30_000 });

async function bootstrap() {
  const env = loadWorkerEnv();
  const envIssues = validateWorkerEnv(env);

  if (envIssues.length > 0) {
    throw new Error(`Invalid worker environment: ${envIssues.map((issue) => `${issue.key}: ${issue.message}`).join('; ')}`);
  }
  const startedAt = new Date().toISOString();
  const metricsPort = Number(process.env.WORKER_METRICS_PORT ?? 9091);
  startMetricsServer(metricsPort);

  const redisConnectionOptions = resolveRedisConnectionOptions(env.redisUrl);

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
  let connectedStartupFailureMessage: string | null = null;

  if (env.runtimeMode === 'connected') {
    try {
      const emailAdapter = createWorkerEmailAdapter(env);
      prisma = new PrismaClient(
        createPrismaClientOptions(env.databaseUrl, env.nodeEnv === 'development' ? ['warn', 'error'] : ['error']),
      );
      await prisma.$connect();
      redisConnection = new IORedis(env.redisUrl, {
        enableReadyCheck: false,
        lazyConnect: true,
        maxRetriesPerRequest: null,
      });
      redisConnection.on('error', (error) => {
        logWorkerRedisError(error);
      });
      await redisConnection.connect();

      const queuePolicy = await resolveWorkerQueuePolicy(prisma).catch(() => undefined);

      const queueBindings = queueNames.map(
        (queueName) =>
          new Queue(queueName, {
            connection: redisConnectionOptions,
            defaultJobOptions: getQueueRuntimeOptions(queueName, undefined, queuePolicy),
          }),
      );
      const historyCleanupQueue = queueBindings.find((queue) => queue.name === 'history-cleanup');
      if (historyCleanupQueue) {
        await historyCleanupQueue.add(
          'history-cleanup-hourly',
          { triggeredAt: new Date().toISOString() } satisfies HistoryCleanupJobPayload,
          {
            ...getQueueRuntimeOptions('history-cleanup', undefined, queuePolicy),
            jobId: 'history-cleanup-hourly',
            repeat: { every: 60 * 60 * 1000 },
          },
        );
      }
      const billingWebhookRepository = new WorkerBillingProcessingRepository(prisma);
      const usageProcessingRepository = new WorkerUsageProcessingRepository(prisma);
      const domainEventRepository = new WorkerDomainEventRepository(prisma);
      const queueWorkers = [
        new Worker(
          'billing-webhooks',
          async (job) =>
            processQueueJobWithDomainLogging(job, domainEventRepository, async () =>
              processBillingWebhookJob(job.data, billingWebhookRepository),
            ),
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
        new Worker(
          'emails',
          async (job) => {
            const payload = job.data as EmailQueueJobPayload;
            const queueContext = resolveQueueJobContext(job as Job<EmailQueueJobPayload>);

            try {
              const result = await processEmailJob(payload, emailAdapter);
              const processedEvent = buildEmailJobProcessedDomainEvent(payload, result, queueContext);

              await persistDomainEvent(domainEventRepository, processedEvent, queueContext);
              console.log(JSON.stringify(result.logEvent));

              return result;
            } catch (error) {
              const failedEvent = buildEmailJobFailedDomainEvent(payload, error, queueContext);

              await persistDomainEvent(domainEventRepository, failedEvent, queueContext);
              console.log(
                JSON.stringify(
                  createLogEvent({
                    eventId: `email:failed:${queueContext.queueJobId}:${Date.now()}`,
                    eventType: 'email.delivery_failed',
                    actorId: payload.requestedByUserId ?? 'system',
                    actorType: payload.requestedByUserId ? 'user' : 'system',
                    targetType: 'email',
                    targetId: payload.to,
                    occurredAt: queueContext.processedAt,
                    category: 'system',
                    severity: 'error',
                    status: 'failure',
                    metadata: {
                      queue: queueContext.queueName,
                      queueJobId: queueContext.queueJobId,
                      queueAttempt: queueContext.attemptNumber,
                      templateKey: payload.templateKey,
                      message: readErrorMessage(error),
                    },
                  }),
                ),
              );
              throw error;
            }
          },
          {
            connection: redisConnectionOptions,
          },
        ),
        new Worker(
          'quota-resets',
          async (job) => {
            const payload = job.data as QuotaResetJobPayload;

            return processQueueJobWithDomainLogging(
              job,
              domainEventRepository,
              async () => {
                const result = processQuotaResetJob(payload);

                await usageProcessingRepository.saveQuotaCounter({
                  key: result.nextCounter.key,
                  consumed: result.nextCounter.consumed,
                  periodStart: new Date(result.nextCounter.periodStart),
                  periodEnd: new Date(result.nextCounter.periodEnd),
                });

                return result;
              },
            );
          },
          {
            connection: redisConnectionOptions,
          },
        ),
        new Worker(
          'config-publish',
          async (job) => {
            const payload = job.data as RemoteConfigPublishResult;

            return processQueueJobWithDomainLogging(
              job,
              domainEventRepository,
              async () => propagateRemoteConfigPublish(payload),
            );
          },
          {
            connection: redisConnectionOptions,
          },
        ),
        new Worker(
          'audit-exports',
          async (job) => {
            const payload = job.data as AuditExportJobPayload;

            return processQueueJobWithDomainLogging(
              job,
              domainEventRepository,
              async () => processAuditExportJob(payload),
            );
          },
          {
            connection: redisConnectionOptions,
          },
        ),
        new Worker(
          'history-cleanup',
          async (job) => {
            const payload = job.data as HistoryCleanupJobPayload;

            return processQueueJobWithDomainLogging(job, domainEventRepository, async () => {
              const result = await processHistoryCleanupJob(payload, prisma!);
              historyCleanupRunsTotal.inc();
              const deleted = (result.logEvent.metadata as Record<string, unknown> | undefined)?.deletedRows;
              if (typeof deleted === 'number' && deleted > 0) {
                historyCleanupDeletedTotal.inc(deleted);
              }
              return result;
            });
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
      connectedStartupFailureMessage = error instanceof Error ? error.message : 'Unknown Redis connection failure';
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
            severity: 'error',
            status: 'failure',
            metadata: {
              message: connectedStartupFailureMessage,
              runtimeMode: env.runtimeMode,
            },
          }),
        ),
      );
    }
  }

  if (env.runtimeMode === 'connected' && !redisConnection) {
    throw new Error(
      `Connected worker startup failed: ${connectedStartupFailureMessage ?? 'Redis/Prisma initialization failed.'}`,
    );
  }

  if (env.runtimeMode !== 'connected' && !redisConnection) {
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
  });
  const emailResult = await processEmailJob(
    {
      to: 'owner@quizmind.dev',
      templateKey: 'auth.verify-email',
      variables: {
        displayName: 'QuizMind Owner',
        productName: 'QuizMind',
        verifyUrl: 'http://localhost:3000/auth/verify?token=dry-run-token',
        supportEmail: 'support@quizmind.dev',
      },
      requestedAt: new Date().toISOString(),
      requestedByUserId: 'user_platform_admin',
    },
    createNoopEmailAdapter('worker-dry-run'),
  );
  const quotaResetResult = processQuotaResetJob(
    {
      key: 'limit.requests_per_day',
      consumed: 99,
      periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: new Date().toISOString(),
      nextPeriodStart: new Date().toISOString(),
      nextPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      requestedAt: new Date().toISOString(),
    },
  );
  const auditExportResult = processAuditExportJob({
    exportType: 'usage',
    format: 'json',
    scope: 'events',
    fileName: 'usage-ws_alpha-events-2026-03-27.json',
    contentType: 'application/json',
    exportedAt: new Date().toISOString(),
    requestedByUserId: 'user_platform_admin',
  });
  const webhookReceivedAt = new Date();
  const billingResult = await processBillingWebhookJob(
    {
      provider: 'yookassa',
      webhookEventId: 'wh_local_1',
      externalEventId: 'evt_local_1',
      eventType: 'payment.succeeded',
      receivedAt: webhookReceivedAt.toISOString(),
    },
    {
      async findWebhookEventById() {
        return {
          id: 'wh_local_1',
          provider: 'yookassa',
          externalEventId: 'evt_local_1',
          eventType: 'payment.succeeded',
          payloadJson: { type: 'notification', event: 'payment.succeeded' },
          status: 'received',
          receivedAt: webhookReceivedAt,
          processedAt: null,
        };
      },
      async markWebhookEventProcessed() {},
      async markWebhookEventFailed() {},
    },
  );

  console.log(JSON.stringify(usageResult.logEvent));
  console.log(JSON.stringify(publishResult.logEvent));
  console.log(JSON.stringify(emailResult.logEvent));
  console.log(JSON.stringify(quotaResetResult.logEvent));
  console.log(JSON.stringify(auditExportResult.logEvent));
  console.log(JSON.stringify(billingResult.logEvent));
}

void bootstrap();
