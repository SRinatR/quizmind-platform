import {
  type AuditExportJobPayload,
  platformQueues,
  type BillingWebhookJobPayload,
  type EmailQueueJobPayload,
  type HistoryCleanupJobPayload,
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

export const queueDefinitions: Record<PlatformQueue, QueueDefinition> = {
  'billing-webhooks': {
    name: 'billing-webhooks',
    description: 'Processes billing provider webhook deliveries and retries.',
    attempts: 10,
    removeOnComplete: 250,
    removeOnFail: 250,
  },
  'usage-events': {
    name: 'usage-events',
    description: 'Tracks extension and product usage for quota and analytics decisions.',
    attempts: 5,
    removeOnComplete: 250,
    removeOnFail: 250,
  },
  emails: {
    name: 'emails',
    description: 'Delivers transactional email jobs such as verification, reset, and invites.',
    attempts: 5,
    removeOnComplete: 250,
    removeOnFail: 250,
  },
  'quota-resets': {
    name: 'quota-resets',
    description: 'Resets quota counters at the end of a billing or usage window.',
    attempts: 3,
    removeOnComplete: 250,
    removeOnFail: 250,
  },
  'config-publish': {
    name: 'config-publish',
    description: 'Publishes remote config updates and downstream invalidation events.',
    attempts: 5,
    removeOnComplete: 250,
    removeOnFail: 250,
  },
  'audit-exports': {
    name: 'audit-exports',
    description: 'Builds and exports audit log bundles for admins and compliance.',
    attempts: 2,
    removeOnComplete: 50,
    removeOnFail: 250,
  },
  'history-cleanup': {
    name: 'history-cleanup',
    description: 'Purges expired AI request content (prompt/response text) after the 7-day retention window.',
    attempts: 3,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
};

export function getQueueDefinition(queue: PlatformQueue): QueueDefinition {
  return queueDefinitions[queue];
}

export function getQueueRuntimeOptions(
  queue: PlatformQueue,
  overrides?: Partial<Pick<QueueRuntimeOptions, 'attempts'>>,
): QueueRuntimeOptions {
  const definition = getQueueDefinition(queue);

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
): QueueDispatchRequestFor<TQueue> {
  const dedupeKey = request.dedupeKey ?? buildQueueDedupeKey(request.queue, request.payload);
  const runtimeOptions = getQueueRuntimeOptions(request.queue, {
    attempts: request.attempts,
  });

  return {
    ...request,
    ...(dedupeKey ? { dedupeKey } : {}),
    attempts: runtimeOptions.attempts,
  };
}

export function buildQueueJob<TPayload>(request: QueueDispatchRequest<TPayload>): QueueJobEnvelope<TPayload> {
  const runtimeOptions = getQueueRuntimeOptions(request.queue, {
    attempts: request.attempts,
  });
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

export function listQueueDefinitions(): QueueDefinition[] {
  return queueNames.map((queue) => queueDefinitions[queue]);
}
