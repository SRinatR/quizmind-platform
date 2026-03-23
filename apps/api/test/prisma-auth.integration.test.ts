import assert from 'node:assert/strict';
import test from 'node:test';

import { issueAccessToken } from '@quizmind/auth';

import { createIntegrationHarness } from './integration-helpers';

test('Prisma-backed register persists the user, session, and email verification rows', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `integration-${harness.uniqueId}@quizmind.dev`;
  let userId: string | null = null;

  t.after(async () => {
    if (userId) {
      await harness.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }

    await harness.disconnect();
  });

  const result = await harness.authService.register(
    {
      email,
      password: 'integration-password',
      displayName: 'Integration User',
    },
    {
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 Chrome/123.0.0.0',
    },
  );

  const user = await harness.userRepository.findByEmail(email);

  assert.ok(user);
  userId = user.id;

  const sessions = await harness.prisma.session.findMany({
    where: {
      userId,
    },
  });
  const verifications = await harness.prisma.emailVerification.findMany({
    where: {
      userId,
    },
  });

  assert.equal(result.session.user.email, email);
  assert.equal(result.session.user.displayName, 'Integration User');
  assert.ok(result.session.accessToken.length > 20);
  assert.equal(result.emailVerification.required, true);
  assert.equal(result.emailVerification.delivery?.provider, 'noop');
  assert.equal(user.displayName, 'Integration User');
  assert.equal(user.emailVerifiedAt ?? null, null);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.browser, 'chrome');
  assert.equal(verifications.length, 1);
  assert.equal(verifications[0]?.verifiedAt ?? null, null);
});

test('Prisma-backed current session resolves persisted roles and workspace memberships', async (t) => {
  const harness = await createIntegrationHarness(t);

  if (!harness) {
    return;
  }

  const email = `session-${harness.uniqueId}@quizmind.dev`;
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
      slug: `integration-${harness.uniqueId}`,
      name: 'Integration Workspace',
      billingEmail: `billing-${harness.uniqueId}@quizmind.dev`,
    },
  });

  workspaceId = workspace.id;

  const user = await harness.prisma.user.create({
    data: {
      email,
      displayName: 'Session Integration User',
      passwordHash: 'integration-password-hash',
      emailVerifiedAt: new Date('2026-03-23T12:00:00.000Z'),
    },
  });

  userId = user.id;

  await harness.prisma.userSystemRole.create({
    data: {
      userId,
      role: 'platform_admin',
    },
  });

  await harness.prisma.workspaceMembership.create({
    data: {
      userId,
      workspaceId,
      role: 'workspace_owner',
    },
  });

  const session = await harness.sessionRepository.create({
    userId,
    tokenHash: `integration-session-${harness.uniqueId}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 Firefox/124.0.0.0',
  });

  const accessToken = await issueAccessToken({
    secret: harness.env.jwtSecret,
    sessionId: session.id,
    userId,
    email,
    roles: ['platform_admin'],
    issuer: harness.env.jwtIssuer,
    audience: harness.env.jwtAudience,
  });

  const snapshot = await harness.authService.getCurrentSession(accessToken.token);
  const workspaces = await harness.workspaceRepository.findByUserId(userId);

  assert.equal(snapshot.personaKey, 'connected-user');
  assert.equal(snapshot.user.email, email);
  assert.equal(snapshot.workspaces.length, 1);
  assert.equal(snapshot.workspaces[0]?.id, workspaceId);
  assert.equal(snapshot.workspaces[0]?.slug, workspace.slug);
  assert.equal(snapshot.workspaces[0]?.role, 'workspace_owner');
  assert.ok(snapshot.permissions.includes('workspaces:read'));
  assert.ok(snapshot.permissions.includes('subscriptions:read'));
  assert.ok(snapshot.permissions.includes('remote_config:publish'));
  assert.equal(workspaces.length, 1);
  assert.equal(workspaces[0]?.id, workspaceId);
  assert.equal(workspaces[0]?.memberships[0]?.role, 'workspace_owner');
});
