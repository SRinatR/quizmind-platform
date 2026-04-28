import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultRetentionPolicy, parseAndNormalizeRetentionPolicy } from '../src/settings/retention-policy';

test('default retention policy exposes expected defaults', () => {
  assert.equal(defaultRetentionPolicy.aiHistoryContentDays, 7);
  assert.equal(defaultRetentionPolicy.adminLogRetentionEnabled, false);
  assert.equal(defaultRetentionPolicy.adminLogAuditDays, 365);
});

test('parseAndNormalizeRetentionPolicy rejects out-of-range values', () => {
  assert.throws(() => parseAndNormalizeRetentionPolicy({ aiHistoryContentDays: 0 }), /between 1 and 365/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ adminLogAuditDays: 10 }), /between 30 and 3650/);
});
