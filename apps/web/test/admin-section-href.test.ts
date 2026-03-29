import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdminSectionHref } from '../src/features/admin/admin-section-href';

test('buildAdminSectionHref preserves existing params and applies overrides', () => {
  const href = buildAdminSectionHref({
    section: 'security',
    currentSearchParams: {
      persona: 'platform-admin',
      workspaceId: 'ws_1',
      logSearch: 'old',
      logSeverity: 'info',
    },
    overrides: {
      logSearch: 'extension.runtime_error',
      logSeverity: 'warn',
      logStream: 'security',
    },
  });

  assert.equal(
    href,
    '/admin/security?workspaceId=ws_1&logSearch=extension.runtime_error&logSeverity=warn&logStream=security',
  );
});

test('buildAdminSectionHref removes params when override is undefined', () => {
  const href = buildAdminSectionHref({
    section: 'security',
    currentSearchParams: {
      workspaceId: 'ws_1',
      logSearch: 'extension.runtime_error',
      logSeverity: 'warn',
    },
    overrides: {
      logSearch: undefined,
      logSeverity: 'all',
      logStream: 'security',
    },
  });

  assert.equal(href, '/admin/security?workspaceId=ws_1&logSeverity=all&logStream=security');
});

test('buildAdminSectionHref reads first value from array params and supports removeKeys', () => {
  const href = buildAdminSectionHref({
    section: 'security',
    currentSearchParams: {
      persona: ['support-admin', 'platform-admin'],
      workspaceId: 'ws_1',
      logLimit: '20',
    },
    overrides: {
      logSearch: 'extension.bootstrap_refresh_failed',
    },
    removeKeys: ['logLimit'],
  });

  assert.equal(
    href,
    '/admin/security?workspaceId=ws_1&logSearch=extension.bootstrap_refresh_failed',
  );
});
