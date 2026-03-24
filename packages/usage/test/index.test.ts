import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addUtcDays,
  buildQuotaHint,
  evaluateUsageDecision,
  incrementUsage,
  resolveQuotaKey,
  resolveUsageMetricStatus,
  startOfUtcDay,
} from '../src/index';

test('usage helpers resolve windows and quota keys', () => {
  const start = startOfUtcDay(new Date('2026-03-24T12:34:56.000Z'));

  assert.equal(start.toISOString(), '2026-03-24T00:00:00.000Z');
  assert.equal(addUtcDays(start, 1).toISOString(), '2026-03-25T00:00:00.000Z');
  assert.equal(resolveQuotaKey('extension.quiz_answer_requested'), 'limit.requests_per_day');
  assert.equal(resolveQuotaKey('extension.screenshot_uploaded'), 'limit.screenshots_per_day');
});

test('usage decisions and hints enforce hard limits', () => {
  assert.equal(resolveUsageMetricStatus(8, 10), 'warning');
  assert.equal(resolveUsageMetricStatus(10, 10), 'exceeded');
  assert.deepEqual(incrementUsage({ consumed: 2, limit: 5 }), { consumed: 3, limit: 5 });

  const denied = evaluateUsageDecision({
    consumed: 5,
    limit: 5,
    quotaKey: 'limit.requests_per_day',
  });

  assert.equal(denied.accepted, false);
  assert.equal(denied.code, 'quota_exceeded');

  const hint = buildQuotaHint({
    key: 'limit.requests_per_day',
    label: 'Requests today',
    consumed: 3,
    limit: 5,
  });

  assert.equal(hint.remaining, 2);
  assert.equal(hint.enforcementMode, 'hard_limit');
});
