import assert from 'node:assert/strict';
import test from 'node:test';

import {
  processUsageEvent,
  processUsageEventJob,
  type UsageProcessingRepository,
} from '../src/jobs/process-usage-event';

function createRepository(
  overrides: Partial<UsageProcessingRepository> = {},
): UsageProcessingRepository {
  return {
    async findInstallationByInstallationId() {
      return {
        id: 'ext_local_1',
        installationId: 'inst_local_browser',
        workspaceId: 'ws_1',
        browser: 'chrome',
        extensionVersion: '1.7.0',
        schemaVersion: '2',
        capabilities: ['quiz-capture', 'history-sync'],
        lastSeenAt: new Date('2026-03-24T12:00:00.000Z'),
      };
    },
    async touchInstallation() {},
    async findUsageLimit() {
      return 500;
    },
    async findActiveQuotaCounter() {
      return {
        id: 'quota_1',
        workspaceId: 'ws_1',
        key: 'limit.requests_per_day',
        consumed: 41,
        periodStart: new Date('2026-03-24T00:00:00.000Z'),
        periodEnd: new Date('2026-03-25T00:00:00.000Z'),
      };
    },
    async saveQuotaCounter(input) {
      return {
        id: 'quota_1',
        workspaceId: input.workspaceId,
        key: input.key,
        consumed: input.consumed,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      };
    },
    async createTelemetry() {
      return {
        id: 'telemetry_1',
      };
    },
    async createActivityLog() {
      return {
        id: 'activity_1',
      };
    },
    ...overrides,
  };
}

test('processUsageEvent blocks usage after the configured limit is reached', () => {
  const result = processUsageEvent(
    {
      installationId: 'inst_local_browser',
      workspaceId: 'ws_1',
      eventType: 'extension.quiz_answer_requested',
      occurredAt: '2026-03-24T12:00:00.000Z',
      payload: {
        questionType: 'multiple_choice',
      },
    },
    {
      consumed: 25,
      limit: 25,
    },
  );

  assert.equal(result.accepted, false);
  assert.equal(result.nextUsage.consumed, 25);
  assert.equal(result.logEvent.status, 'failure');
});

test('processUsageEventJob updates quota counters and persistence records for accepted usage', async () => {
  let touchedInstallation = false;
  let savedCounterInput: Record<string, unknown> | null = null;
  let telemetryPayload: Record<string, unknown> | null = null;
  let activityPayload: Record<string, unknown> | null = null;
  const repository = createRepository({
    async touchInstallation() {
      touchedInstallation = true;
    },
    async saveQuotaCounter(input) {
      savedCounterInput = input as Record<string, unknown>;

      return {
        id: 'quota_1',
        workspaceId: input.workspaceId,
        key: input.key,
        consumed: input.consumed,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      };
    },
    async createTelemetry(input) {
      telemetryPayload = input.payloadJson;

      return {
        id: 'telemetry_1',
      };
    },
    async createActivityLog(input) {
      activityPayload = input.metadataJson;

      return {
        id: 'activity_1',
      };
    },
  });

  const result = await processUsageEventJob(
    {
      installationId: 'inst_local_browser',
      eventType: 'extension.quiz_answer_requested',
      occurredAt: '2026-03-24T12:05:00.000Z',
      payload: {
        questionType: 'multiple_choice',
        browser: 'chrome',
      },
    },
    repository,
  );

  assert.equal(result.accepted, true);
  assert.equal(result.workspaceId, 'ws_1');
  assert.equal(result.quotaKey, 'limit.requests_per_day');
  assert.equal(result.nextUsage.consumed, 42);
  assert.equal(touchedInstallation, true);
  assert.equal(savedCounterInput?.consumed, 42);
  assert.equal(telemetryPayload?.questionType, 'multiple_choice');
  assert.equal(activityPayload?.accepted, true);
  assert.equal(result.telemetryId, 'telemetry_1');
  assert.equal(result.activityLogId, 'activity_1');
});

test('processUsageEventJob skips quota writes when the workspace is already at limit', async () => {
  let savedCounterCalled = false;
  const repository = createRepository({
    async findUsageLimit() {
      return 42;
    },
    async findActiveQuotaCounter() {
      return {
        id: 'quota_1',
        workspaceId: 'ws_1',
        key: 'limit.requests_per_day',
        consumed: 42,
        periodStart: new Date('2026-03-24T00:00:00.000Z'),
        periodEnd: new Date('2026-03-25T00:00:00.000Z'),
      };
    },
    async saveQuotaCounter(input) {
      savedCounterCalled = true;

      return {
        id: 'quota_1',
        workspaceId: input.workspaceId,
        key: input.key,
        consumed: input.consumed,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      };
    },
  });

  const result = await processUsageEventJob(
    {
      installationId: 'inst_local_browser',
      eventType: 'extension.quiz_answer_requested',
      occurredAt: '2026-03-24T12:10:00.000Z',
      payload: {
        questionType: 'multiple_choice',
      },
    },
    repository,
  );

  assert.equal(result.accepted, false);
  assert.equal(result.nextUsage.consumed, 42);
  assert.equal(savedCounterCalled, false);
  assert.equal(result.logEvent.status, 'failure');
});
