import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAccessContext } from '@quizmind/auth';
import { systemRoles, type AccessContext } from '@quizmind/contracts';

import { adminSections } from '../src/features/admin/sections';
import { demoAccounts } from '../src/features/auth/demo-accounts';
import { getVisibleAdminSections } from '../src/features/navigation/visibility';

function createWorkspaceContext(systemRoleList: AccessContext['systemRoles']): AccessContext {
  return buildAccessContext({
    userId: 'user_demo',
    email: 'demo@quizmind.dev',
    systemRoles: systemRoleList,
    workspaceMemberships: [
      {
        workspaceId: 'ws_demo',
        role: 'workspace_owner',
      },
    ],
    entitlements: [],
    featureFlags: [],
  });
}

test('demo accounts include every system role for login testing coverage', () => {
  const coveredRoles = new Set(
    demoAccounts.flatMap((account) => account.systemRoles),
  );

  for (const role of systemRoles) {
    assert.equal(
      coveredRoles.has(role),
      true,
      `Expected demo account coverage for system role: ${role}`,
    );
  }
});

test('personal super admin demo account has all system roles', () => {
  const personalSuperAdmin = demoAccounts.find((account) => account.email === 'admin@quizmind.dev');

  assert.ok(personalSuperAdmin);
  assert.deepEqual(
    [...personalSuperAdmin.systemRoles].sort(),
    [...systemRoles].sort(),
  );
});

test('personal super admin context resolves every admin section including logs', () => {
  const personalSuperAdmin = demoAccounts.find((account) => account.email === 'admin@quizmind.dev');

  assert.ok(personalSuperAdmin);

  const context = createWorkspaceContext(personalSuperAdmin.systemRoles);
  const visibleSections = getVisibleAdminSections(context, 'ws_demo');
  const visibleIds = new Set(visibleSections.map((section) => section.id));

  assert.equal(visibleIds.has('logs'), true);

  for (const section of adminSections) {
    assert.equal(
      visibleIds.has(section.id),
      true,
      `Expected admin section to be visible for personal super admin: ${section.id}`,
    );
  }
});
