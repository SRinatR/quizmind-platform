import {
  type AuditExportJobPayload,
  platformQueues,
  type BillingWebhookJobPayload,
  type EmailQueueJobPayload,
  type HistoryCleanupJobPayload,
  type PlatformQueueHistoryPolicy,
  type PlatformQueueHistoryPolicyEntry,
  type PlatformQueue,
  type QuotaResetJobPayload,
  type RemoteConfigPublishResult,
  type UsageEventPayload,
} from '@quizmind/contracts';

export const queueNames = platformQueues;

export interface PlatformQueuePayloadMap {
  'billing-webhooks': BillingWebhookJobPayload;
  'usage-events': UsageEventPayload;
  emails: EmailQueueJobPayload;
  'quota-resets': QuotaResetJobPayload;
  'config-publish': RemoteConfigPublishResult;
  'audit-exports': AuditExportJobPayload;
  'history-cleanup': HistoryCleanupJobPayload;
}

export type QueuePayloadFor<TQueue extends PlatformQueue> = PlatformQueuePayloadMap[TQueue];

export interface QueueJobEnvelope<TPayload> {
  id: string;
  queue: PlatformQueue;
  payload: TPayload;
  dedupeKey?: string;
  createdAt: string;
  attempts?: number;
}

export interface QueueDispatchRequest<TPayload> {
  queue: PlatformQueue;
  payload: TPayload;
  dedupeKey?: string;
  attempts?: number;
  jobId?: string;
  createdAt?: string;
}

export interface QueueDefinition {
  name: PlatformQueue;
  description: string;
  attempts: number;
  removeOnComplete: number;
  removeOnFail: number;
}

export interface QueueRuntimeOptions {
  attempts: number;
  removeOnComplete: number;
  removeOnFail: number;
}

export interface RedisConnectionOptions {
  db?: number;
  host: string;
  password?: string;
  port: number;
  username?: string;
}

export interface QueueDispatchRequestFor<TQueue extends PlatformQueue>
  extends QueueDispatchRequest<QueuePayloadFor<TQueue>> {
  queue: TQueue;
}

export const QUEUE_HISTORY_DEFAULTS: PlatformQueueHistoryPolicy = {
  'billing-webhooks': { attempts: 10, removeOnComplete: 250, removeOnFail: 250 },
  'usage-events': { attempts: 5, removeOnComplete: 250, removeOnFail: 250 },
  emails: { attempts: 5, removeOnComplete: 250, removeOnFail: 250 },
  'quota-resets': { attempts: 3, removeOnComplete: 250, removeOnFail: 250 },
  'config-publish': { attempts: 5, removeOnComplete: 250, removeOnFail: 250 },
  'audit-exports': { attempts: 2, removeOnComplete: 50, removeOnFail: 250 },
  'history-cleanup': { attempts: 3, removeOnComplete: 10, removeOnFail: 50 },
};

const queueDefinitionDescriptions: Record<PlatformQueue, string> = {
  'billing-webhooks': 'Processes billing provider webhook deliveries and retries.',
  'usage-events': 'Tracks extension and product usage for quota and analytics decisions.',
  emails: 'Delivers transactional email jobs such as verification, reset, and invites.',
  'quota-resets': 'Resets quota counters at the end of a billing or usage window.',
  'config-publish': 'Publishes remote config updates and downstream invalidation events.',
  'audit-exports': 'Builds and exports audit log bundles for admins and compliance.',
  'history-cleanup': 'Purges expired AI request content (prompt/response text) after the 7-day retention window.',
};

function resolveQueuePolicyEntry(
  queue: PlatformQueue,
  queuePolicy?: PlatformQueueHistoryPolicy,
): PlatformQueueHistoryPolicyEntry {
  return queuePolicy?.[queue] ?? QUEUE_HISTORY_DEFAULTS[queue];
}

export function buildQueueDefinitions(queuePolicy?: PlatformQueueHistoryPolicy): Record<PlatformQueue, QueueDefinition> {
  return queueNames.reduce(
    (acc, queue) => {
      const policy = resolveQueuePolicyEntry(queue, queuePolicy);
      acc[queue] = {
        name: queue,
        description: queueDefinitionDescriptions[queue],
        attempts: policy.attempts,
        removeOnComplete: policy.removeOnComplete,
        removeOnFail: policy.removeOnFail,
      };
      return acc;
    },
    {} as Record<PlatformQueue, QueueDefinition>,
  );
}

export function getQueueDefinition(queue: PlatformQueue, queuePolicy?: PlatformQueueHistoryPolicy): QueueDefinition {
  return buildQueueDefinitions(queuePolicy)[queue];
}

