import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAccessContext } from '@quizmind/auth';
import { type AccessContext } from '@quizmind/contracts';

import {
  buildAccessMatrixRows,
  describeAccessRequirement,
} from '../src/features/navigation/access-matrix';

function createContext(input: {
  systemRoles: AccessContext['systemRoles'];
}): AccessContext {
  return buildAccessContext({
    userId: 'user_123',
    email: 'demo@quizmind.dev',
    systemRoles: input.systemRoles,
    workspaceMemberships: [],
    entitlements: [],
    featureFlags: [],
  });
}

test('buildAccessMatrixRows exposes all admin sections as allowed for admin', () => {
  const rows = buildAccessMatrixRows({
    context: createContext({ systemRoles: ['admin'] }),
    scopes: ['admin'],
  });

  const logsRow = rows.find((row) => row.id === 'events');
  assert.ok(logsRow);
  assert.equal(logsRow.allowed, true);

  for (const row of rows) {
    assert.equal(row.allowed, true, `Expected section ${row.id} to be allowed for admin`);
  }
});

test('buildAccessMatrixRows denies all admin sections for user with no roles', () => {
  const rows = buildAccessMatrixRows({
    context: createContext({ systemRoles: [] }),
    scopes: ['admin'],
  });

  for (const row of rows) {
    assert.equal(row.allowed, false, `Expected section ${row.id} to be denied for non-admin`);
  }
});

test('buildAccessMatrixRows explains admin log denial for user', () => {
  const rows = buildAccessMatrixRows({
    context: createContext({ systemRoles: [] }),
    scopes: ['admin'],
  });
  const eventsRow = rows.find((row) => row.id === 'events');

  assert.ok(eventsRow);
  assert.equal(eventsRow.allowed, false);
  assert.equal(Boolean(eventsRow.reason?.includes('Missing permission: audit_logs:read')), true);
});

test('describeAccessRequirement summarizes compound requirements', () => {
  const summary = describeAccessRequirement({
    permission: 'users:read',
    requireSystemRole: 'admin',
    requiredEntitlements: ['feature.text_answering'],
    requiredFlags: ['beta.remote-config-v2'],
  });

  assert.equal(summary.includes('permission users:read'), true);
  assert.equal(summary.includes('system role admin'), true);
  assert.equal(summary.includes('entitlements feature.text_answering'), true);
  assert.equal(summary.includes('feature flags beta.remote-config-v2'), true);
});
