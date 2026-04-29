import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAccessContext } from '@quizmind/auth';
import { type AccessContext } from '@quizmind/contracts';

import { adminSections } from '../src/features/admin/sections';
import { demoAccounts } from '../src/features/auth/demo-accounts';
import { buildVisibleAdminNavGroups, getVisibleAdminSections } from '../src/features/navigation/visibility';
import { isAdminEmail } from '../src/lib/admin-guard';

function createContext(systemRoleList: AccessContext['systemRoles']): AccessContext {
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

test('demo accounts have exactly 2 entries: Admin and User', () => {
  assert.equal(demoAccounts.length, 2);
  assert.ok(demoAccounts.some((a) => a.systemRoles.length > 0), 'expected an admin account');
  assert.ok(demoAccounts.some((a) => a.systemRoles.length === 0), 'expected a user account');
});

test('admin demo account has at least one system role', () => {
  const admin = demoAccounts.find((a) => a.systemRoles.length > 0);
  assert.ok(admin, 'admin demo account must exist');
  assert.ok(admin.systemRoles.length > 0);
});

test('user demo account has no system roles', () => {
  const user = demoAccounts.find((a) => a.systemRoles.length === 0);
  assert.ok(user, 'user demo account must exist');
  assert.equal(user.systemRoles.length, 0);
});

test('admin demo account context resolves all admin sections', () => {
  const admin = demoAccounts.find((a) => a.systemRoles.length > 0);
  assert.ok(admin);

  const context = createContext(admin.systemRoles);
  const visibleSections = getVisibleAdminSections(context);
  const visibleIds = new Set(visibleSections.map((s) => s.id));

  for (const section of adminSections) {
    assert.equal(
      visibleIds.has(section.id),
      true,
      `Expected admin section visible for admin account: ${section.id}`,
    );
  }
});

test('user demo account context resolves zero admin sections', () => {
  const user = demoAccounts.find((a) => a.systemRoles.length === 0);
  assert.ok(user);

  const context = createContext(user.systemRoles);
  const visibleSections = getVisibleAdminSections(context);
  assert.equal(visibleSections.length, 0, 'user account must not resolve any admin sections');
});

test('admin settings section is visible for admin role and hidden for non-admin role', () => {
  const adminContext = createContext(['admin']);
  const userContext = createContext([]);

  const adminVisible = getVisibleAdminSections(adminContext).some((section) => section.id === 'settings');
  const userVisible = getVisibleAdminSections(userContext).some((section) => section.id === 'settings');

  assert.equal(adminVisible, true, 'settings must be visible for admin role');
  assert.equal(userVisible, false, 'settings must be hidden for non-admin');
});


test('data-retention section is visible for admin role and hidden for non-admin role', () => {
  const adminContext = createContext(['admin']);
  const userContext = createContext([]);

  const adminVisible = getVisibleAdminSections(adminContext).some((section) => section.id === 'data-retention');
  const userVisible = getVisibleAdminSections(userContext).some((section) => section.id === 'data-retention');

  assert.equal(adminVisible, true, 'data-retention must be visible for admin role');
  assert.equal(userVisible, false, 'data-retention must be hidden for non-admin');
});

test('admin nav places Pricing & Billing and Data Retention in Billing & Data after Control Plane and before Preferences', () => {
  const groups = buildVisibleAdminNavGroups(createContext(['admin']));
  const labels = groups.map((group) => group.label);
  const controlPlaneIndex = labels.indexOf('Control Plane');
  const billingDataIndex = labels.indexOf('Billing & Data');
  const preferencesIndex = labels.indexOf('Preferences');

  assert.ok(controlPlaneIndex >= 0, 'Control Plane group must exist');
  assert.ok(billingDataIndex >= 0, 'Billing & Data group must exist');
  assert.ok(preferencesIndex >= 0, 'Preferences group must exist');
  assert.ok(controlPlaneIndex < billingDataIndex, 'Billing & Data must appear after Control Plane');
  assert.ok(billingDataIndex < preferencesIndex, 'Billing & Data must appear before Preferences');

  const controlPlane = groups[controlPlaneIndex];
  const billingData = groups[billingDataIndex];

  const controlPlaneHrefs = new Set(controlPlane.items.map((item) => item.href));
  assert.equal(controlPlaneHrefs.has('/admin/pricing-billing'), false, 'pricing-billing must not be in Control Plane');
  assert.equal(controlPlaneHrefs.has('/admin/data-retention'), false, 'data-retention must not be in Control Plane');

  const billingDataHrefs = new Set(billingData.items.map((item) => item.href));
  assert.equal(billingDataHrefs.has('/admin/pricing-billing'), true, 'pricing-billing must be in Billing & Data');
  assert.equal(billingDataHrefs.has('/admin/data-retention'), true, 'data-retention must be in Billing & Data');
  assert.equal(billingDataHrefs.has('/admin/user-billing'), true, 'user-billing must be in Billing & Data');
});

test('admin nav keeps pricing-billing and data-retention links active-targetable and hidden for non-admin users', () => {
  const adminGroups = buildVisibleAdminNavGroups(createContext(['admin']));
  const adminHrefs = new Set(adminGroups.flatMap((group) => group.items.map((item) => item.href)));
  assert.equal(adminHrefs.has('/admin/pricing-billing'), true, 'pricing-billing route must remain in admin nav');
  assert.equal(adminHrefs.has('/admin/data-retention'), true, 'data-retention route must remain in admin nav');
  assert.equal(adminHrefs.has('/admin/user-billing'), true, 'user-billing route must remain in admin nav');

  const userGroups = buildVisibleAdminNavGroups(createContext([]));
  const userHrefs = new Set(userGroups.flatMap((group) => group.items.map((item) => item.href)));
  assert.equal(userHrefs.has('/admin/pricing-billing'), false, 'pricing-billing must remain hidden for non-admin');
  assert.equal(userHrefs.has('/admin/data-retention'), false, 'data-retention must remain hidden for non-admin');
  assert.equal(userHrefs.has('/admin/user-billing'), false, 'user-billing must remain hidden for non-admin');
});

test('isAdminEmail returns false for unknown emails', () => {
  assert.equal(isAdminEmail('unknown@quizmind.dev'), false);
});
