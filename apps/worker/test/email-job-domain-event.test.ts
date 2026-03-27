import assert from 'node:assert/strict';
import test from 'node:test';

import { createLogEvent } from '@quizmind/logger';

import { buildEmailJobFailedDomainEvent, buildEmailJobProcessedDomainEvent } from '../src/jobs/email-job-domain-event';

test('buildEmailJobProcessedDomainEvent maps queue delivery metadata for admin domain logs', () => {
  const event = buildEmailJobProcessedDomainEvent(
    {
      to: 'owner@quizmind.dev',
      templateKey: 'auth.verify-email',
      variables: {
        productName: 'QuizMind',
        displayName: 'Owner',
        verifyUrl: 'http://localhost:3000/auth/verify?token=test-token',
        supportEmail: 'support@quizmind.dev',
      },
      requestedAt: '2026-03-27T12:00:00.000Z',
      workspaceId: 'ws_1',
      requestedByUserId: 'user_1',
    },
    {
      delivered: true,
      provider: 'resend',
      messageId: 'msg_123',
      logEvent: createLogEvent({
        eventId: 'email:verify:owner@quizmind.dev',
        eventType: 'email.delivered',
        actorId: 'user_1',
        actorType: 'user',
        workspaceId: 'ws_1',
        targetType: 'email',
        targetId: 'owner@quizmind.dev',
        occurredAt: '2026-03-27T12:00:01.000Z',
        category: 'system',
        severity: 'info',
        status: 'success',
        metadata: {},
      }),
    },
    {
      queueName: 'emails',
      queueJobId: 'emails:1',
      attemptNumber: 1,
      processedAt: '2026-03-27T12:00:02.000Z',
    },
  );

  assert.equal(event.eventType, 'email.job_processed');
  assert.equal(event.workspaceId, 'ws_1');
  assert.equal(event.createdAt.toISOString(), '2026-03-27T12:00:02.000Z');
  assert.equal(event.payloadJson.summary, 'Delivered auth.verify-email to owner@quizmind.dev.');
  assert.equal(event.payloadJson.queue, 'emails');
  assert.equal(event.payloadJson.queueJobId, 'emails:1');
  assert.equal(event.payloadJson.deliveryProvider, 'resend');
  assert.equal(event.payloadJson.deliveryMessageId, 'msg_123');
});

test('buildEmailJobFailedDomainEvent captures queue failure diagnostics for admin domain logs', () => {
  const error = new Error('Provider timeout');
  Object.assign(error, { code: 'ETIMEDOUT' });

  const event = buildEmailJobFailedDomainEvent(
    {
      to: 'owner@quizmind.dev',
      templateKey: 'auth.verify-email',
      variables: {
        productName: 'QuizMind',
        displayName: 'Owner',
        verifyUrl: 'http://localhost:3000/auth/verify?token=test-token',
        supportEmail: 'support@quizmind.dev',
      },
      requestedAt: '2026-03-27T12:00:00.000Z',
      workspaceId: 'ws_1',
      requestedByUserId: 'user_1',
    },
    error,
    {
      queueName: 'emails',
      queueJobId: 'emails:2',
      attemptNumber: 2,
      processedAt: '2026-03-27T12:01:00.000Z',
    },
  );

  assert.equal(event.eventType, 'email.job_failed');
  assert.equal(event.workspaceId, 'ws_1');
  assert.equal(event.createdAt.toISOString(), '2026-03-27T12:01:00.000Z');
  assert.equal(event.payloadJson.summary, 'Failed auth.verify-email delivery to owner@quizmind.dev.');
  assert.equal(event.payloadJson.queueJobId, 'emails:2');
  assert.equal(event.payloadJson.queueAttempt, 2);
  assert.equal(event.payloadJson.errorName, 'Error');
  assert.equal(event.payloadJson.errorCode, 'ETIMEDOUT');
  assert.equal(event.payloadJson.errorMessage, 'Provider timeout');
});
