import assert from 'node:assert/strict';
import test from 'node:test';

import { createLogEvent } from '@quizmind/logger';

import { buildQueueJobFailedDomainEvent, buildQueueLogDomainEvent } from '../src/jobs/queue-log-domain-event';

test('buildQueueLogDomainEvent maps worker log events into domain payloads with queue context', () => {
  const logEvent = createLogEvent({
    eventId: 'entitlement-refresh:ws_1:sub_1:2026-03-27T12:00:00.000Z',
    eventType: 'entitlements.refreshed',
    actorId: 'user_1',
    actorType: 'user',
    workspaceId: 'ws_1',
    targetType: 'subscription',
    targetId: 'sub_1',
    occurredAt: '2026-03-27T12:00:00.000Z',
    category: 'domain',
    severity: 'info',
    status: 'success',
    metadata: {
      summary: 'Subscription entitlements refreshed after resume.',
      reason: 'subscription_resumed',
    },
  });
  const result = buildQueueLogDomainEvent(logEvent, {
    queueName: 'entitlement-refresh',
    queueJobId: 'entitlement-refresh:1',
    attemptNumber: 1,
    processedAt: '2026-03-27T12:00:01.000Z',
  });

  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.eventType, 'entitlements.refreshed');
  assert.equal(result.createdAt.toISOString(), '2026-03-27T12:00:01.000Z');
  assert.equal(result.payloadJson.summary, 'Subscription entitlements refreshed after resume.');
  assert.equal(result.payloadJson.queue, 'entitlement-refresh');
  assert.equal(result.payloadJson.queueJobId, 'entitlement-refresh:1');
  assert.equal(result.payloadJson.status, 'success');
});

test('buildQueueJobFailedDomainEvent captures queue failure details for admin logs', () => {
  const error = new Error('Redis write timeout');
  Object.assign(error, { code: 'ETIMEDOUT' });
  const result = buildQueueJobFailedDomainEvent(
    {
      queueName: 'audit-exports',
      queueJobId: 'audit-exports:1',
      attemptNumber: 2,
      processedAt: '2026-03-27T12:10:00.000Z',
    },
    error,
    'ws_1',
  );

  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.eventType, 'audit-exports.job_failed');
  assert.equal(result.createdAt.toISOString(), '2026-03-27T12:10:00.000Z');
  assert.equal(result.payloadJson.queue, 'audit-exports');
  assert.equal(result.payloadJson.queueJobId, 'audit-exports:1');
  assert.equal(result.payloadJson.queueAttempt, 2);
  assert.equal(result.payloadJson.errorCode, 'ETIMEDOUT');
  assert.equal(result.payloadJson.errorMessage, 'Redis write timeout');
});
