import assert from 'node:assert/strict';
import test from 'node:test';

import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

import { type CurrentSessionSnapshot } from '../src/auth/auth.types';
import { PlatformController } from '../src/platform.controller';

function createSession(): CurrentSessionSnapshot {
  return {
    personaKey: 'connected-user',
    personaLabel: 'Connected User',
    notes: [],
    user: {
      id: 'user_1',
      email: 'owner@quizmind.dev',
      displayName: 'Workspace Owner',
      emailVerifiedAt: '2026-03-24T12:00:00.000Z',
    },
    principal: {
      userId: 'user_1',
      email: 'owner@quizmind.dev',
      systemRoles: [],
      workspaceMemberships: [{ workspaceId: 'ws_1', role: 'workspace_owner' }],
      entitlements: [],
      featureFlags: [],
    },
    workspaces: [
      {
        id: 'ws_1',
        slug: 'demo-workspace',
        name: 'Demo Workspace',
        role: 'workspace_owner',
      },
    ],
    permissions: ['audit_logs:read'],
  };
}

test('PlatformController.listAdminSecurity requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listAdminSecurity() {
      return null;
    },
    async listAdminSecurityForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.listAdminSecurity('platform-admin', 'ws_1', 'warn', 'auth.login', '20'),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.listAdminSecurity uses connected session flow and forces security stream', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedFilters: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listAdminSecurity() {
      throw new Error('listAdminSecurity should not be called in connected mode');
    },
    async listAdminSecurityForCurrentSession(inputSession: CurrentSessionSnapshot, filters?: unknown) {
      capturedSession = inputSession;
      capturedFilters = filters;

      return {
        personaKey: 'connected-user',
        filters,
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.listAdminSecurity(
    undefined,
    'ws_1',
    'error',
    'credential',
    '15',
    'Bearer access-token-123',
  );

  assert.equal(capturedToken, 'access-token-123');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedFilters, {
    workspaceId: 'ws_1',
    stream: 'security',
    severity: 'error',
    search: 'credential',
    limit: 15,
  });
  assert.equal(result.ok, true);
});