export function getQueueRuntimeOptions(
  queue: PlatformQueue,
  overrides?: Partial<Pick<QueueRuntimeOptions, 'attempts'>>,
  queuePolicy?: PlatformQueueHistoryPolicy,
): QueueRuntimeOptions {
  const definition = getQueueDefinition(queue, queuePolicy);

  return {
    attempts: overrides?.attempts ?? definition.attempts,
    removeOnComplete: definition.removeOnComplete,
    removeOnFail: definition.removeOnFail,
  };
}

export function resolveRedisConnectionOptions(redisUrl: string): RedisConnectionOptions {
  const parsed = new URL(redisUrl);
  const pathname = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.username ? { username: parsed.username } : {}),
    ...(parsed.password ? { password: parsed.password } : {}),
    ...(pathname ? { db: Number(pathname) } : {}),
  };
}


export interface ThrottledErrorLoggerOptions {
  context: string;
  intervalMs?: number;
  sink?: (message: string) => void;
}

export function createThrottledErrorLogger(options: ThrottledErrorLoggerOptions): (error: unknown) => void {
  const intervalMs = options.intervalMs ?? 60_000;
  const sink = options.sink ?? ((message: string) => console.error(message));
  const lastLoggedByKey = new Map<string, number>();

  return (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
    const key = `${options.context}:${message}`;
    const now = Date.now();
    const prev = lastLoggedByKey.get(key) ?? 0;
    if (now - prev < intervalMs) {
      return;
    }
    lastLoggedByKey.set(key, now);
    sink(`[${options.context}] ${message}`);
  };
}
export function buildQueueDedupeKey<TQueue extends PlatformQueue>(
  queue: TQueue,
  payload: QueuePayloadFor<TQueue>,
): string | undefined {
  if (queue === 'billing-webhooks') {
    const billingPayload = payload as QueuePayloadFor<'billing-webhooks'>;
    return `${billingPayload.provider}:${billingPayload.externalEventId}`;
  }

  if (queue === 'usage-events') {
    const usagePayload = payload as QueuePayloadFor<'usage-events'>;
    return `${usagePayload.installationId}:${usagePayload.occurredAt}:${usagePayload.eventType}`;
  }

  if (queue === 'quota-resets') {
    const quotaPayload = payload as QueuePayloadFor<'quota-resets'>;
    return `${quotaPayload.workspaceId}:${quotaPayload.key}:${quotaPayload.nextPeriodStart}`;
  }

  if (queue === 'config-publish') {
    const configPayload = payload as QueuePayloadFor<'config-publish'>;
    return `${configPayload.workspaceId ?? 'global'}:${configPayload.versionLabel}:${configPayload.publishedAt}`;
  }

  return undefined;
}

function buildQueueJobId(queue: PlatformQueue, dedupeKey?: string): string {
  return dedupeKey ? `${queue}:${dedupeKey}` : `${queue}:${Date.now()}`;
}

export function createQueueDispatchRequest<TQueue extends PlatformQueue>(
  request: QueueDispatchRequestFor<TQueue>,
  queuePolicy?: PlatformQueueHistoryPolicy,
): QueueDispatchRequestFor<TQueue> {
  const dedupeKey = request.dedupeKey ?? buildQueueDedupeKey(request.queue, request.payload);
  const runtimeOptions = getQueueRuntimeOptions(request.queue, {
    attempts: request.attempts,
  }, queuePolicy);

  return {
    ...request,
    ...(dedupeKey ? { dedupeKey } : {}),
    attempts: runtimeOptions.attempts,
  };
}

export function buildQueueJob<TPayload>(
  request: QueueDispatchRequest<TPayload>,
  queuePolicy?: PlatformQueueHistoryPolicy,
): QueueJobEnvelope<TPayload> {
  const runtimeOptions = getQueueRuntimeOptions(request.queue, {
    attempts: request.attempts,
  }, queuePolicy);
  const queueJobId = request.jobId ?? buildQueueJobId(request.queue, request.dedupeKey);

  return {
    id: queueJobId,
    queue: request.queue,
    payload: request.payload,
    dedupeKey: request.dedupeKey,
    createdAt: request.createdAt ?? new Date().toISOString(),
    attempts: runtimeOptions.attempts,
  };
}

export function listQueueDefinitions(queuePolicy?: PlatformQueueHistoryPolicy): QueueDefinition[] {
  const definitions = buildQueueDefinitions(queuePolicy);
  return queueNames.map((queue) => definitions[queue]);
}
