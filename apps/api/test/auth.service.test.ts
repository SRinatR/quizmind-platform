import assert from 'node:assert/strict';
import test from 'node:test';

import { hashOpaqueToken } from '@quizmind/auth';

import { AuthService } from '../src/auth/auth.service';
import { type PasswordResetRepository } from '../src/auth/repositories/password-reset.repository';
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
  const passwordResetRepository = {} as PasswordResetRepository;
  const queueDispatchCalls: Array<Record<string, unknown>> = [];
  const queueDispatchService = {
    dispatch: async (request: Record<string, unknown>) => {
      queueDispatchCalls.push(request);
      return {
        id: String(request.jobId ?? `${String(request.queue)}:${String(request.dedupeKey ?? 'test')}`),
        queue: request.queue,
        createdAt: '2026-03-24T12:00:00.000Z',
      };
    },
  } as any;
  const service = new AuthService(
    userRepository,
    sessionRepository,
    passwordResetRepository,
    queueDispatchService,
  );

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

  service['logSecurityEvent'] = () => {};

  return { service, sessionRepository, userRepository, passwordResetRepository, queueDispatchCalls };
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

test('AuthService.listSessions returns active sessions and marks the current session', async () => {
  const { service, sessionRepository } = createAuthService();

  sessionRepository.listActiveByUserId = async () =>
    [
      {
        id: 'session_current',
        userId: 'user_1',
        tokenHash: 'hash_current',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        browser: 'chrome',
        deviceName: 'Chrome on Windows',
        expiresAt: new Date('2026-03-25T12:00:00.000Z'),
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
        revokedAt: null,
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
        user: {
          id: 'user_1',
          email: 'owner@quizmind.dev',
          systemRoleAssignments: [],
          memberships: [],
        },
      },
      {
        id: 'session_other',
        userId: 'user_1',
        tokenHash: 'hash_other',
        ipAddress: '127.0.0.2',
        userAgent: 'Mozilla/5.0',
        browser: 'firefox',
        deviceName: 'Firefox on macOS',
        expiresAt: new Date('2026-03-26T12:00:00.000Z'),
        createdAt: new Date('2026-03-23T12:00:00.000Z'),
        revokedAt: null,
        updatedAt: new Date('2026-03-23T12:00:00.000Z'),
        user: {
          id: 'user_1',
          email: 'owner@quizmind.dev',
          systemRoleAssignments: [],
          memberships: [],
        },
      },
    ] as any;

  const result = await service.listSessions('user_1', 'session_current');

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.id, 'session_current');
  assert.equal(result.items[0]?.current, true);
  assert.equal(result.items[0]?.browser, 'chrome');
  assert.equal(result.items[1]?.id, 'session_other');
  assert.equal(result.items[1]?.current, false);
});

test('AuthService.requestPasswordReset persists a password reset token and responds with a generic accepted payload', async () => {
  const { service, userRepository, passwordResetRepository, queueDispatchCalls } = createAuthService();
  let invalidatedUserId: string | null = null;
  let createdReset: Record<string, unknown> | null = null;

  userRepository.findByEmail = async () =>
    ({
      id: 'user_1',
      email: 'owner@quizmind.dev',
      displayName: 'Workspace Owner',
      passwordHash: 'existing-hash',
      suspendedAt: null,
      systemRoleAssignments: [],
      memberships: [],
    }) as any;
  passwordResetRepository.invalidateActiveForUser = async (userId: string) => {
    invalidatedUserId = userId;
    return 1;
  };
  passwordResetRepository.create = async (input: Record<string, unknown>) => {
    createdReset = input;
    return {
      id: 'reset_1',
      ...input,
      usedAt: null,
      createdAt: new Date(),
    } as any;
  };

  const result = await service.requestPasswordReset(
    {
      email: 'owner@quizmind.dev',
    },
    {
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 Chrome/123.0.0.0',
    },
  );

  assert.equal(result.accepted, true);
  assert.equal(result.expiresInMinutes, 60);
  assert.equal(invalidatedUserId, 'user_1');
  assert.equal(createdReset?.userId, 'user_1');
  assert.equal(typeof createdReset?.tokenHash, 'string');
  assert.equal(queueDispatchCalls.length, 1);
  assert.equal(queueDispatchCalls[0]?.queue, 'emails');
  assert.equal((queueDispatchCalls[0]?.payload as Record<string, unknown>)?.templateKey, 'auth.password-reset');
  assert.equal((queueDispatchCalls[0]?.payload as Record<string, unknown>)?.to, 'owner@quizmind.dev');
});

