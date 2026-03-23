import { platformQueues, type PlatformQueue } from '@quizmind/contracts';

export const queueNames = platformQueues;

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
}

export const queueDefinitions: Record<PlatformQueue, QueueDefinition> = {
  'billing-webhooks': {
    name: 'billing-webhooks',
    description: 'Processes billing provider webhook deliveries and retries.',
    attempts: 10,
  },
  'usage-events': {
    name: 'usage-events',
    description: 'Tracks extension and product usage for quota and analytics decisions.',
    attempts: 5,
  },
  emails: {
    name: 'emails',
    description: 'Delivers transactional email jobs such as verification, reset, and invites.',
    attempts: 5,
  },
  'quota-resets': {
    name: 'quota-resets',
    description: 'Resets quota counters at the end of a billing or usage window.',
    attempts: 3,
  },
  'entitlement-refresh': {
    name: 'entitlement-refresh',
    description: 'Recomputes entitlements after subscription or override changes.',
    attempts: 5,
  },
  'config-publish': {
    name: 'config-publish',
    description: 'Publishes remote config updates and downstream invalidation events.',
    attempts: 5,
  },
  'audit-exports': {
    name: 'audit-exports',
    description: 'Builds and exports audit log bundles for admins and compliance.',
    attempts: 2,
  },
};

export function getQueueDefinition(queue: PlatformQueue): QueueDefinition {
  return queueDefinitions[queue];
}

export function buildQueueJob<TPayload>(request: QueueDispatchRequest<TPayload>): QueueJobEnvelope<TPayload> {
  return {
    id: request.jobId ?? `${request.queue}:${request.dedupeKey ?? Date.now().toString()}`,
    queue: request.queue,
    payload: request.payload,
    dedupeKey: request.dedupeKey,
    createdAt: request.createdAt ?? new Date().toISOString(),
    attempts: request.attempts ?? queueDefinitions[request.queue].attempts,
  };
}

export function listQueueDefinitions(): QueueDefinition[] {
  return queueNames.map((queue) => queueDefinitions[queue]);
}