test('PlatformController.listAdminSecurity rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listAdminSecurity() {
      return null;
    },
    async listAdminSecurityForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.listAdminSecurity(undefined, undefined, undefined, undefined, undefined, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.listAdminExtensionFleet requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listAdminExtensionFleet() {
      return null;
    },
    async listAdminExtensionFleetForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.listAdminExtensionFleet(
        'platform-admin',
        'ws_1',
        'inst_chrome_primary',
        'supported_with_warnings',
        'connected',
        'chrome',
        '20',
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.listAdminExtensionFleet uses connected session flow and returns manageDecision', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedFilters: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listAdminExtensionFleet() {
      throw new Error('listAdminExtensionFleet should not be called in connected mode');
    },
    async listAdminExtensionFleetForCurrentSession(
      inputSession: CurrentSessionSnapshot,
      filters?: unknown,
    ) {
      capturedSession = inputSession;
      capturedFilters = filters;

      return {
        personaKey: 'connected-user',
        accessDecision: { allowed: true, reasons: [] },
        manageDecision: { allowed: false, reasons: ['Missing permission: installations:write'] },
        workspace: { id: 'ws_1', slug: 'demo-workspace', name: 'Demo Workspace', role: 'workspace_owner' },
        filters,
        items: [],
        counts: {
          total: 0,
          connected: 0,
          reconnectRequired: 0,
          supported: 0,
          supportedWithWarnings: 0,
          deprecated: 0,
          unsupported: 0,
        },
        permissions: ['installations:read'],
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.listAdminExtensionFleet(
    undefined,
    'ws_1',
    undefined,
    'all',
    'reconnect_required',
    'edge',
    '12',
    'Bearer access-token-456',
  );

  assert.equal(capturedToken, 'access-token-456');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedFilters, {
    workspaceId: 'ws_1',
    compatibility: 'all',
    connection: 'reconnect_required',
    search: 'edge',
    limit: 12,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.manageDecision.allowed, false);
  assert.match(result.data.manageDecision.reasons.join('; '), /installations:write/);
});

test('PlatformController.listAdminExtensionFleet rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listAdminExtensionFleet() {
      return null;
    },
    async listAdminExtensionFleetForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () =>
      controller.listAdminExtensionFleet(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.listAdminLogs requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listAdminLogs() {
      return null;
    },
    async listAdminLogsForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.listAdminLogs(
        'platform-admin',
        'ws_1',
        'domain',
        'warn',
        'extension.lifecycle',
        '30',
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.listAdminLogs uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedFilters: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listAdminLogs() {
      throw new Error('listAdminLogs should not be called in connected mode');
    },
    async listAdminLogsForCurrentSession(inputSession: CurrentSessionSnapshot, filters?: unknown) {
      capturedSession = inputSession;
      capturedFilters = filters;

      return {
        personaKey: 'connected-user',
        filters,
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.listAdminLogs(
    undefined,
    'ws_1',
    'audit',
    'error',
    'credential',
    '25',
    'Bearer access-token-logs',
  );

  assert.equal(capturedToken, 'access-token-logs');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedFilters, {
    workspaceId: 'ws_1',
    stream: 'audit',
    severity: 'error',
    search: 'credential',
    limit: 25,
  });
  assert.equal(result.ok, true);
});

test('PlatformController.listAdminLogs rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listAdminLogs() {
      return null;
    },
    async listAdminLogsForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.listAdminLogs(undefined, undefined, undefined, undefined, undefined, undefined, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.getAdminLogEntry uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedId: string | null = null;

  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    async getAdminLogEntryForCurrentSession(inputSession: CurrentSessionSnapshot, id: string) {
      capturedSession = inputSession;
      capturedId = id;
      return { id: 'audit:entry_1' };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);
  (controller as any).env = { runtimeMode: 'connected' };

  const response = await controller.getAdminLogEntry('audit:entry_1', 'Bearer access-token-log-detail');

  assert.equal(capturedToken, 'access-token-log-detail');
  assert.equal(capturedSession, session);
  assert.equal(capturedId, 'audit:entry_1');
  assert.equal(response.ok, true);
  assert.equal((response.data as { id: string }).id, 'audit:entry_1');
});

test('PlatformController.listAdminWebhooks requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listAdminWebhooks() {
      return null;
    },
    async listAdminWebhooksForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.listAdminWebhooks(
        'platform-admin',
        'stripe',
        'failed',
        'invoice',
        '14',
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.listAdminWebhooks uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedFilters: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listAdminWebhooks() {
      throw new Error('listAdminWebhooks should not be called in connected mode');
    },
    async listAdminWebhooksForCurrentSession(inputSession: CurrentSessionSnapshot, filters?: unknown) {
      capturedSession = inputSession;
      capturedFilters = filters;

      return {
        personaKey: 'connected-user',
        filters,
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.listAdminWebhooks(
    undefined,
    'all',
    'processed',
    'checkout',
    '18',
    'Bearer access-token-webhooks',
  );

  assert.equal(capturedToken, 'access-token-webhooks');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedFilters, {
    provider: 'all',
    status: 'processed',
    search: 'checkout',
    limit: 18,
  });
  assert.equal(result.ok, true);
});

test('PlatformController.listAdminWebhooks rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listAdminWebhooks() {
      return null;
    },
    async listAdminWebhooksForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.listAdminWebhooks(undefined, undefined, undefined, undefined, undefined, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.exportUsage requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    exportUsage() {
      return null;
    },
    async exportUsageForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.exportUsage(
        {
          workspaceId: 'ws_1',
          format: 'json',
          scope: 'summary',
        },
        'platform-admin',
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.exportUsage uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    exportUsage() {
      throw new Error('exportUsage should not be called in connected mode');
    },
    async exportUsageForCurrentSession(inputSession: CurrentSessionSnapshot, request?: unknown) {
      capturedSession = inputSession;
      capturedRequest = request;

      return {
        workspaceId: 'ws_1',
        format: 'csv',
        scope: 'history',
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.exportUsage(
    {
      workspaceId: 'ws_1',
      format: 'csv',
      scope: 'history',
    },
    undefined,
    'Bearer access-token-usage',
  );

  assert.equal(capturedToken, 'access-token-usage');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    workspaceId: 'ws_1',
    format: 'csv',
    scope: 'history',
  });
  assert.equal(result.ok, true);
});

test('PlatformController.exportUsage rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    exportUsage() {
      return null;
    },
    async exportUsageForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () =>
      controller.exportUsage(
        {
          workspaceId: 'ws_1',
          format: 'json',
          scope: 'summary',
        },
        undefined,
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.retryAdminWebhook requires connected runtime in persona mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    async retryAdminWebhookForCurrentSession() {
      return {
        webhookEventId: 'wh_1',
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.retryAdminWebhook({ webhookEventId: 'wh_1' }, undefined),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.retryAdminWebhook uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    async retryAdminWebhookForCurrentSession(inputSession: CurrentSessionSnapshot, request?: unknown) {
      capturedSession = inputSession;
      capturedRequest = request;

      return {
        webhookEventId: 'wh_1',
        queue: 'billing-webhooks',
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.retryAdminWebhook(
    {
      webhookEventId: 'wh_1',
    },
    'Bearer access-token-retry',
  );

  assert.equal(capturedToken, 'access-token-retry');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    webhookEventId: 'wh_1',
  });
  assert.equal(result.ok, true);
});

test('PlatformController.exportAdminLogs requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    exportAdminLogs() {
      return null;
    },
    async exportAdminLogsForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.exportAdminLogs(
        {
          workspaceId: 'ws_1',
          stream: 'security',
          severity: 'warn',
          search: 'auth',
          limit: 20,
          format: 'json',
        },
        'platform-admin',
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.exportAdminLogs uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    exportAdminLogs() {
      throw new Error('exportAdminLogs should not be called in connected mode');
    },
    async exportAdminLogsForCurrentSession(inputSession: CurrentSessionSnapshot, request?: unknown) {
      capturedSession = inputSession;
      capturedRequest = request;

      return {
        workspaceId: 'ws_1',
        format: 'csv',
        itemCount: 2,
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.exportAdminLogs(
    {
      workspaceId: 'ws_1',
      stream: 'audit',
      severity: 'error',
      search: 'credential',
      limit: 12,
      format: 'csv',
    },
    undefined,
    'Bearer access-token-admin-logs',
  );

  assert.equal(capturedToken, 'access-token-admin-logs');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    workspaceId: 'ws_1',
    stream: 'audit',
    severity: 'error',
    search: 'credential',
    limit: 12,
    format: 'csv',
  });
  assert.equal(result.ok, true);
});

test('PlatformController.exportAdminLogs rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    exportAdminLogs() {
      return null;
    },
    async exportAdminLogsForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () =>
      controller.exportAdminLogs(
        {
          workspaceId: 'ws_1',
          stream: 'security',
          severity: 'warn',
          format: 'json',
        },
        undefined,
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.listSupportImpersonationSessions requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listSupportImpersonationSessions() {
      return null;
    },
    async listSupportImpersonationSessionsForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.listSupportImpersonationSessions('support-admin'),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.listSupportImpersonationSessions uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listSupportImpersonationSessions() {
      throw new Error('listSupportImpersonationSessions should not be called in connected mode');
    },
    async listSupportImpersonationSessionsForCurrentSession(inputSession: CurrentSessionSnapshot) {
      capturedSession = inputSession;
      return {
        personaKey: 'connected-user',
        items: [],
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.listSupportImpersonationSessions(undefined, 'Bearer access-token-support-history');

  assert.equal(capturedToken, 'access-token-support-history');
  assert.equal(capturedSession, session);
  assert.equal(result.ok, true);
});

test('PlatformController.listSupportImpersonationSessions rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listSupportImpersonationSessions() {
      return null;
    },
    async listSupportImpersonationSessionsForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.listSupportImpersonationSessions(undefined, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.listSupportTickets requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listSupportTickets() {
      return null;
    },
    async listSupportTicketsForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.listSupportTickets(
        'support-admin',
        'my_active',
        'open',
        'mine',
        'invoice',
        '16',
        '8',
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.listSupportTickets uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedFilters: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listSupportTickets() {
      throw new Error('listSupportTickets should not be called in connected mode');
    },
    async listSupportTicketsForCurrentSession(inputSession: CurrentSessionSnapshot, filters?: unknown) {
      capturedSession = inputSession;
      capturedFilters = filters;
      return {
        personaKey: 'connected-user',
        filters,
        items: [],
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.listSupportTickets(
    undefined,
    'shared_queue',
    'in_progress',
    'unassigned',
    'latency',
    '24',
    '6',
    'Bearer access-token-support-tickets',
  );

  assert.equal(capturedToken, 'access-token-support-tickets');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedFilters, {
    preset: 'shared_queue',
    status: 'in_progress',
    ownership: 'unassigned',
    search: 'latency',
    limit: 24,
    timelineLimit: 6,
  });
  assert.equal(result.ok, true);
});

test('PlatformController.listSupportTickets rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listSupportTickets() {
      return null;
    },
    async listSupportTicketsForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () =>
      controller.listSupportTickets(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.startSupportImpersonation requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    startSupportImpersonation() {
      return null;
    },
    async startSupportImpersonationForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.startSupportImpersonation(
        {
          supportActorId: 'user_support_1',
          targetUserId: 'user_2',
          workspaceId: 'ws_1',
          reason: 'Investigate ticket escalation.',
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.startSupportImpersonation uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    startSupportImpersonation() {
      throw new Error('startSupportImpersonation should not be called in connected mode');
    },
    async startSupportImpersonationForCurrentSession(
      inputSession: CurrentSessionSnapshot,
      request?: unknown,
    ) {
      capturedSession = inputSession;
      capturedRequest = request;
      return {
        sessionId: 'imp_2',
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.startSupportImpersonation(
    {
      supportActorId: 'user_support_1',
      targetUserId: 'user_3',
      workspaceId: 'ws_1',
      reason: 'Validate billing recovery.',
    },
    'Bearer access-token-support-start',
  );

  assert.equal(capturedToken, 'access-token-support-start');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    supportActorId: 'user_support_1',
    targetUserId: 'user_3',
    workspaceId: 'ws_1',
    reason: 'Validate billing recovery.',
  });
  assert.equal(result.ok, true);
});

test('PlatformController.startSupportImpersonation rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    startSupportImpersonation() {
      return null;
    },
    async startSupportImpersonationForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () =>
      controller.startSupportImpersonation(
        {
          supportActorId: 'user_support_1',
          targetUserId: 'user_2',
          reason: 'Auth missing token check.',
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.updateSupportTicket requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    updateSupportTicket() {
      return null;
    },
    async updateSupportTicketForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.updateSupportTicket(
        {
          supportTicketId: 'ticket_1',
          status: 'resolved',
          handoffNote: 'Issue validated and resolved.',
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.updateSupportTicket uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    updateSupportTicket() {
      throw new Error('updateSupportTicket should not be called in connected mode');
    },
    async updateSupportTicketForCurrentSession(
      inputSession: CurrentSessionSnapshot,
      request?: unknown,
    ) {
      capturedSession = inputSession;
      capturedRequest = request;
      return {
        ticketId: 'ticket_2',
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.updateSupportTicket(
    {
      supportTicketId: 'ticket_2',
      status: 'in_progress',
      handoffNote: 'Need customer confirmation.',
    },
    'Bearer access-token-support-update',
  );

  assert.equal(capturedToken, 'access-token-support-update');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    supportTicketId: 'ticket_2',
    status: 'in_progress',
    handoffNote: 'Need customer confirmation.',
  });
  assert.equal(result.ok, true);
});

test('PlatformController.updateSupportTicket rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    updateSupportTicket() {
      return null;
    },
    async updateSupportTicketForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.updateSupportTicket({ supportTicketId: 'ticket_1' }, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.updateSupportTicketPresetFavorite requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    updateSupportTicketPresetFavorite() {
      return null;
    },
    async updateSupportTicketPresetFavoriteForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.updateSupportTicketPresetFavorite(
        {
          preset: 'my_active',
          favorite: true,
        },
        'support-admin',
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.updateSupportTicketPresetFavorite uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    updateSupportTicketPresetFavorite() {
      throw new Error('updateSupportTicketPresetFavorite should not be called in connected mode');
    },
    async updateSupportTicketPresetFavoriteForCurrentSession(
      inputSession: CurrentSessionSnapshot,
      request?: unknown,
    ) {
      capturedSession = inputSession;
      capturedRequest = request;
      return {
        preset: 'sla_risk',
        isFavorite: false,
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.updateSupportTicketPresetFavorite(
    {
      preset: 'resolved_review',
      favorite: false,
    },
    undefined,
    'Bearer access-token-support-preset',
  );

  assert.equal(capturedToken, 'access-token-support-preset');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    preset: 'resolved_review',
    favorite: false,
  });
  assert.equal(result.ok, true);
});

test('PlatformController.updateSupportTicketPresetFavorite rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    updateSupportTicketPresetFavorite() {
      return null;
    },
    async updateSupportTicketPresetFavoriteForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () =>
      controller.updateSupportTicketPresetFavorite(
        {
          preset: 'my_active',
          favorite: true,
        },
        undefined,
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.endSupportImpersonation requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    endSupportImpersonation() {
      return null;
    },
    async endSupportImpersonationForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.endSupportImpersonation(
        {
          impersonationSessionId: 'imp_1',
          closeReason: 'Investigation complete.',
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.endSupportImpersonation uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    endSupportImpersonation() {
      throw new Error('endSupportImpersonation should not be called in connected mode');
    },
    async endSupportImpersonationForCurrentSession(
      inputSession: CurrentSessionSnapshot,
      request?: unknown,
    ) {
      capturedSession = inputSession;
      capturedRequest = request;
      return {
        sessionId: 'imp_2',
        endedAt: '2026-03-24T14:00:00.000Z',
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.endSupportImpersonation(
    {
      impersonationSessionId: 'imp_2',
      closeReason: 'Scope finished.',
    },
    'Bearer access-token-support-end',
  );

  assert.equal(capturedToken, 'access-token-support-end');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    impersonationSessionId: 'imp_2',
    closeReason: 'Scope finished.',
  });
  assert.equal(result.ok, true);
});

test('PlatformController.endSupportImpersonation rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    endSupportImpersonation() {
      return null;
    },
    async endSupportImpersonationForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.endSupportImpersonation({ impersonationSessionId: 'imp_1' }, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.listUsers requires connected runtime and does not expose persona mock fallback', async () => {
  let getCurrentSessionCalled = false;
  const authService = {
    async getCurrentSession() {
      getCurrentSessionCalled = true;
      return createSession();
    },
  };
  const platformService = {
    async listUsersForCurrentSession() {
      throw new Error('listUsersForCurrentSession should not be called when runtime is not connected');
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.listUsers('platform-admin'),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/i);
      return true;
    },
  );
  assert.equal(getCurrentSessionCalled, false);
});

test('PlatformController.listUsers uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listUsers() {
      throw new Error('listUsers should not be called in connected mode');
    },
    async listUsersForCurrentSession(inputSession: CurrentSessionSnapshot) {
      capturedSession = inputSession;
      return {
        personaKey: 'connected-user',
        items: [],
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.listUsers(undefined, 'Bearer access-token-users');

  assert.equal(capturedToken, 'access-token-users');
  assert.equal(capturedSession, session);
  assert.equal(result.ok, true);
});

test('PlatformController.listUsers rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listUsers() {
      return null;
    },
    async listUsersForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.listUsers(undefined, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.listFeatureFlags requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listFeatureFlags() {
      return null;
    },
    async listFeatureFlagsForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.listFeatureFlags('platform-admin'),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.listFeatureFlags uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listFeatureFlags() {
      throw new Error('listFeatureFlags should not be called in connected mode');
    },
    async listFeatureFlagsForCurrentSession(inputSession: CurrentSessionSnapshot) {
      capturedSession = inputSession;
      return {
        personaKey: 'connected-user',
        flags: [],
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.listFeatureFlags(undefined, 'Bearer access-token-flags');

  assert.equal(capturedToken, 'access-token-flags');
  assert.equal(capturedSession, session);
  assert.equal(result.ok, true);
});

test('PlatformController.listFeatureFlags rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listFeatureFlags() {
      return null;
    },
    async listFeatureFlagsForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.listFeatureFlags(undefined, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.listCompatibilityRules requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listCompatibilityRules() {
      return null;
    },
    async listCompatibilityRulesForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.listCompatibilityRules('platform-admin'),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.listCompatibilityRules uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listCompatibilityRules() {
      throw new Error('listCompatibilityRules should not be called in connected mode');
    },
    async listCompatibilityRulesForCurrentSession(inputSession: CurrentSessionSnapshot) {
      capturedSession = inputSession;
      return {
        personaKey: 'connected-user',
        items: [],
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.listCompatibilityRules(undefined, 'Bearer access-token-compatibility-list');

  assert.equal(capturedToken, 'access-token-compatibility-list');
  assert.equal(capturedSession, session);
  assert.equal(result.ok, true);
});

test('PlatformController.listCompatibilityRules rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listCompatibilityRules() {
      return null;
    },
    async listCompatibilityRulesForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.listCompatibilityRules(undefined, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.publishCompatibilityRule requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    publishCompatibilityRule() {
      return null;
    },
    async publishCompatibilityRuleForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.publishCompatibilityRule(
        {
          minimumVersion: '1.6.0',
          recommendedVersion: '1.7.0',
          supportedSchemaVersions: ['2'],
          requiredCapabilities: ['quiz-capture'],
          resultStatus: 'supported_with_warnings',
          reason: 'Planned staged rollout.',
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.publishCompatibilityRule uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    publishCompatibilityRule() {
      throw new Error('publishCompatibilityRule should not be called in connected mode');
    },
    async publishCompatibilityRuleForCurrentSession(
      inputSession: CurrentSessionSnapshot,
      request?: unknown,
    ) {
      capturedSession = inputSession;
      capturedRequest = request;
      return {
        rule: {
          id: 'compat_rule_2',
        },
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.publishCompatibilityRule(
    {
      minimumVersion: '1.7.0',
      recommendedVersion: '1.8.0',
      supportedSchemaVersions: ['2'],
      resultStatus: 'supported',
      reason: null,
    },
    'Bearer access-token-compatibility-publish',
  );

  assert.equal(capturedToken, 'access-token-compatibility-publish');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    minimumVersion: '1.7.0',
    recommendedVersion: '1.8.0',
    supportedSchemaVersions: ['2'],
    resultStatus: 'supported',
    reason: null,
  });
  assert.equal(result.ok, true);
});

test('PlatformController.publishCompatibilityRule rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    publishCompatibilityRule() {
      return null;
    },
    async publishCompatibilityRuleForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () =>
      controller.publishCompatibilityRule(
        {
          minimumVersion: '1.7.0',
          recommendedVersion: '1.8.0',
          supportedSchemaVersions: ['2'],
          resultStatus: 'supported',
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.updateFeatureFlag requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    updateFeatureFlag() {
      return null;
    },
    async updateFeatureFlagForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.updateFeatureFlag(
        {
          key: 'feature.test',
          enabled: true,
          status: 'active',
          description: 'Enable test feature.',
          rolloutPercentage: 25,
          allowPlans: ['pro'],
          allowWorkspaces: ['ws_1'],
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.updateFeatureFlag uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    updateFeatureFlag() {
      throw new Error('updateFeatureFlag should not be called in connected mode');
    },
    async updateFeatureFlagForCurrentSession(
      inputSession: CurrentSessionSnapshot,
      request?: unknown,
    ) {
      capturedSession = inputSession;
      capturedRequest = request;
      return {
        flag: {
          key: 'feature.test',
        },
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.updateFeatureFlag(
    {
      key: 'feature.test',
      enabled: false,
      status: 'paused',
      rolloutPercentage: null,
      minimumExtensionVersion: null,
    },
    'Bearer access-token-feature-flag-update',
  );

  assert.equal(capturedToken, 'access-token-feature-flag-update');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    key: 'feature.test',
    enabled: false,
    status: 'paused',
    rolloutPercentage: null,
    minimumExtensionVersion: null,
  });
  assert.equal(result.ok, true);
});

test('PlatformController.updateFeatureFlag rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    updateFeatureFlag() {
      return null;
    },
    async updateFeatureFlagForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () =>
      controller.updateFeatureFlag(
        {
          key: 'feature.test',
          enabled: true,
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.listRemoteConfig requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listRemoteConfig() {
      return null;
    },
    async listRemoteConfigForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.listRemoteConfig('platform-admin', 'ws_1'),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.listRemoteConfig uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedWorkspaceId: string | undefined;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listRemoteConfig() {
      throw new Error('listRemoteConfig should not be called in connected mode');
    },
    async listRemoteConfigForCurrentSession(
      inputSession: CurrentSessionSnapshot,
      workspaceId?: string,
    ) {
      capturedSession = inputSession;
      capturedWorkspaceId = workspaceId;
      return {
        personaKey: 'connected-user',
        activeLayers: [],
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.listRemoteConfig(undefined, 'ws_1', 'Bearer access-token-remote-config-list');

  assert.equal(capturedToken, 'access-token-remote-config-list');
  assert.equal(capturedSession, session);
  assert.equal(capturedWorkspaceId, 'ws_1');
  assert.equal(result.ok, true);
});

test('PlatformController.listRemoteConfig rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listRemoteConfig() {
      return null;
    },
    async listRemoteConfigForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.listRemoteConfig(undefined, 'ws_1', undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.publishRemoteConfig requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    publishRemoteConfig() {
      return null;
    },
    async publishRemoteConfigForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.publishRemoteConfig(
        {
          versionLabel: 'v1',
          actorId: 'user_1',
          workspaceId: 'ws_1',
          layers: [
            {
              id: 'layer_1',
              scope: 'workspace',
              priority: 100,
              conditions: {
                workspaceId: 'ws_1',
              },
              values: {
                allowByok: true,
              },
            },
          ],
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.publishRemoteConfig uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    publishRemoteConfig() {
      throw new Error('publishRemoteConfig should not be called in connected mode');
    },
    async publishRemoteConfigForCurrentSession(
      inputSession: CurrentSessionSnapshot,
      request?: unknown,
    ) {
      capturedSession = inputSession;
      capturedRequest = request;
      return {
        publishResult: {
          versionLabel: 'v2',
        },
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.publishRemoteConfig(
    {
      versionLabel: 'v2',
      actorId: 'user_1',
      workspaceId: 'ws_1',
      layers: [
        {
          id: 'layer_2',
          scope: 'workspace',
          priority: 120,
          values: {
            aiMode: 'proxy_only',
          },
        },
      ],
    },
    'Bearer access-token-remote-config-publish',
  );

  assert.equal(capturedToken, 'access-token-remote-config-publish');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    versionLabel: 'v2',
    actorId: 'user_1',
    workspaceId: 'ws_1',
    layers: [
      {
        id: 'layer_2',
        scope: 'workspace',
        priority: 120,
        values: {
          aiMode: 'proxy_only',
        },
      },
    ],
  });
  assert.equal(result.ok, true);
});

test('PlatformController.publishRemoteConfig rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    publishRemoteConfig() {
      return null;
    },
    async publishRemoteConfigForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () =>
      controller.publishRemoteConfig(
        {
          versionLabel: 'v2',
          actorId: 'user_1',
          layers: [],
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.activateRemoteConfigVersion requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    activateRemoteConfigVersion() {
      return null;
    },
    async activateRemoteConfigVersionForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.activateRemoteConfigVersion(
        {
          versionId: 'rcv_1',
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.activateRemoteConfigVersion uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    activateRemoteConfigVersion() {
      throw new Error('activateRemoteConfigVersion should not be called in connected mode');
    },
    async activateRemoteConfigVersionForCurrentSession(
      inputSession: CurrentSessionSnapshot,
      request?: unknown,
    ) {
      capturedSession = inputSession;
      capturedRequest = request;
      return {
        version: {
          id: 'rcv_2',
        },
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.activateRemoteConfigVersion(
    {
      versionId: 'rcv_2',
    },
    'Bearer access-token-remote-config-activate',
  );

  assert.equal(capturedToken, 'access-token-remote-config-activate');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    versionId: 'rcv_2',
  });
  assert.equal(result.ok, true);
});

test('PlatformController.activateRemoteConfigVersion rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    activateRemoteConfigVersion() {
      return null;
    },
    async activateRemoteConfigVersionForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () =>
      controller.activateRemoteConfigVersion(
        {
          versionId: 'rcv_1',
        },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.getHealth returns an ok envelope from platform service', async () => {
  let getHealthCalled = false;
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    async getHealth() {
      getHealthCalled = true;
      return {
        status: 'ok',
        timestamp: '2026-03-24T12:00:00.000Z',
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  const result = await controller.getHealth();

  assert.equal(getHealthCalled, true);
  assert.equal(result.ok, true);
  assert.equal(result.data.status, 'ok');
});

test('PlatformController.getReady returns an ok envelope when runtime is ready', async () => {
  let getReadyCalled = false;
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    async getReady() {
      getReadyCalled = true;
      return {
        status: 'ready',
        timestamp: '2026-03-24T12:00:00.000Z',
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);
  const result = await controller.getReady();

  assert.equal(getReadyCalled, true);
  assert.equal(result.ok, true);
  assert.equal(result.data.status, 'ready');
});

test('PlatformController.getReady throws ServiceUnavailableException when runtime is not ready', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    async getReady() {
      return {
        status: 'not_ready',
        timestamp: '2026-03-24T12:00:00.000Z',
        failures: [{ key: 'postgres', message: 'PostgreSQL is not reachable.' }],
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  await assert.rejects(
    () => controller.getReady(),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      const response = (error as ServiceUnavailableException).getResponse();

      assert.match(JSON.stringify(response), /not_ready/);
      return true;
    },
  );
});

test('PlatformController.getFoundation returns an ok envelope from platform service', () => {
  let getFoundationCalled = false;
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    getFoundation() {
      getFoundationCalled = true;
      return {
        name: 'QuizMind Platform',
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  const result = controller.getFoundation();

  assert.equal(getFoundationCalled, true);
  assert.equal(result.ok, true);
  assert.equal(result.data.name, 'QuizMind Platform');
});

test('PlatformController.listWorkspaces requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listWorkspaces() {
      return null;
    },
    async listWorkspacesForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.listWorkspaces('platform-admin'),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.listWorkspaces uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listWorkspaces() {
      throw new Error('listWorkspaces should not be called in connected mode');
    },
    async listWorkspacesForCurrentSession(inputSession: CurrentSessionSnapshot) {
      capturedSession = inputSession;
      return {
        personaKey: 'connected-user',
        items: [],
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.listWorkspaces(undefined, 'Bearer access-token-workspaces');

  assert.equal(capturedToken, 'access-token-workspaces');
  assert.equal(capturedSession, session);
  assert.equal(result.ok, true);
});

test('PlatformController.listWorkspaces rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listWorkspaces() {
      return null;
    },
    async listWorkspacesForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.listWorkspaces(undefined, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.getWorkspace requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    getWorkspace() {
      return null;
    },
    async getWorkspaceForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.getWorkspace('ws_1', 'platform-admin'),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.getWorkspace uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedWorkspaceId: string | undefined;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    getWorkspace() {
      throw new Error('getWorkspace should not be called in connected mode');
    },
    async getWorkspaceForCurrentSession(inputSession: CurrentSessionSnapshot, workspaceId?: string) {
      capturedSession = inputSession;
      capturedWorkspaceId = workspaceId;
      return {
        workspace: {
          id: workspaceId,
        },
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.getWorkspace('ws_1', undefined, 'Bearer access-token-workspace');

  assert.equal(capturedToken, 'access-token-workspace');
  assert.equal(capturedSession, session);
  assert.equal(capturedWorkspaceId, 'ws_1');
  assert.equal(result.ok, true);
});

test('PlatformController.getWorkspace rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    getWorkspace() {
      return null;
    },
    async getWorkspaceForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.getWorkspace('ws_1', undefined, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.getUserProfile uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    async getUserProfileForCurrentSession(inputSession: CurrentSessionSnapshot) {
      capturedSession = inputSession;
      return {
        id: 'user_1',
        email: 'owner@quizmind.dev',
        createdAt: '2026-03-24T08:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.getUserProfile('Bearer access-token-profile-get');

  assert.equal(capturedToken, 'access-token-profile-get');
  assert.equal(capturedSession, session);
  assert.equal(result.ok, true);
  assert.equal(result.data.id, 'user_1');
});

test('PlatformController.getUserProfile rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    async getUserProfileForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.getUserProfile(undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.getUserProfile rejects in persona mode because connected runtime is required', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    async getUserProfileForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.getUserProfile(undefined),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.updateUserProfile uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    async updateUserProfileForCurrentSession(
      inputSession: CurrentSessionSnapshot,
      request?: unknown,
    ) {
      capturedSession = inputSession;
      capturedRequest = request;
      return {
        id: 'user_1',
        email: 'owner@quizmind.dev',
        displayName: 'Workspace Owner',
        createdAt: '2026-03-24T08:00:00.000Z',
        updatedAt: '2026-03-24T10:00:00.000Z',
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.updateUserProfile(
    {
      displayName: 'Workspace Owner',
      timezone: 'UTC',
      locale: 'en-US',
    },
    'Bearer access-token-profile-update',
  );

  assert.equal(capturedToken, 'access-token-profile-update');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    displayName: 'Workspace Owner',
    timezone: 'UTC',
    locale: 'en-US',
  });
  assert.equal(result.ok, true);
});

test('PlatformController.updateUserProfile rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    async updateUserProfileForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.updateUserProfile({ displayName: 'Name' }, undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.updateUserProfile rejects in persona mode because connected runtime is required', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    async updateUserProfileForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.updateUserProfile({ displayName: 'Name' }, undefined),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.getSubscription requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    getSubscription() {
      return null;
    },
    async getSubscriptionForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.getSubscription('platform-admin', 'ws_1'),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.getSubscription uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedWorkspaceId: string | undefined;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    getSubscription() {
      throw new Error('getSubscription should not be called in connected mode');
    },
    async getSubscriptionForCurrentSession(inputSession: CurrentSessionSnapshot, workspaceId?: string) {
      capturedSession = inputSession;
      capturedWorkspaceId = workspaceId;
      return {
        workspace: {
          id: workspaceId,
        },
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.getSubscription(undefined, 'ws_1', 'Bearer access-token-subscription');

  assert.equal(capturedToken, 'access-token-subscription');
  assert.equal(capturedSession, session);
  assert.equal(capturedWorkspaceId, 'ws_1');
  assert.equal(result.ok, true);
});

test('PlatformController.getSubscription rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    getSubscription() {
      return null;
    },
    async getSubscriptionForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.getSubscription(undefined, 'ws_1', undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.getUsage requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    getUsage() {
      return null;
    },
    async getUsageForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () => controller.getUsage('platform-admin', 'ws_1'),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.getUsage uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedWorkspaceId: string | undefined;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    getUsage() {
      throw new Error('getUsage should not be called in connected mode');
    },
    async getUsageForCurrentSession(inputSession: CurrentSessionSnapshot, workspaceId?: string) {
      capturedSession = inputSession;
      capturedWorkspaceId = workspaceId;
      return {
        workspace: {
          id: workspaceId,
        },
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.getUsage(undefined, 'ws_1', 'Bearer access-token-usage-summary');

  assert.equal(capturedToken, 'access-token-usage-summary');
  assert.equal(capturedSession, session);
  assert.equal(capturedWorkspaceId, 'ws_1');
  assert.equal(result.ok, true);
});

test('PlatformController.getUsage rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    getUsage() {
      return null;
    },
    async getUsageForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () => controller.getUsage(undefined, 'ws_1', undefined),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.getUsageHistory requires connected runtime and does not expose persona fallback', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listUsageHistory() {
      return null;
    },
    async listUsageHistoryForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'mock',
  };

  await assert.rejects(
    () =>
      controller.getUsageHistory(
        'platform-admin',
        'ws_1',
        'ai',
        'ai.proxy.completed',
        'inst_1',
        'user_1',
        '50',
      ),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.match((error as Error).message, /QUIZMIND_RUNTIME_MODE=connected/);
      return true;
    },
  );
});

test('PlatformController.getUsageHistory uses connected session flow', async () => {
  const session = createSession();
  let capturedToken: string | null = null;
  let capturedSession: CurrentSessionSnapshot | null = null;
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession(accessToken: string) {
      capturedToken = accessToken;
      return session;
    },
  };
  const platformService = {
    listUsageHistory() {
      throw new Error('listUsageHistory should not be called in connected mode');
    },
    async listUsageHistoryForCurrentSession(inputSession: CurrentSessionSnapshot, request?: unknown) {
      capturedSession = inputSession;
      capturedRequest = request;
      return {
        items: [],
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.getUsageHistory(
    undefined,
    'ws_1',
    'telemetry',
    'extension.quiz_answer_requested',
    'inst_1',
    'user_1',
    '25',
    'Bearer access-token-usage-history',
  );

  assert.equal(capturedToken, 'access-token-usage-history');
  assert.equal(capturedSession, session);
  assert.deepEqual(capturedRequest, {
    workspaceId: 'ws_1',
    source: 'telemetry',
    eventType: 'extension.quiz_answer_requested',
    installationId: 'inst_1',
    actorId: 'user_1',
    limit: 25,
  });
  assert.equal(result.ok, true);
});

test('PlatformController.getUsageHistory rejects missing bearer token in connected mode', async () => {
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    listUsageHistory() {
      return null;
    },
    async listUsageHistoryForCurrentSession() {
      return null;
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await assert.rejects(
    () =>
      controller.getUsageHistory(
        undefined,
        'ws_1',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.match((error as Error).message, /Missing bearer token/);
      return true;
    },
  );
});

test('PlatformController.bootstrapExtension proxies request payload', async () => {
  let capturedRequest: unknown;
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    async bootstrapExtension(request?: unknown) {
      capturedRequest = request;
      return {
        compatibility: {
          status: 'supported',
          minimumVersion: '1.6.0',
          recommendedVersion: '1.7.0',
          supportedSchemaVersions: ['2'],
        },
        featureFlags: [],
        remoteConfig: {
          values: {},
          appliedLayerIds: [],
        },
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  const result = await controller.bootstrapExtension({
    installationId: 'inst_1',
    userId: 'user_1',
    workspaceId: 'ws_1',
    environment: 'development',
    planCode: 'pro',
    handshake: {
      extensionVersion: '1.7.0',
      schemaVersion: '2',
      capabilities: ['quiz-capture'],
      browser: 'chrome',
    },
  });

  assert.deepEqual(capturedRequest, {
    installationId: 'inst_1',
    userId: 'user_1',
    workspaceId: 'ws_1',
    environment: 'development',
    planCode: 'pro',
    handshake: {
      extensionVersion: '1.7.0',
      schemaVersion: '2',
      capabilities: ['quiz-capture'],
      browser: 'chrome',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.compatibility.status, 'supported');
});

test('PlatformController.ingestUsageEvent proxies usage event payload', async () => {
  let capturedEvent: unknown;
  const authService = {
    async getCurrentSession() {
      return createSession();
    },
  };
  const platformService = {
    async ingestUsageEvent(event?: unknown) {
      capturedEvent = event;
      return {
        queued: true,
        queue: 'usage-events',
        job: {
          id: 'usage-events:job_1',
          queue: 'usage-events',
          createdAt: '2026-03-24T12:00:00.000Z',
        },
        handler: 'processUsageEventJob',
        logEvent: {
          eventId: 'log_evt_1',
          eventType: 'extension.quiz_answer_requested',
          occurredAt: '2026-03-24T11:59:00.000Z',
          status: 'accepted',
        },
      };
    },
  };
  const controller = new PlatformController(authService as any, platformService as any);

  const result = await controller.ingestUsageEvent({
    installationId: 'inst_1',
    workspaceId: 'ws_1',
    eventType: 'extension.quiz_answer_requested',
    occurredAt: '2026-03-24T11:59:00.000Z',
    payload: {
      source: 'content_script',
    },
  });

  assert.deepEqual(capturedEvent, {
    installationId: 'inst_1',
    workspaceId: 'ws_1',
    eventType: 'extension.quiz_answer_requested',
    occurredAt: '2026-03-24T11:59:00.000Z',
    payload: {
      source: 'content_script',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.queued, true);
});
