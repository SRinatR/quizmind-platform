import assert from 'node:assert/strict';
import test from 'node:test';

import { ForbiddenException } from '@nestjs/common';
import { issueAccessToken } from '@quizmind/auth';

import { createIntegrationHarness } from './integration-helpers';

async function createSessionSnapshotForUser(harness: NonNullable<Awaited<ReturnType<typeof createIntegrationHarness>>>, input: {
  email: string;
  userId: string;
  roles?: string[];
}) {
  const session = await harness.sessionRepository.create({
    userId: input.userId,
    tokenHash: `platform-session-${harness.uniqueId}-${input.userId}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 Chrome/123.0.0.0',
  });

  const accessToken = await issueAccessToken({
    secret: harness.env.jwtSecret,
    sessionId: session.id,
    userId: input.userId,
    email: input.email,
    roles: (input.roles ?? []) as Array<
      'super_admin' | 'platform_admin' | 'billing_admin' | 'support_admin' | 'security_admin' | 'ops_admin' | 'content_admin'
    >,
  });

  return harness.authService.getCurrentSession(accessToken.token);
}

test('Prisma-backed workspace listing returns persisted memberships in creation order', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `workspaces-${harness.uniqueId}@quizmind.dev`;
  let userId: string | null = null;
  const workspaceIds: string[] = [];

  t.after(async () => {
    if (userId) {
      await harness.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }

    for (const workspaceId of workspaceIds) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const firstWorkspace = await harness.prisma.workspace.create({
    data: {
      slug: `first-${harness.uniqueId}`,
      name: 'First Workspace',
      billingEmail: `billing-first-${harness.uniqueId}@quizmind.dev`,
    },
  });
  const secondWorkspace = await harness.prisma.workspace.create({
    data: {
      slug: `second-${harness.uniqueId}`,
      name: 'Second Workspace',
      billingEmail: `billing-second-${harness.uniqueId}@quizmind.dev`,
    },
  });

  workspaceIds.push(firstWorkspace.id, secondWorkspace.id);

  const user = await harness.prisma.user.create({
    data: {
      email,
      displayName: 'Workspace Listing User',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
    },
  });

  userId = user.id;

  await harness.prisma.workspaceMembership.createMany({
    data: [
      {
        userId,
        workspaceId: firstWorkspace.id,
        role: 'workspace_owner',
      },
      {
        userId,
        workspaceId: secondWorkspace.id,
        role: 'workspace_viewer',
      },
    ],
  });

  const snapshot = await createSessionSnapshotForUser(harness, {
    email,
    userId,
  });
  const result = await harness.platformService.listWorkspacesForCurrentSession(snapshot);

  assert.equal(result.personaKey, 'connected-user');
  assert.deepEqual(result.items, [
    {
      id: firstWorkspace.id,
      slug: firstWorkspace.slug,
      name: firstWorkspace.name,
      role: 'workspace_owner',
    },
    {
      id: secondWorkspace.id,
      slug: secondWorkspace.slug,
      name: secondWorkspace.name,
      role: 'workspace_viewer',
    },
  ]);
});

test('Prisma-backed admin user listing returns persisted users, roles, and workspace memberships', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const adminEmail = `users-admin-${harness.uniqueId}@quizmind.dev`;
  const supportEmail = `users-support-${harness.uniqueId}@quizmind.dev`;
  let adminUserId: string | null = null;
  let supportUserId: string | null = null;
  let workspaceId: string | null = null;

  t.after(async () => {
    if (adminUserId) {
      await harness.prisma.user.delete({ where: { id: adminUserId } }).catch(() => undefined);
    }

    if (supportUserId) {
      await harness.prisma.user.delete({ where: { id: supportUserId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `users-${harness.uniqueId}`,
      name: 'Users Workspace',
    },
  });

  workspaceId = workspace.id;

  const adminUser = await harness.prisma.user.create({
    data: {
      email: adminEmail,
      displayName: 'Users Admin',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
      systemRoleAssignments: {
        create: {
          role: 'platform_admin',
        },
      },
      memberships: {
        create: {
          workspaceId,
          role: 'workspace_owner',
        },
      },
    },
  });

  adminUserId = adminUser.id;

  const supportUser = await harness.prisma.user.create({
    data: {
      email: supportEmail,
      displayName: 'Users Support',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:15:00.000Z'),
      systemRoleAssignments: {
        create: {
          role: 'support_admin',
        },
      },
    },
  });

  supportUserId = supportUser.id;

  const snapshot = await createSessionSnapshotForUser(harness, {
    email: adminEmail,
    userId: adminUserId,
    roles: ['platform_admin'],
  });

  const result = await harness.platformService.listUsersForCurrentSession(snapshot);
  const createdUsers = result.items.filter(
    (item) => item.email === adminEmail || item.email === supportEmail,
  );

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(createdUsers.length, 2);
  assert.ok(createdUsers.some((item) => item.email === adminEmail && item.systemRoles.includes('platform_admin')));
  assert.ok(createdUsers.some((item) => item.email === supportEmail && item.systemRoles.includes('support_admin')));
  assert.ok(
    createdUsers.some(
      (item) =>
        item.email === adminEmail &&
        item.workspaces.some((workspace) => workspace.workspaceId === workspaceId && workspace.role === 'workspace_owner'),
    ),
  );
});

test('Prisma-backed admin user listing denies workspace-only users without users:read', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `users-denied-${harness.uniqueId}@quizmind.dev`;
  let userId: string | null = null;
  let workspaceId: string | null = null;

  t.after(async () => {
    if (userId) {
      await harness.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `users-denied-${harness.uniqueId}`,
      name: 'Users Denied Workspace',
    },
  });

  workspaceId = workspace.id;

  const user = await harness.prisma.user.create({
    data: {
      email,
      displayName: 'Users Denied Viewer',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
      memberships: {
        create: {
          workspaceId,
          role: 'workspace_owner',
        },
      },
    },
  });

  userId = user.id;

  const snapshot = await createSessionSnapshotForUser(harness, {
    email,
    userId,
  });

  await assert.rejects(
    () => harness.platformService.listUsersForCurrentSession(snapshot),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: users:read/);
      return true;
    },
  );
});

test('Prisma-backed subscription lookup returns persisted plan, status, and entitlement overrides', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `subscription-${harness.uniqueId}@quizmind.dev`;
  let userId: string | null = null;
  let workspaceId: string | null = null;
  let planId: string | null = null;

  t.after(async () => {
    if (userId) {
      await harness.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    if (planId) {
      await harness.prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `billing-${harness.uniqueId}`,
      name: 'Billing Workspace',
      billingEmail: `billing-${harness.uniqueId}@quizmind.dev`,
      entitlementOverrides: {
        create: {
          key: 'limit.requests_per_day',
          enabled: true,
          limitValue: 250,
          reason: 'Integration override',
        },
      },
    },
  });

  workspaceId = workspace.id;

  const plan = await harness.prisma.plan.create({
    data: {
      code: `integration-plan-${harness.uniqueId}`,
      name: 'Integration Plan',
      description: 'Plan for Prisma platform integration tests.',
      entitlements: {
        create: [
          {
            key: 'feature.text_answering',
            enabled: true,
          },
          {
            key: 'limit.requests_per_day',
            enabled: true,
            limitValue: 25,
          },
        ],
      },
    },
  });

  planId = plan.id;

  const user = await harness.prisma.user.create({
    data: {
      email,
      displayName: 'Billing User',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
    },
  });

  userId = user.id;

  await harness.prisma.workspaceMembership.create({
    data: {
      userId,
      workspaceId,
      role: 'workspace_owner',
    },
  });

  await harness.prisma.subscription.create({
    data: {
      workspaceId,
      planId,
      externalId: `integration-subscription-${harness.uniqueId}`,
      status: 'active',
      billingInterval: 'monthly',
      seatCount: 7,
      currentPeriodStart: new Date('2026-03-23T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-04-23T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    },
  });

  const snapshot = await createSessionSnapshotForUser(harness, {
    email,
    userId,
  });
  const result = await harness.platformService.getSubscriptionForCurrentSession(snapshot, workspaceId);

  assert.equal(result.workspace.id, workspaceId);
  assert.equal(result.workspace.slug, workspace.slug);
  assert.equal(result.accessDecision.allowed, true);
  assert.equal(result.summary.planCode, `integration-plan-${harness.uniqueId}`);
  assert.equal(result.summary.status, 'active');
  assert.equal(result.summary.seatCount, 7);
  assert.equal(result.summary.currentPeriodEnd, '2026-04-23T00:00:00.000Z');
  assert.deepEqual(result.summary.entitlements, [
    { key: 'feature.text_answering', enabled: true, limit: undefined },
    { key: 'limit.requests_per_day', enabled: true, limit: 250 },
  ]);
});

test('Prisma-backed subscription lookup denies workspace viewers without billing permission', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `viewer-${harness.uniqueId}@quizmind.dev`;
  let userId: string | null = null;
  let workspaceId: string | null = null;

  t.after(async () => {
    if (userId) {
      await harness.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `viewer-${harness.uniqueId}`,
      name: 'Viewer Workspace',
      billingEmail: `viewer-billing-${harness.uniqueId}@quizmind.dev`,
    },
  });

  workspaceId = workspace.id;

  const user = await harness.prisma.user.create({
    data: {
      email,
      displayName: 'Viewer User',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
    },
  });

  userId = user.id;

  await harness.prisma.workspaceMembership.create({
    data: {
      userId,
      workspaceId,
      role: 'workspace_viewer',
    },
  });

  const snapshot = await createSessionSnapshotForUser(harness, {
    email,
    userId,
  });

  await assert.rejects(
    () => harness.platformService.getSubscriptionForCurrentSession(snapshot, workspaceId!),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: subscriptions:read/);
      return true;
    },
  );
});

test('Prisma-backed feature flag listing returns persisted flags for connected admins', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `flags-${harness.uniqueId}@quizmind.dev`;
  let userId: string | null = null;
  const featureFlagIds: string[] = [];

  t.after(async () => {
    if (userId) {
      await harness.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }

    for (const featureFlagId of featureFlagIds) {
      await harness.prisma.featureFlag.delete({ where: { id: featureFlagId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const remoteConfigFlag = await harness.prisma.featureFlag.create({
    data: {
      key: `beta.remote-config-v2-${harness.uniqueId}`,
      description: 'Enable the second-generation remote config payload.',
      status: 'active',
      enabled: true,
      rolloutPercentage: 100,
      minimumExtensionVersion: '1.5.0',
    },
  });
  const bannerFlag = await harness.prisma.featureFlag.create({
    data: {
      key: `ops.force-upgrade-banner-${harness.uniqueId}`,
      description: 'Show banner when the client is below the recommended version.',
      status: 'paused',
      enabled: false,
    },
  });

  featureFlagIds.push(remoteConfigFlag.id, bannerFlag.id);

  const user = await harness.prisma.user.create({
    data: {
      email,
      displayName: 'Feature Flag Admin',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
      systemRoleAssignments: {
        create: {
          role: 'platform_admin',
        },
      },
    },
    include: {
      systemRoleAssignments: true,
    },
  });

  userId = user.id;

  const snapshot = await createSessionSnapshotForUser(harness, {
    email,
    userId,
    roles: ['platform_admin'],
  });
  const result = await harness.platformService.listFeatureFlagsForCurrentSession(snapshot);
  const createdFlags = result.flags.filter((flag) => flag.key.includes(harness.uniqueId));

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.publishDecision.allowed, true);
  assert.ok(result.permissions.includes('feature_flags:read'));
  assert.deepEqual(createdFlags.map((flag) => flag.key), [
    remoteConfigFlag.key,
    bannerFlag.key,
  ]);
  assert.equal(createdFlags[0]?.minimumExtensionVersion, '1.5.0');
  assert.equal(createdFlags[1]?.rolloutPercentage, undefined);
});

test('Prisma-backed feature flag listing denies workspace-only users without feature flag permission', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `flags-viewer-${harness.uniqueId}@quizmind.dev`;
  let userId: string | null = null;
  let workspaceId: string | null = null;

  t.after(async () => {
    if (userId) {
      await harness.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `flags-viewer-${harness.uniqueId}`,
      name: 'Flags Viewer Workspace',
    },
  });

  workspaceId = workspace.id;

  const user = await harness.prisma.user.create({
    data: {
      email,
      displayName: 'Flags Viewer',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
    },
  });

  userId = user.id;

  await harness.prisma.workspaceMembership.create({
    data: {
      userId,
      workspaceId,
      role: 'workspace_owner',
    },
  });

  const snapshot = await createSessionSnapshotForUser(harness, {
    email,
    userId,
  });

  await assert.rejects(
    () => harness.platformService.listFeatureFlagsForCurrentSession(snapshot),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: feature_flags:read/);
      return true;
    },
  );
});

test('Prisma-backed remote config publish persists a new active version and deactivates the previous one', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `remote-config-${harness.uniqueId}@quizmind.dev`;
  let userId: string | null = null;
  let workspaceId: string | null = null;
  let previousVersionId: string | null = null;

  t.after(async () => {
    if (userId) {
      await harness.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `remote-config-${harness.uniqueId}`,
      name: 'Remote Config Workspace',
    },
  });

  workspaceId = workspace.id;

  const user = await harness.prisma.user.create({
    data: {
      email,
      displayName: 'Remote Config Admin',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
      systemRoleAssignments: {
        create: {
          role: 'platform_admin',
        },
      },
    },
  });

  userId = user.id;

  const previousVersion = await harness.prisma.remoteConfigVersion.create({
    data: {
      workspaceId,
      publishedById: userId,
      versionLabel: `old-${harness.uniqueId}`,
      isActive: true,
      layers: {
        create: {
          scope: 'workspace',
          priority: 10,
          valuesJson: {
            answerStyle: 'compact',
          },
        },
      },
    },
  });

  previousVersionId = previousVersion.id;

  const snapshot = await createSessionSnapshotForUser(harness, {
    email,
    userId,
    roles: ['platform_admin'],
  });

  const result = await harness.platformService.publishRemoteConfigForCurrentSession(snapshot, {
    versionLabel: `new-${harness.uniqueId}`,
    workspaceId,
    layers: [
      {
        id: 'workspace-base',
        scope: 'workspace',
        priority: 20,
        conditions: {
          workspaceId,
        },
        values: {
          answerStyle: 'detailed',
        },
      },
      {
        id: 'feature-override',
        scope: 'flag',
        priority: 40,
        conditions: {
          activeFlags: ['beta.remote-config-v2'],
        },
        values: {
          showCitations: true,
        },
      },
    ],
  });

  const versions = await harness.prisma.remoteConfigVersion.findMany({
    where: { workspaceId },
    include: {
      layers: {
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  assert.equal(result.publishResult.versionLabel, `new-${harness.uniqueId}`);
  assert.equal(result.publishResult.actorId, userId);
  assert.equal(result.publishResult.workspaceId, workspaceId);
  assert.equal(result.publishResult.appliedLayerCount, 2);
  assert.deepEqual(result.preview.values, {
    answerStyle: 'detailed',
    showCitations: true,
  });
  assert.equal(versions.length, 2);
  assert.equal(versions[0]?.id, previousVersionId);
  assert.equal(versions[0]?.isActive, false);
  assert.equal(versions[1]?.versionLabel, `new-${harness.uniqueId}`);
  assert.equal(versions[1]?.isActive, true);
  assert.deepEqual(versions[1]?.layers.map((layer) => layer.priority), [20, 40]);
});

test('Prisma-backed remote config publish denies workspace-only users without publish permission', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `remote-config-viewer-${harness.uniqueId}@quizmind.dev`;
  let userId: string | null = null;
  let workspaceId: string | null = null;

  t.after(async () => {
    if (userId) {
      await harness.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `remote-config-viewer-${harness.uniqueId}`,
      name: 'Remote Config Viewer Workspace',
    },
  });

  workspaceId = workspace.id;

  const user = await harness.prisma.user.create({
    data: {
      email,
      displayName: 'Remote Config Viewer',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
    },
  });

  userId = user.id;

  await harness.prisma.workspaceMembership.create({
    data: {
      userId,
      workspaceId,
      role: 'workspace_owner',
    },
  });

  const snapshot = await createSessionSnapshotForUser(harness, {
    email,
    userId,
  });

  await assert.rejects(
    () =>
      harness.platformService.publishRemoteConfigForCurrentSession(snapshot, {
        versionLabel: `denied-${harness.uniqueId}`,
        workspaceId,
        layers: [
          {
            id: 'workspace-base',
            scope: 'workspace',
            priority: 20,
            values: {
              answerStyle: 'detailed',
            },
          },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: remote_config:publish/);
      return true;
    },
  );
});

test('Prisma-backed extension bootstrap resolves persisted flags, active config, and workspace subscription plan', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `bootstrap-${harness.uniqueId}@quizmind.dev`;
  let userId: string | null = null;
  let workspaceId: string | null = null;
  let planId: string | null = null;
  let compatibilityRuleId: string | null = null;
  const featureFlagIds: string[] = [];

  t.after(async () => {
    for (const featureFlagId of featureFlagIds) {
      await harness.prisma.featureFlag.delete({ where: { id: featureFlagId } }).catch(() => undefined);
    }

    if (compatibilityRuleId) {
      await harness.prisma.extensionCompatibilityRule.delete({ where: { id: compatibilityRuleId } }).catch(() => undefined);
    }

    if (userId) {
      await harness.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    if (planId) {
      await harness.prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `bootstrap-${harness.uniqueId}`,
      name: 'Bootstrap Workspace',
    },
  });

  workspaceId = workspace.id;

  const plan = await harness.prisma.plan.create({
    data: {
      code: `bootstrap-plan-${harness.uniqueId}`,
      name: 'Bootstrap Plan',
      description: 'Plan used to verify extension bootstrap resolution.',
    },
  });

  planId = plan.id;

  const user = await harness.prisma.user.create({
    data: {
      email,
      displayName: 'Bootstrap User',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
    },
  });

  userId = user.id;

  await harness.prisma.workspaceMembership.create({
    data: {
      userId,
      workspaceId,
      role: 'workspace_owner',
    },
  });

  await harness.prisma.subscription.create({
    data: {
      workspaceId,
      planId,
      externalId: `bootstrap-subscription-${harness.uniqueId}`,
      status: 'active',
      billingInterval: 'monthly',
      seatCount: 3,
      currentPeriodStart: new Date('2026-03-23T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-04-23T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    },
  });

  const featureFlag = await harness.prisma.featureFlag.create({
    data: {
      key: `bootstrap-flag-${harness.uniqueId}`,
      description: 'Enable a persisted bootstrap flag.',
      status: 'active',
      enabled: true,
      minimumExtensionVersion: '1.5.0',
    },
  });

  featureFlagIds.push(featureFlag.id);

  const compatibilityRule = await harness.prisma.extensionCompatibilityRule.create({
    data: {
      minimumVersion: '1.4.0',
      recommendedVersion: '1.6.0',
      supportedSchemaVersions: ['2'],
      requiredCapabilities: ['quiz-capture'],
      resultStatus: 'supported',
      reason: 'Integration compatibility policy for bootstrap resolution.',
    },
  });

  compatibilityRuleId = compatibilityRule.id;

  await harness.prisma.remoteConfigVersion.create({
    data: {
      versionLabel: `bootstrap-global-${harness.uniqueId}`,
      isActive: true,
      layers: {
        create: [
          {
            scope: 'global',
            priority: 5,
            valuesJson: {
              bootstrapTheme: 'compact',
            },
          },
          {
            scope: 'plan',
            priority: 10,
            conditionsJson: {
              planCode: plan.code,
            },
            valuesJson: {
              bootstrapTheme: 'detailed',
            },
          },
        ],
      },
    },
  });

  await harness.prisma.remoteConfigVersion.create({
    data: {
      workspaceId,
      versionLabel: `bootstrap-workspace-${harness.uniqueId}`,
      isActive: true,
      layers: {
        create: {
          scope: 'workspace',
          priority: 20,
          conditionsJson: {
            workspaceId,
          },
          valuesJson: {
            workspaceBootstrapEnabled: true,
          },
        },
      },
    },
  });

  const result = await harness.platformService.bootstrapExtensionForConnectedRuntime({
    installationId: `inst-${harness.uniqueId}`,
    userId,
    workspaceId,
    environment: 'development',
    handshake: {
      extensionVersion: '1.5.0',
      schemaVersion: '2',
      capabilities: ['quiz-capture', 'history-sync'],
      browser: 'chrome',
    },
  });

  assert.equal(result.compatibility.status, 'supported_with_warnings');
  assert.equal(result.compatibility.minimumVersion, '1.4.0');
  assert.equal(result.compatibility.recommendedVersion, '1.6.0');
  assert.ok(result.featureFlags.includes(featureFlag.key));
  assert.equal(result.remoteConfig.values.bootstrapTheme, 'detailed');
  assert.equal(result.remoteConfig.values.workspaceBootstrapEnabled, true);
  assert.ok(result.remoteConfig.appliedLayerIds.length >= 3);
});

test('Prisma-backed support impersonation persists a session plus audit and security events for support admins', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const supportEmail = `support-${harness.uniqueId}@quizmind.dev`;
  const targetEmail = `target-${harness.uniqueId}@quizmind.dev`;
  let supportUserId: string | null = null;
  let targetUserId: string | null = null;
  let workspaceId: string | null = null;
  let impersonationSessionId: string | null = null;
  let auditLogId: string | null = null;
  let securityEventId: string | null = null;
  let supportTicketId: string | null = null;

  t.after(async () => {
    if (auditLogId) {
      await harness.prisma.auditLog.delete({ where: { id: auditLogId } }).catch(() => undefined);
    }

    if (securityEventId) {
      await harness.prisma.securityEvent.delete({ where: { id: securityEventId } }).catch(() => undefined);
    }

    if (impersonationSessionId) {
      await harness.prisma.supportImpersonationSession
        .delete({ where: { id: impersonationSessionId } })
        .catch(() => undefined);
    }

    if (supportTicketId) {
      await harness.prisma.supportTicket.delete({ where: { id: supportTicketId } }).catch(() => undefined);
    }

    if (supportUserId) {
      await harness.prisma.user.delete({ where: { id: supportUserId } }).catch(() => undefined);
    }

    if (targetUserId) {
      await harness.prisma.user.delete({ where: { id: targetUserId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `support-${harness.uniqueId}`,
      name: 'Support Workspace',
    },
  });

  workspaceId = workspace.id;

  const supportUser = await harness.prisma.user.create({
    data: {
      email: supportEmail,
      displayName: 'Support Admin',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
      systemRoleAssignments: {
        create: {
          role: 'support_admin',
        },
      },
    },
  });

  supportUserId = supportUser.id;

  const targetUser = await harness.prisma.user.create({
    data: {
      email: targetEmail,
      displayName: 'Target User',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
      memberships: {
        create: {
          workspaceId,
          role: 'workspace_viewer',
        },
      },
    },
  });

  targetUserId = targetUser.id;

  const supportTicket = await harness.prisma.supportTicket.create({
    data: {
      workspaceId,
      requesterId: targetUserId,
      subject: `Ticket ${harness.uniqueId}: viewer cannot access billing settings`,
      body: 'Requester is blocked from a workspace billing page and needs operator help.',
      status: 'open',
    },
  });

  supportTicketId = supportTicket.id;

  const snapshot = await createSessionSnapshotForUser(harness, {
    email: supportEmail,
    userId: supportUserId,
    roles: ['support_admin'],
  });

  const result = await harness.platformService.startSupportImpersonationForCurrentSession(snapshot, {
    targetUserId,
    workspaceId,
    reason: 'Investigating a workspace access issue from integration test coverage.',
    supportTicketId,
    operatorNote: 'Linked from the support ticket queue during integration coverage.',
  });

  impersonationSessionId = result.result.impersonationSessionId;

  const persistedSession = await harness.prisma.supportImpersonationSession.findUnique({
    where: { id: impersonationSessionId },
  });
  const persistedAuditLog = await harness.prisma.auditLog.findFirst({
    where: {
      actorId: supportUserId,
      workspaceId,
      action: 'support.impersonation_started',
      targetId: targetUserId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  const persistedSecurityEvent = await harness.prisma.securityEvent.findFirst({
    where: {
      actorId: supportUserId,
      workspaceId,
      eventType: 'security.impersonation_started',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  auditLogId = persistedAuditLog?.id ?? null;
  securityEventId = persistedSecurityEvent?.id ?? null;

  assert.ok(persistedSession);
  assert.equal(persistedSession?.supportActorId, supportUserId);
  assert.equal(persistedSession?.targetUserId, targetUserId);
  assert.equal(persistedSession?.workspaceId, workspaceId);
  assert.equal(
    persistedSession?.reason,
    'Investigating a workspace access issue from integration test coverage.',
  );
  assert.equal(persistedSession?.supportTicketId, supportTicketId);
  assert.equal(persistedSession?.operatorNote, 'Linked from the support ticket queue during integration coverage.');
  assert.ok(persistedAuditLog);
  assert.equal(persistedAuditLog?.targetType, 'user');
  assert.equal(
    (persistedAuditLog?.metadataJson as Record<string, unknown> | null)?.reason,
    'Investigating a workspace access issue from integration test coverage.',
  );
  assert.ok(persistedSecurityEvent);
  assert.equal(persistedSecurityEvent?.severity, 'warn');
  assert.equal(result.auditLog.eventType, 'support.impersonation_started');
  assert.equal(result.securityLog.eventType, 'security.impersonation_started');

  const history = await harness.platformService.listSupportImpersonationSessionsForCurrentSession(snapshot);
  const createdHistoryItem = history.items.find((item) => item.impersonationSessionId === impersonationSessionId);

  assert.equal(history.personaKey, 'connected-user');
  assert.equal(history.accessDecision.allowed, true);
  assert.ok(createdHistoryItem);
  assert.equal(createdHistoryItem?.supportActor.email, supportEmail);
  assert.equal(createdHistoryItem?.targetUser.email, targetEmail);
  assert.equal(createdHistoryItem?.workspace?.id, workspaceId);
  assert.equal(createdHistoryItem?.supportTicket?.id, supportTicketId);
  assert.equal(createdHistoryItem?.operatorNote, 'Linked from the support ticket queue during integration coverage.');
});

test('Prisma-backed support ticket queue returns recent open tickets for support admins', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const requesterEmail = `ticket-requester-${harness.uniqueId}@quizmind.dev`;
  const supportEmail = `ticket-support-${harness.uniqueId}@quizmind.dev`;
  let requesterId: string | null = null;
  let supportUserId: string | null = null;
  let workspaceId: string | null = null;
  let supportTicketId: string | null = null;

  t.after(async () => {
    if (supportTicketId) {
      await harness.prisma.supportTicket.delete({ where: { id: supportTicketId } }).catch(() => undefined);
    }

    if (supportUserId) {
      await harness.prisma.user.delete({ where: { id: supportUserId } }).catch(() => undefined);
    }

    if (requesterId) {
      await harness.prisma.user.delete({ where: { id: requesterId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `support-ticket-${harness.uniqueId}`,
      name: 'Support Ticket Workspace',
    },
  });

  workspaceId = workspace.id;

  const requester = await harness.prisma.user.create({
    data: {
      email: requesterEmail,
      displayName: 'Support Ticket Requester',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
    },
  });

  requesterId = requester.id;

  const supportUser = await harness.prisma.user.create({
    data: {
      email: supportEmail,
      displayName: 'Support Ticket Admin',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
      systemRoleAssignments: {
        create: {
          role: 'support_admin',
        },
      },
    },
  });

  supportUserId = supportUser.id;

  const supportTicket = await harness.prisma.supportTicket.create({
    data: {
      workspaceId,
      requesterId,
      subject: `Ticket ${harness.uniqueId}: need help with billing access`,
      body: 'Requester needs operator help to understand a billing access denial.',
      status: 'open',
    },
  });

  supportTicketId = supportTicket.id;

  const snapshot = await createSessionSnapshotForUser(harness, {
    email: supportEmail,
    userId: supportUserId,
    roles: ['support_admin'],
  });

  const result = await harness.platformService.listSupportTicketsForCurrentSession(snapshot);
  const createdTicket = result.items.find((item) => item.id === supportTicketId);

  assert.equal(result.personaKey, 'connected-user');
  assert.equal(result.accessDecision.allowed, true);
  assert.ok(createdTicket);
  assert.equal(createdTicket?.requester.email, requesterEmail);
  assert.equal(createdTicket?.workspace?.id, workspaceId);
  assert.equal(createdTicket?.status, 'open');
});

test('Prisma-backed support impersonation can end an active session and persist termination logs', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const supportEmail = `support-end-${harness.uniqueId}@quizmind.dev`;
  const targetEmail = `target-end-${harness.uniqueId}@quizmind.dev`;
  let supportUserId: string | null = null;
  let targetUserId: string | null = null;
  let workspaceId: string | null = null;
  let impersonationSessionId: string | null = null;
  let endedAuditLogId: string | null = null;
  let endedSecurityEventId: string | null = null;
  let supportTicketId: string | null = null;

  t.after(async () => {
    if (endedAuditLogId) {
      await harness.prisma.auditLog.delete({ where: { id: endedAuditLogId } }).catch(() => undefined);
    }

    if (endedSecurityEventId) {
      await harness.prisma.securityEvent.delete({ where: { id: endedSecurityEventId } }).catch(() => undefined);
    }

    if (impersonationSessionId) {
      if (supportUserId && targetUserId) {
        await harness.prisma.auditLog
          .deleteMany({
            where: {
              action: 'support.impersonation_started',
              targetId: targetUserId,
              actorId: supportUserId,
            },
          })
          .catch(() => undefined);
      }

      if (supportUserId) {
        await harness.prisma.securityEvent
          .deleteMany({
            where: {
              eventType: 'security.impersonation_started',
              actorId: supportUserId,
            },
          })
          .catch(() => undefined);
      }

      await harness.prisma.supportImpersonationSession
        .delete({ where: { id: impersonationSessionId } })
        .catch(() => undefined);
    }

    if (supportTicketId) {
      await harness.prisma.supportTicket.delete({ where: { id: supportTicketId } }).catch(() => undefined);
    }

    if (supportUserId) {
      await harness.prisma.user.delete({ where: { id: supportUserId } }).catch(() => undefined);
    }

    if (targetUserId) {
      await harness.prisma.user.delete({ where: { id: targetUserId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `support-end-${harness.uniqueId}`,
      name: 'Support End Workspace',
    },
  });

  workspaceId = workspace.id;

  const supportUser = await harness.prisma.user.create({
    data: {
      email: supportEmail,
      displayName: 'Support End Admin',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
      systemRoleAssignments: {
        create: {
          role: 'support_admin',
        },
      },
    },
  });

  supportUserId = supportUser.id;

  const targetUser = await harness.prisma.user.create({
    data: {
      email: targetEmail,
      displayName: 'Support End Target',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
      memberships: {
        create: {
          workspaceId,
          role: 'workspace_viewer',
        },
      },
    },
  });

  targetUserId = targetUser.id;

  const supportTicket = await harness.prisma.supportTicket.create({
    data: {
      workspaceId,
      requesterId: targetUserId,
      subject: `Ticket ${harness.uniqueId}: close after validation`,
      body: 'Support will end the linked impersonation session after validation.',
      status: 'in_progress',
    },
  });

  supportTicketId = supportTicket.id;

  const snapshot = await createSessionSnapshotForUser(harness, {
    email: supportEmail,
    userId: supportUserId,
    roles: ['support_admin'],
  });

  const started = await harness.platformService.startSupportImpersonationForCurrentSession(snapshot, {
    targetUserId,
    workspaceId,
    reason: 'Starting a support session before termination coverage.',
    supportTicketId,
    operatorNote: 'Operator confirmed ticket context before starting the session.',
  });

  impersonationSessionId = started.result.impersonationSessionId;

  const ended = await harness.platformService.endSupportImpersonationForCurrentSession(snapshot, {
    impersonationSessionId,
  });

  const persistedSession = await harness.prisma.supportImpersonationSession.findUnique({
    where: { id: impersonationSessionId },
  });
  const persistedAuditLog = await harness.prisma.auditLog.findFirst({
    where: {
      actorId: supportUserId,
      workspaceId,
      action: 'support.impersonation_ended',
      targetId: targetUserId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  const persistedSecurityEvent = await harness.prisma.securityEvent.findFirst({
    where: {
      actorId: supportUserId,
      workspaceId,
      eventType: 'security.impersonation_ended',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  endedAuditLogId = persistedAuditLog?.id ?? null;
  endedSecurityEventId = persistedSecurityEvent?.id ?? null;

  assert.ok(persistedSession?.endedAt);
  assert.equal(ended.impersonationSessionId, impersonationSessionId);
  assert.equal(ended.targetUserId, targetUserId);
  assert.equal(ended.workspaceId, workspaceId);
  assert.equal(ended.reason, 'Starting a support session before termination coverage.');
  assert.equal(ended.createdAt, persistedSession?.createdAt.toISOString());
  assert.equal(ended.endedAt, persistedSession?.endedAt?.toISOString());
  assert.equal(ended.supportTicket?.id, supportTicketId);
  assert.equal(ended.operatorNote, 'Operator confirmed ticket context before starting the session.');
  assert.ok(persistedAuditLog);
  assert.equal(
    (persistedAuditLog?.metadataJson as Record<string, unknown> | null)?.impersonationSessionId,
    impersonationSessionId,
  );
  assert.ok(persistedSecurityEvent);
  assert.equal(
    (persistedSecurityEvent?.metadataJson as Record<string, unknown> | null)?.impersonationSessionId,
    impersonationSessionId,
  );

  const history = await harness.platformService.listSupportImpersonationSessionsForCurrentSession(snapshot);
  const endedHistoryItem = history.items.find((item) => item.impersonationSessionId === impersonationSessionId);

  assert.ok(endedHistoryItem?.endedAt);
  assert.equal(endedHistoryItem?.endedAt, ended.endedAt);
  assert.equal(endedHistoryItem?.supportTicket?.id, supportTicketId);
  assert.equal(endedHistoryItem?.operatorNote, 'Operator confirmed ticket context before starting the session.');
});

test('Prisma-backed support impersonation denies users without support permission', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `support-denied-${harness.uniqueId}@quizmind.dev`;
  const targetEmail = `support-denied-target-${harness.uniqueId}@quizmind.dev`;
  let userId: string | null = null;
  let targetUserId: string | null = null;
  let workspaceId: string | null = null;

  t.after(async () => {
    if (userId) {
      await harness.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }

    if (targetUserId) {
      await harness.prisma.user.delete({ where: { id: targetUserId } }).catch(() => undefined);
    }

    if (workspaceId) {
      await harness.prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const workspace = await harness.prisma.workspace.create({
    data: {
      slug: `support-denied-${harness.uniqueId}`,
      name: 'Support Denied Workspace',
    },
  });

  workspaceId = workspace.id;

  const user = await harness.prisma.user.create({
    data: {
      email,
      displayName: 'Workspace Owner Without Support Role',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
      memberships: {
        create: {
          workspaceId,
          role: 'workspace_owner',
        },
      },
    },
  });

  userId = user.id;

  const targetUser = await harness.prisma.user.create({
    data: {
      email: targetEmail,
      displayName: 'Denied Target User',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
    },
  });

  targetUserId = targetUser.id;

  const snapshot = await createSessionSnapshotForUser(harness, {
    email,
    userId,
  });

  await assert.rejects(
    () =>
      harness.platformService.startSupportImpersonationForCurrentSession(snapshot, {
        targetUserId,
        workspaceId,
        reason: 'This user should not be allowed to impersonate.',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match((error as Error).message, /Missing permission: support:impersonate/);
      return true;
    },
  );
});
