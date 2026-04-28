import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultRetentionPolicy, parseAndNormalizeRetentionPolicy, parseRetentionPolicyPatch } from '../src/settings/retention-policy';

test('default retention policy exposes expected defaults', () => {
  assert.equal(defaultRetentionPolicy.aiHistoryContentDays, 7);
  assert.equal(defaultRetentionPolicy.maxPromptImageAttachments, 8);
  assert.equal(defaultRetentionPolicy.maxPromptImageAttachmentMegabytes, 10);
  assert.equal(defaultRetentionPolicy.adminLogRetentionEnabled, false);
  assert.equal(defaultRetentionPolicy.adminLogAuditDays, 365);
  assert.equal(defaultRetentionPolicy.accessTokenLifetimeMinutes, 15);
  assert.equal(defaultRetentionPolicy.refreshTokenLifetimeDays, 30);
  assert.equal(defaultRetentionPolicy.extensionSessionLifetimeHours, 1);
  assert.equal(defaultRetentionPolicy.extensionSessionRefreshAfterSeconds, 900);
  assert.equal(defaultRetentionPolicy.emailVerificationLifetimeHours, 24);
  assert.equal(defaultRetentionPolicy.passwordResetLifetimeHours, 1);
  assert.equal(defaultRetentionPolicy.queueHistory['billing-webhooks'].attempts, 10);
  assert.equal(defaultRetentionPolicy.queueHistory['history-cleanup'].removeOnFail, 50);
});

test('parseAndNormalizeRetentionPolicy rejects out-of-range values', () => {
  assert.throws(() => parseAndNormalizeRetentionPolicy({ aiHistoryContentDays: 0 }), /between 1 and 365/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ adminLogAuditDays: 10 }), /between 30 and 3650/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ accessTokenLifetimeMinutes: 4 }), /between 5 and 1440/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ refreshTokenLifetimeDays: 366 }), /between 1 and 365/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ extensionSessionLifetimeHours: 0 }), /between 1 and 720/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ extensionSessionRefreshAfterSeconds: 10 }), /between 60 and 86400/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ maxPromptImageAttachments: 21 }), /between 1 and 20/);
  assert.throws(() => parseAndNormalizeRetentionPolicy({ passwordResetLifetimeHours: 25 }), /between 1 and 24/);
});

test('parseRetentionPolicyPatch rejects non-integer and non-boolean values', () => {
  assert.throws(() => parseRetentionPolicyPatch({ aiHistoryContentDays: '7' }), /finite integer number/);
  assert.throws(() => parseRetentionPolicyPatch({ aiHistoryContentDays: 1.5 }), /finite integer number/);
  assert.throws(() => parseRetentionPolicyPatch({ adminLogRetentionEnabled: 'true' }), /must be a boolean/);
  assert.throws(() => parseRetentionPolicyPatch({ aiHistoryContentDays: Number.NaN }), /finite integer number/);
  assert.throws(() => parseRetentionPolicyPatch({ aiHistoryContentDays: Number.POSITIVE_INFINITY }), /finite integer number/);
  assert.throws(() => parseRetentionPolicyPatch({ accessTokenLifetimeMinutes: '15' }), /finite integer number/);
  assert.throws(() => parseRetentionPolicyPatch({ extensionSessionRefreshAfterSeconds: null }), /finite integer number/);
});

test('parseRetentionPolicyPatch rejects legacyAiRequestDays updates (read-only)', () => {
  assert.throws(
    () => parseRetentionPolicyPatch({ legacyAiRequestDays: 30 }),
    /read-only/,
  );
});


test('parseRetentionPolicyPatch rejects emailVerificationLifetimeHours updates (future flow)', () => {
  assert.throws(
    () => parseRetentionPolicyPatch({ emailVerificationLifetimeHours: 12 }),
    /reserved for a future email verification flow/,
  );
});

test('parseRetentionPolicyPatch rejects unknown fields', () => {
  assert.throws(() => parseRetentionPolicyPatch({ unknown: 1 } as any), /Unknown retention field/);
});

test('parseRetentionPolicyPatch supports queue history partial updates without resetting omitted fields', () => {
  const base = parseAndNormalizeRetentionPolicy({
    queueHistory: {
      'billing-webhooks': { attempts: 10, removeOnComplete: 250, removeOnFail: 250 },
      'usage-events': { attempts: 5, removeOnComplete: 250, removeOnFail: 250 },
      emails: { attempts: 5, removeOnComplete: 250, removeOnFail: 250 },
      'quota-resets': { attempts: 3, removeOnComplete: 250, removeOnFail: 250 },
      'config-publish': { attempts: 5, removeOnComplete: 250, removeOnFail: 250 },
      'audit-exports': { attempts: 2, removeOnComplete: 50, removeOnFail: 250 },
      'history-cleanup': { attempts: 3, removeOnComplete: 10, removeOnFail: 50 },
    },
  });
  const patch = parseRetentionPolicyPatch({
    queueHistory: {
      'usage-events': { removeOnFail: 300 },
    },
  });
  const merged = parseAndNormalizeRetentionPolicy({
    ...base,
    queueHistory: {
      ...base.queueHistory,
      'usage-events': { ...base.queueHistory['usage-events'], ...patch.queueHistory?.['usage-events'] },
    },
  });

  assert.equal(merged.queueHistory['usage-events'].removeOnFail, 300);
  assert.equal(merged.queueHistory['usage-events'].attempts, 5);
  assert.equal(merged.queueHistory['billing-webhooks'].attempts, 10);
});

test('parseRetentionPolicyPatch rejects invalid and unknown queue history fields', () => {
  assert.throws(() => parseRetentionPolicyPatch({ queueHistory: { unknown: { attempts: 5 } } }), /Unknown queue history field/);
  assert.throws(() => parseRetentionPolicyPatch({ queueHistory: { emails: { attempts: 0 } } }), /between 1 and 20/);
  assert.throws(() => parseRetentionPolicyPatch({ queueHistory: { emails: { removeOnComplete: 10001 } } }), /between 0 and 10000/);
  assert.throws(() => parseRetentionPolicyPatch({ queueHistory: { emails: { removeOnFail: '12' } } as any }), /finite integer number/);
  assert.throws(() => parseRetentionPolicyPatch({ queueHistory: { emails: { unexpected: 1 } } as any }), /Unknown queue history field/);
});
