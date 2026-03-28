import assert from 'node:assert/strict';
import test from 'node:test';

import { createQueueDispatchRequest } from '@quizmind/queue';

import { QueueDispatchService } from '../src/queue/queue-dispatch.service';

test('QueueDispatchService encodes BullMQ job ids so ":" does not break queue.add', async () => {
  const service = new QueueDispatchService() as any;
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