test('AuthService.resetPassword consumes the token, rotates sessions, and issues a fresh auth session', async () => {
  const { service, sessionRepository, userRepository, passwordResetRepository } = createAuthService();
  const user = {
    id: 'user_1',
    email: 'owner@quizmind.dev',
    displayName: 'Workspace Owner',
    passwordHash: 'existing-hash',
    emailVerifiedAt: null,
    suspendedAt: null,
    systemRoleAssignments: [
      {
        id: 'role_1',
        userId: 'user_1',
        role: 'platform_admin',
        createdAt: new Date('2026-03-24T12:00:00.000Z'),
      },
    ],
    memberships: [],
  };
  let persistedUser = user as any;
  let lookedUpTokenHash: string | null = null;
  let usedResetId: string | null = null;
  let revokedSessionUserId: string | null = null;

  passwordResetRepository.findActiveByTokenHash = async (tokenHash: string) => {
    lookedUpTokenHash = tokenHash;
    return {
      id: 'reset_1',
      userId: 'user_1',
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    } as any;
  };
  passwordResetRepository.markUsed = async (id: string, usedAt = new Date()) => {
    usedResetId = id;
    return {
      id,
      userId: 'user_1',
      tokenHash: lookedUpTokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt,
      createdAt: new Date(),
    } as any;
  };
  userRepository.findById = async () => persistedUser;
  userRepository.update = async (_id: string, data: Record<string, unknown>) => {
    persistedUser = {
      ...persistedUser,
      passwordHash: data.passwordHash,
    };
    return persistedUser;
  };
  sessionRepository.revokeAllForUser = async (userId: string) => {
    revokedSessionUserId = userId;
    return 2;
  };
  sessionRepository.create = async (input: Record<string, unknown>) =>
    ({
      id: 'session_new',
      userId: 'user_1',
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      browser: input.browser,
      deviceName: input.deviceName,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: persistedUser,
    }) as any;

  const result = await service.resetPassword(
    {
      token: 'reset-token',
      password: 'new-password-123',
    },
    {
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 Chrome/123.0.0.0',
    },
  );

  assert.equal(lookedUpTokenHash, hashOpaqueToken('reset-token', service['env'].jwtRefreshSecret));
  assert.equal(usedResetId, 'reset_1');
  assert.equal(revokedSessionUserId, 'user_1');
  assert.equal(result.session.user.email, 'owner@quizmind.dev');
  assert.ok(result.session.accessToken.length > 20);
  assert.match(result.resetAt, /\d{4}-\d{2}-\d{2}T/);
});

test('AuthService.login throws BadRequestException when email is missing (empty body)', async () => {
  const { service } = createAuthService();

  await assert.rejects(
    () => service.login({} as any),
    (err: any) => {
      assert.equal(err.constructor.name, 'BadRequestException');
      assert.match(err.message, /email/i);
      return true;
    },
  );
});

test('AuthService.login throws BadRequestException when email is null', async () => {
  const { service } = createAuthService();

  await assert.rejects(
    () => service.login({ email: null, password: 'secret' } as any),
    (err: any) => {
      assert.equal(err.constructor.name, 'BadRequestException');
      assert.match(err.message, /email/i);
      return true;
    },
  );
});

test('AuthService.login throws BadRequestException when email is not a string', async () => {
  const { service } = createAuthService();

  await assert.rejects(
    () => service.login({ email: 42, password: 'secret' } as any),
    (err: any) => {
      assert.equal(err.constructor.name, 'BadRequestException');
      assert.match(err.message, /email/i);
      return true;
    },
  );
});
