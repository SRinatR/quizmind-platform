import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthService } from '../src/auth/auth.service';
import { type EmailVerificationRepository } from '../src/auth/repositories/email-verification.repository';
import { type SessionRepository } from '../src/auth/repositories/session.repository';
import { type UserRepository } from '../src/auth/repositories/user.repository';

function createAuthService() {
  const userRepository = {
    getSystemRoles(user: any) {
      return user.systemRoleAssignments.map((assignment: any) => assignment.role);
    },
    getWorkspaceMemberships(user: any) {
      return user.memberships.map((membership: any) => ({
        workspaceId: membership.workspaceId,
        workspaceName: membership.workspace.name,
        workspaceSlug: membership.workspace.slug,
        role: membership.role,
      }));
    },
  } as unknown as UserRepository;

  const sessionRepository = {} as SessionRepository;
  const emailVerificationRepository = {} as EmailVerificationRepository;
  const service = new AuthService(userRepository, sessionRepository, emailVerificationRepository);

  service['env'] = {
    nodeEnv: 'test',
    appUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:4000',
    databaseUrl: 'postgresql://postgres:postgres@localhost:5432/quizmind',
    redisUrl: 'redis://localhost:6379',
    runtimeMode: 'connected',
    port: 4000,
    corsAllowedOrigins: ['http://localhost:3000'],
    jwtSecret: 'test-jwt-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    jwtIssuer: 'http://localhost:4000',
    jwtAudience: 'http://localhost:3000',
    emailProvider: 'noop',
    emailFrom: 'noreply@quizmind.local',
    billingProvider: 'mock',
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 120,
    authRateLimitWindowMs: 900000,
    authRateLimitMaxRequests: 10,
  };

  return { service, sessionRepository };
}

test('AuthService.getCurrentSession keeps the mock-compatible session shape in connected mode', async () => {
  const { service, sessionRepository } = createAuthService();
  const user = {
    id: 'user_1',
    email: 'owner@quizmind.dev',
    displayName: 'Workspace Owner',
    emailVerifiedAt: new Date('2026-03-23T08:00:00.000Z'),
    systemRoleAssignments: [
      {
        id: 'role_1',
        userId: 'user_1',
        role: 'platform_admin',
        createdAt: new Date('2026-03-23T08:00:00.000Z'),
      },
    ],
    memberships: [
      {
        id: 'membership_1',
        userId: 'user_1',
        workspaceId: 'ws_1',
        role: 'workspace_owner',
        createdAt: new Date('2026-03-23T08:00:00.000Z'),
        updatedAt: new Date('2026-03-23T08:00:00.000Z'),
        workspace: {
          id: 'ws_1',
          slug: 'demo-workspace',
          name: 'Demo Workspace',
          billingEmail: 'billing@quizmind.dev',
          createdAt: new Date('2026-03-23T08:00:00.000Z'),
          updatedAt: new Date('2026-03-23T08:00:00.000Z'),
        },
      },
    ],
  };

  service['verifyBearerToken'] = async () =>
    ({
      sub: user.id,
      userId: user.id,
      email: user.email,
      roles: ['platform_admin'],
      sessionId: 'session_1',
      type: 'access',
    }) as any;
  sessionRepository.findById = async () =>
    ({
      id: 'session_1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      user,
    }) as any;

  const snapshot = await service.getCurrentSession('access-token');

  assert.equal(snapshot.personaKey, 'connected-user');
  assert.equal(snapshot.personaLabel, 'Connected User');
  assert.deepEqual(snapshot.notes, ['Resolved from a Prisma-backed session in connected runtime mode.']);
  assert.equal(snapshot.user.displayName, 'Workspace Owner');
  assert.equal(snapshot.workspaces[0]?.slug, 'demo-workspace');
  assert.equal(snapshot.workspaces[0]?.role, 'workspace_owner');
  assert.equal(snapshot.principal.workspaceMemberships[0]?.workspaceId, 'ws_1');
  assert.ok(snapshot.permissions.includes('workspaces:read'));
  assert.ok(snapshot.permissions.includes('remote_config:publish'));
});
