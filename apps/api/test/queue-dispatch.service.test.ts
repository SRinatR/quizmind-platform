import assert from 'node:assert/strict';
import test from 'node:test';

import { createQueueDispatchRequest } from '@quizmind/queue';

import { QueueDispatchService } from '../src/queue/queue-dispatch.service';

test('QueueDispatchService encodes BullMQ job ids so ":" does not break queue.add', async () => {
  const service = new QueueDispatchService({
    getEffectiveRetentionPolicy: async () => ({
      queueHistory: {
        'billing-webhooks': { attempts: 10, removeOnComplete: 250, removeOnFail: 250 },
        'usage-events': { attempts: 5, removeOnComplete: 250, removeOnFail: 250 },
        emails: { attempts: 5, removeOnComplete: 250, removeOnFail: 250 },
        'quota-resets': { attempts: 3, removeOnComplete: 250, removeOnFail: 250 },
        'config-publish': { attempts: 5, removeOnComplete: 250, removeOnFail: 250 },
        'audit-exports': { attempts: 2, removeOnComplete: 50, removeOnFail: 250 },
        'history-cleanup': { attempts: 3, removeOnComplete: 10, removeOnFail: 50 },
      },
    }),
  } as any) as any;
  let capturedJobId = '';

  service.env = {
    ...service.env,
    runtimeMode: 'connected',
  };

  service.getQueue = () => ({
    add: async (_name: string, _payload: unknown, options: { jobId?: string }) => {
      capturedJobId = String(options?.jobId || '');
    },
  });

  const request = createQueueDispatchRequest({
    queue: 'usage-events',
    payload: {
      installationId: 'inst_queue_1',
      workspaceId: 'ws_1',
      eventType: 'extension.sync_complete',
      occurredAt: '2026-03-27T12:01:00.000Z',
      payload: {},
    },
  });

  const job = await service.dispatch(request);

  assert.equal(
    job.id,
    'usage-events:inst_queue_1:2026-03-27T12:01:00.000Z:extension.sync_complete',
  );
  assert.ok(capturedJobId.length > 0);
  assert.equal(capturedJobId.includes(':'), false);
  assert.equal(capturedJobId, encodeURIComponent(job.id));
});

test('QueueDispatchService falls back to queue defaults when retention settings lookup fails', async () => {
  const service = new QueueDispatchService({
    getEffectiveRetentionPolicy: async () => {
      throw new Error('settings unavailable');
    },
  } as any) as any;
  let capturedAttempts = 0;

  service.env = {
    ...service.env,
    runtimeMode: 'connected',
  };
  service.getQueue = () => ({
    add: async (_name: string, _payload: unknown, options: { attempts?: number }) => {
      capturedAttempts = Number(options?.attempts ?? 0);
    },
  });

  await service.dispatch(
    createQueueDispatchRequest({
      queue: 'billing-webhooks',
      payload: {
        provider: 'stripe',
        webhookEventId: 'wh_1',
        externalEventId: 'evt_1',
        eventType: 'payment.succeeded',
        receivedAt: '2026-03-27T10:00:00.000Z',
      },
    }),
  );

  assert.equal(capturedAttempts, 10);
});
