import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type BillingWebhookJobPayload,
  type UsageEventPayload,
} from '@quizmind/contracts';

import {
  QUEUE_HISTORY_DEFAULTS,
  buildQueueDefinitions,
  buildQueueDedupeKey,
  buildQueueJob,
  createQueueDispatchRequest,
  getQueueRuntimeOptions,
  resolveRedisConnectionOptions,
} from '../src/index';

test('buildQueueDedupeKey derives stable keys for billing and usage queue payloads', () => {
  const billingPayload: BillingWebhookJobPayload = {
    provider: 'stripe',
    webhookEventId: 'wh_123',
    externalEventId: 'evt_abc',
    eventType: 'invoice.payment_failed',
    receivedAt: '2026-03-27T00:00:00.000Z',
  };
  const usagePayload: UsageEventPayload = {
    installationId: 'inst_123',
    workspaceId: 'ws_123',
    eventType: 'extension.quiz_answer_requested',
    occurredAt: '2026-03-27T00:00:01.000Z',
    payload: {
      source: 'extension',
    },
  };

  assert.equal(buildQueueDedupeKey('billing-webhooks', billingPayload), 'stripe:evt_abc');
  assert.equal(
    buildQueueDedupeKey('usage-events', usagePayload),
    'inst_123:2026-03-27T00:00:01.000Z:extension.quiz_answer_requested',
  );
  assert.equal(
    buildQueueDedupeKey('quota-resets', {
      workspaceId: 'ws_123',
      key: 'limit.requests_per_day',
      consumed: 42,
      periodStart: '2026-03-26T00:00:00.000Z',
      periodEnd: '2026-03-27T00:00:00.000Z',
      nextPeriodStart: '2026-03-27T00:00:00.000Z',
      nextPeriodEnd: '2026-03-28T00:00:00.000Z',
      requestedAt: '2026-03-27T00:00:00.000Z',
    }),
    'ws_123:limit.requests_per_day:2026-03-27T00:00:00.000Z',
  );
  assert.equal(
    buildQueueDedupeKey('config-publish', {
      versionLabel: 'spring-rollout-v3',
      appliedLayerCount: 3,
      publishedAt: '2026-03-27T02:00:00.000Z',
      actorId: 'user_1',
      workspaceId: 'ws_123',
    }),
    'ws_123:spring-rollout-v3:2026-03-27T02:00:00.000Z',
  );
});

test('createQueueDispatchRequest injects dedupe keys and retry defaults for supported queues', () => {
  const billingPayload: BillingWebhookJobPayload = {
    provider: 'yookassa',
    webhookEventId: 'wh_456',
    externalEventId: 'evt_456',
    eventType: 'payment.succeeded',
    receivedAt: '2026-03-27T10:00:00.000Z',
  };

  const preparedRequest = createQueueDispatchRequest({
    queue: 'billing-webhooks',
    payload: billingPayload,
  });

  assert.equal(preparedRequest.dedupeKey, 'yookassa:evt_456');
  assert.equal(preparedRequest.attempts, getQueueRuntimeOptions('billing-webhooks').attempts);

});

test('buildQueueJob keeps queue-scoped deterministic ids when dedupe keys are present', () => {
  const preparedRequest = createQueueDispatchRequest({
    queue: 'usage-events',
    payload: {
      installationId: 'inst_queue_1',
      workspaceId: 'ws_1',
      eventType: 'extension.sync_complete',
      occurredAt: '2026-03-27T12:01:00.000Z',
      payload: {},
    } satisfies UsageEventPayload,
  });

  const queueJob = buildQueueJob(preparedRequest);

  assert.equal(
    queueJob.id,
    'usage-events:inst_queue_1:2026-03-27T12:01:00.000Z:extension.sync_complete',
  );
  assert.equal(queueJob.attempts, getQueueRuntimeOptions('usage-events').attempts);
});

test('resolveRedisConnectionOptions parses credentials and database selection from redis url', () => {
  const options = resolveRedisConnectionOptions('redis://user:pass@redis.example.local:6380/2');

  assert.deepEqual(options, {
    host: 'redis.example.local',
    port: 6380,
    username: 'user',
    password: 'pass',
    db: 2,
  });
});

test('buildQueueDefinitions applies queue history policy overrides', () => {
  const definitions = buildQueueDefinitions({
    ...QUEUE_HISTORY_DEFAULTS,
    'usage-events': {
      attempts: 9,
      removeOnComplete: 333,
      removeOnFail: 444,
    },
  });

  assert.equal(definitions['usage-events'].attempts, 9);
  assert.equal(definitions['usage-events'].removeOnComplete, 333);
  assert.equal(definitions['usage-events'].removeOnFail, 444);
  assert.equal(definitions['billing-webhooks'].attempts, QUEUE_HISTORY_DEFAULTS['billing-webhooks'].attempts);
});
