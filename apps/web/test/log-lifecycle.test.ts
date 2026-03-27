import assert from 'node:assert/strict';
import test from 'node:test';
import { type AdminLogEntry } from '@quizmind/contracts';

import {
  buildExtensionLifecycleSearch,
  isExtensionLifecycleEventType,
  summarizeExtensionLifecycleEvents,
} from '../src/features/admin/log-lifecycle';

function createLogEntry(eventType: string): AdminLogEntry {
  return {
    id: `log:${eventType}`,
    stream: 'audit',
    eventType,
    summary: eventType,
    occurredAt: '2026-03-27T10:00:00.000Z',
  };
}

test('isExtensionLifecycleEventType recognizes supported extension lifecycle events', () => {
  assert.equal(isExtensionLifecycleEventType('extension.bootstrap_refresh_failed'), true);
  assert.equal(isExtensionLifecycleEventType('extension.installation_reconnect_requested'), true);
  assert.equal(isExtensionLifecycleEventType('extension.installation_reconnected'), true);
  assert.equal(isExtensionLifecycleEventType('extension.installation_session_revoked'), true);
  assert.equal(isExtensionLifecycleEventType('extension.installation_session_rotated'), true);
  assert.equal(isExtensionLifecycleEventType('extension.runtime_error'), true);
  assert.equal(isExtensionLifecycleEventType('extension.quiz_answer_requested'), false);
});

test('summarizeExtensionLifecycleEvents returns per-event counts', () => {
  const summary = summarizeExtensionLifecycleEvents([
    createLogEntry('extension.bootstrap_refresh_failed'),
    createLogEntry('extension.bootstrap_refresh_failed'),
    createLogEntry('extension.installation_reconnect_requested'),
    createLogEntry('extension.installation_reconnected'),
    createLogEntry('extension.installation_session_revoked'),
    createLogEntry('extension.installation_session_rotated'),
    createLogEntry('extension.runtime_error'),
    createLogEntry('extension.quiz_answer_requested'),
  ]);

  assert.equal(summary.total, 7);
  assert.equal(summary.byEventType['extension.bootstrap_refresh_failed'], 2);
  assert.equal(summary.byEventType['extension.installation_reconnect_requested'], 1);
  assert.equal(summary.byEventType['extension.installation_reconnected'], 1);
  assert.equal(summary.byEventType['extension.installation_session_revoked'], 1);
  assert.equal(summary.byEventType['extension.installation_session_rotated'], 1);
  assert.equal(summary.byEventType['extension.runtime_error'], 1);
});

test('buildExtensionLifecycleSearch builds general and specific lifecycle search tokens', () => {
  assert.equal(buildExtensionLifecycleSearch(), 'extension.');
  assert.equal(buildExtensionLifecycleSearch('extension.runtime_error'), 'extension.runtime_error');
});
