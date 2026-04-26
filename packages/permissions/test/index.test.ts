import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateAccess, resolvePermissions, permissionRegistry } from '@quizmind/permissions';
import { buildAccessContext } from '@quizmind/auth';

test('admin role grants all permissions', () => {
  const permissions = resolvePermissions({ systemRoles: ['admin'] });
  assert.equal(permissions.length, permissionRegistry.length);
  assert.ok(permissions.includes('users:read'));
  assert.ok(permissions.includes('support:impersonate'));
  assert.ok(permissions.includes('remote_config:publish'));
  assert.equal(new Set(permissions).size, permissions.length);
});

test('user with no roles gets only authenticated-user permissions', () => {
  const permissions = resolvePermissions({ systemRoles: [], authenticatedUser: true });
  assert.ok(permissions.includes('installations:read'));
  assert.ok(!permissions.includes('users:read'));
  assert.ok(!permissions.includes('audit_logs:read'));
});

test('admin role grants audit and job permissions', () => {
  const permissions = resolvePermissions({ systemRoles: ['admin'] });
  assert.ok(permissions.includes('audit_logs:read'));
  assert.ok(permissions.includes('jobs:read'));
});

test('evaluateAccess allows admin to access any permission-gated section', () => {
  const decision = evaluateAccess(
    buildAccessContext({
      userId: 'user_1',
      email: 'admin@quizmind.dev',
      systemRoles: ['admin'],
      workspaceMemberships: [],
      entitlements: [],
      featureFlags: [],
    }),
    { permission: 'audit_logs:read' },
  );
  assert.deepEqual(decision, { allowed: true, reasons: [] });
});

test('evaluateAccess denies user with no roles from admin sections', () => {
  const decision = evaluateAccess(
    buildAccessContext({
      userId: 'user_2',
      email: 'user@quizmind.dev',
      systemRoles: [],
      workspaceMemberships: [],
      entitlements: [],
      featureFlags: [],
    }),
    { permission: 'users:read' },
  );
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.some((r) => r.includes('Missing permission: users:read')));
});

test('evaluateAccess supports role-only requirements', () => {
  const adminDecision = evaluateAccess(
    buildAccessContext({
      userId: 'user_admin',
      email: 'admin@quizmind.dev',
      systemRoles: ['admin'],
      workspaceMemberships: [],
      entitlements: [],
      featureFlags: [],
    }),
    { requireSystemRole: 'admin' },
  );
  assert.deepEqual(adminDecision, { allowed: true, reasons: [] });

  const userDecision = evaluateAccess(
    buildAccessContext({
      userId: 'user_member',
      email: 'user@quizmind.dev',
      systemRoles: [],
      workspaceMemberships: [],
      entitlements: [],
      featureFlags: [],
    }),
    { requireSystemRole: 'admin' },
  );
  assert.equal(userDecision.allowed, false);
  assert.ok(userDecision.reasons.some((r) => r.includes('Missing system role: admin')));
});
