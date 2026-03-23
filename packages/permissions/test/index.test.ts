import test from 'node:test';
import assert from 'node:assert/strict';

import { createAccessContext } from '../../testing/src';
import { evaluateAccess, resolvePermissions } from '@quizmind/permissions';

test('resolvePermissions merges system and workspace permissions without duplicates', () => {
  const permissions = resolvePermissions({
    systemRoles: ['billing_admin'],
    workspaceRoles: ['workspace_owner'],
  });

  assert.ok(permissions.includes('subscriptions:read'));
  assert.ok(permissions.includes('workspaces:update'));
  assert.equal(new Set(permissions).size, permissions.length);
});

test('evaluateAccess allows access when all requirements pass', () => {
  const decision = evaluateAccess(
    createAccessContext({
      userId: 'user_1',
      systemRoles: ['platform_admin'],
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_owner' }],
      entitlements: ['feature.remote_sync'],
      featureFlags: ['beta.remote-config-v2'],
      attributes: { workspaceOwnerId: 'user_1' },
    }),
    {
      permission: 'workspaces:update',
      workspaceId: 'ws_1',
      requireSystemRole: 'platform_admin',
      requireWorkspaceRole: 'workspace_owner',
      requiredEntitlements: ['feature.remote_sync'],
      requiredFlags: ['beta.remote-config-v2'],
      requireOwnership: true,
    },
  );

  assert.deepEqual(decision, { allowed: true, reasons: [] });
});

test('evaluateAccess returns detailed denial reasons', () => {
  const decision = evaluateAccess(
    createAccessContext({
      userId: 'user_2',
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_viewer' }],
    }),
    {
      permission: 'workspaces:update',
      workspaceId: 'ws_1',
      requireSystemRole: 'platform_admin',
      requireWorkspaceRole: 'workspace_owner',
      requiredEntitlements: ['feature.remote_sync'],
      requiredFlags: ['beta.remote-config-v2'],
      requireOwnership: true,
    },
  );

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasons, [
    'Missing permission: workspaces:update',
    'Missing system role: platform_admin',
    'Missing workspace role: workspace_owner',
    'Missing entitlement: feature.remote_sync',
    'Missing feature flag: beta.remote-config-v2',
    'Ownership check failed.',
  ]);
});
