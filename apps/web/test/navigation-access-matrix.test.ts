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
  workspaceRole: AccessContext['workspaceMemberships'][number]['role'];
}): AccessContext {
  return buildAccessContext({
    userId: 'user_123',
    email: 'demo@quizmind.dev',
    systemRoles: input.systemRoles,
    workspaceMemberships: [
      {
        workspaceId: 'ws_123',
        role: input.workspaceRole,
      },
    ],
    entitlements: [],
    featureFlags: [],
  });
}

test('buildAccessMatrixRows exposes admin logs as allowed for security admin', () => {
  const rows = buildAccessMatrixRows({
    context: createContext({
      systemRoles: ['security_admin'],
      workspaceRole: 'workspace_security_manager',
    }),
    workspaceId: 'ws_123',
    scopes: ['admin'],
  });
  const logsRow = rows.find((row) => row.id === 'logs');

  assert.ok(logsRow);
  assert.equal(logsRow.allowed, true);
});

test('buildAccessMatrixRows explains admin log denial for workspace-only viewer', () => {
  const rows = buildAccessMatrixRows({
    context: createContext({
      systemRoles: [],
      workspaceRole: 'workspace_viewer',
    }),
    workspaceId: 'ws_123',
    scopes: ['admin'],
  });
  const logsRow = rows.find((row) => row.id === 'logs');

  assert.ok(logsRow);
  assert.equal(logsRow.allowed, false);
  assert.equal(Boolean(logsRow.reason?.includes('Missing permission: audit_logs:read')), true);
});

test('describeAccessRequirement summarizes compound requirements', () => {
  const summary = describeAccessRequirement({
    permission: 'users:read',
    requireSystemRole: 'platform_admin',
    requireWorkspaceRole: 'workspace_owner',
    requiredEntitlements: ['feature.text_answering'],
    requiredFlags: ['beta.remote-config-v2'],
    requireOwnership: true,
  });

  assert.equal(summary.includes('permission users:read'), true);
  assert.equal(summary.includes('system role platform_admin'), true);
  assert.equal(summary.includes('workspace role workspace_owner'), true);
  assert.equal(summary.includes('entitlements feature.text_answering'), true);
  assert.equal(summary.includes('feature flags beta.remote-config-v2'), true);
  assert.equal(summary.includes('workspace ownership'), true);
});
