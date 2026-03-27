import assert from 'node:assert/strict';
import test from 'node:test';

import { processAuditExportJob } from '../src/jobs/process-audit-export';
import { processEmailJob } from '../src/jobs/process-email';
import { processEntitlementRefreshJob } from '../src/jobs/process-entitlement-refresh';
import { processQuotaResetJob } from '../src/jobs/process-quota-reset';

test('processEmailJob emits delivery logs for transactional email queue work', () => {
  const result = processEmailJob({
    to: 'owner@quizmind.dev',
    templateKey: 'auth.verify-email',
    variables: {
      productName: 'QuizMind',
    },
    requestedAt: '2026-03-27T12:00:00.000Z',
    workspaceId: 'ws_1',
    requestedByUserId: 'user_1',
  });

  assert.equal(result.delivered, true);
  assert.equal(result.logEvent.eventType, 'email.delivered');
  assert.equal(result.logEvent.targetId, 'owner@quizmind.dev');
});

test('processQuotaResetJob resets counters for the next billing window', () => {
  const result = processQuotaResetJob({
    workspaceId: 'ws_1',
    key: 'limit.requests_per_day',
    consumed: 75,
    periodStart: '2026-03-26T00:00:00.000Z',
    periodEnd: '2026-03-27T00:00:00.000Z',
    nextPeriodStart: '2026-03-27T00:00:00.000Z',
    nextPeriodEnd: '2026-03-28T00:00:00.000Z',
    requestedAt: '2026-03-27T00:00:00.000Z',
  });

  assert.equal(result.processed, true);
  assert.equal(result.nextCounter.consumed, 0);
  assert.equal(result.nextCounter.periodStart, '2026-03-27T00:00:00.000Z');
  assert.equal(result.nextCounter.periodEnd, '2026-03-28T00:00:00.000Z');
});

test('processEntitlementRefreshJob records lifecycle-triggered entitlement refresh', () => {
  const result = processEntitlementRefreshJob({
    workspaceId: 'ws_1',
    subscriptionId: 'sub_1',
    previousStatus: 'active',
    nextStatus: 'active',
    reason: 'subscription_resumed',
    requestedAt: '2026-03-27T12:05:00.000Z',
    requestedByUserId: 'user_1',
  });

  assert.equal(result.refreshed, true);
  assert.equal(result.logEvent.eventType, 'entitlements.refreshed');
  assert.equal(result.logEvent.workspaceId, 'ws_1');
  assert.equal(result.logEvent.targetId, 'sub_1');
});

test('processAuditExportJob logs usage export processing metadata', () => {
  const result = processAuditExportJob({
    exportType: 'usage',
    workspaceId: 'ws_1',
    format: 'json',
    scope: 'events',
    fileName: 'usage-ws_1-events-2026-03-27.json',
    contentType: 'application/json',
    exportedAt: '2026-03-27T12:10:00.000Z',
    requestedByUserId: 'user_1',
  });

  assert.equal(result.processed, true);
  assert.equal(result.logEvent.eventType, 'audit.export_processed');
  assert.equal(result.logEvent.targetType, 'usage_export');
  assert.equal(result.logEvent.targetId, 'usage-ws_1-events-2026-03-27.json');
});
