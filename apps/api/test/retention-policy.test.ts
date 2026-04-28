import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultRetentionPolicy, parseAndNormalizeRetentionPolicy, parseRetentionPolicyPatch } from '../src/settings/retention-policy';

test('default retention policy exposes expected defaults', () => {
  assert.equal(defaultRetentionPolicy.aiHistoryContentDays, 7);
  assert.equal(defaultRetentionPolicy.adminLogRetentionEnabled, false);
  assert.equal(defaultRetentionPolicy.adminLogAuditDays, 365);
  assert.equal(defaultRetentionPolicy.accessTokenLifetimeMinutes, 15);
  assert.equal(defaultRetentionPolicy.refreshTokenLifetimeDays, 30);
  assert.equal(defaultRetentionPolicy.emailVerificationLifetimeHours, 24);
  assert.equal(defaultRetentionPolicy.passwordResetLifetimeHours, 1);
});

test('parseAndNormalizeRetentionPolicy rejects out-of-range values', () => {
  assert.throws(() => parseAndNormalizeRetentionPolicy({ aiHistoryContentDays: 0 }), /between 1 and 365/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ adminLogAuditDays: 10 }), /between 30 and 3650/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ accessTokenLifetimeMinutes: 4 }), /between 5 and 1440/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ refreshTokenLifetimeDays: 366 }), /between 1 and 365/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ emailVerificationLifetimeHours: 0 }), /between 1 and 168/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ passwordResetLifetimeHours: 25 }), /between 1 and 24/);
});

test('parseRetentionPolicyPatch rejects non-integer and non-boolean values', () => {
  assert.throws(() => parseRetentionPolicyPatch({ aiHistoryContentDays: '7' }), /finite integer number/);
  assert.throws(() => parseRetentionPolicyPatch({ aiHistoryContentDays: 1.5 }), /finite integer number/);
  assert.throws(() => parseRetentionPolicyPatch({ adminLogRetentionEnabled: 'true' }), /must be a boolean/);
  assert.throws(() => parseRetentionPolicyPatch({ aiHistoryContentDays: Number.NaN }), /finite integer number/);
  assert.throws(() => parseRetentionPolicyPatch({ aiHistoryContentDays: Number.POSITIVE_INFINITY }), /finite integer number/);
  assert.throws(() => parseRetentionPolicyPatch({ accessTokenLifetimeMinutes: '15' }), /finite integer number/);
});

test('parseRetentionPolicyPatch rejects legacyAiRequestDays updates (read-only)', () => {
  assert.throws(
    () => parseRetentionPolicyPatch({ legacyAiRequestDays: 30 }),
    /read-only/,
  );
});

test('parseRetentionPolicyPatch rejects unknown fields', () => {
  assert.throws(() => parseRetentionPolicyPatch({ unknown: 1 } as any), /Unknown retention field/);
});
