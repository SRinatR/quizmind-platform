import assert from 'node:assert/strict';
import test from 'node:test';
import { type ExtensionInstallationBindResult } from '@quizmind/contracts';

import {
  POST,
  resetBindRouteDependenciesForTests,
  setBindRouteDependenciesForTests,
} from '../src/app/api/extension/bind/route';

function createBindResult(): ExtensionInstallationBindResult {
  return {
    installation: {
      installationId: 'inst_123',
      workspaceId: 'ws_123',
      userId: 'user_123',
      browser: 'chrome',
      extensionVersion: '1.7.0',
      buildId: 'dev-local',
      schemaVersion: '2',
      capabilities: ['quiz-capture'],
      lastSeenAt: '2026-03-27T10:00:00.000Z',
      boundAt: '2026-03-27T10:00:00.000Z',
    },
    session: {
      token: 'inst_tok_123',
      expiresAt: '2026-03-27T11:00:00.000Z',
      refreshAfterSeconds: 900,
    },
    bootstrap: {
      installationId: 'inst_123',
      workspaceId: 'ws_123',
      compatibility: {
        status: 'supported',
        minimumVersion: '1.6.0',
        recommendedVersion: '1.7.0',
        supportedSchemaVersions: ['2'],
        requiredCapabilities: ['quiz-capture'],
      },
      entitlements: [],
      featureFlags: [],
      remoteConfig: {
        values: {},
        appliedLayerIds: [],
      },
      quotaHints: [],
      aiAccessPolicy: {
        mode: 'platform_only',
        allowPlatformManaged: true,
        allowBringYourOwnKey: false,
        allowDirectProviderMode: false,
        providers: ['openrouter'],
        defaultProvider: 'openrouter',
      },
      deprecationMessages: [],
      killSwitches: [],
      refreshAfterSeconds: 900,
      issuedAt: '2026-03-27T10:00:00.000Z',
    },
  };
}

function createValidBindRequestBody(overrides?: Partial<Record<string, unknown>>) {
  return {
    installationId: 'inst_123',
    workspaceId: 'ws_123',
    environment: 'development',
    handshake: {
      extensionVersion: '1.7.0',
      schemaVersion: '2',
      capabilities: ['quiz-capture'],
      browser: 'chrome',
      buildId: 'dev-local',
    },
    ...(overrides ?? {}),
  };
}

test.beforeEach(() => {
  resetBindRouteDependenciesForTests();
});

test('extension bind route returns 401 when site session token is missing', async () => {
  let fetchCalled = false;

  setBindRouteDependenciesForTests({
    readAccessToken: async () => null,
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called when access token is missing');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/bind', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(createValidBindRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    error?: { message?: string };
  };

  assert.equal(response.status, 401);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.message, 'Sign in on the site before connecting the extension.');
  assert.equal(fetchCalled, false);
});

test('extension bind route validates installation bind request payload before upstream proxying', async () => {
  let fetchCalled = false;

  setBindRouteDependenciesForTests({
    readAccessToken: async () => 'token_123',
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called for invalid payload');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/bind', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        createValidBindRequestBody({
          handshake: {
            extensionVersion: '1.7.0',
            schemaVersion: '2',
            capabilities: [],
            browser: 'chrome',
          },
        }),
      ),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    error?: { message?: string };
  };

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.message, 'installationId, environment, and a valid handshake are required.');
  assert.equal(fetchCalled, false);
});

test('extension bind route maps upstream bind errors and does not issue fallback code', async () => {
  let issueFallbackCalled = false;

  setBindRouteDependenciesForTests({
    readAccessToken: async () => 'token_123',
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: ['Workspace not accessible.'] }), {
        status: 403,
        headers: {
          'content-type': 'application/json',
        },
      }),
    issueFallbackCode: async () => {
      issueFallbackCalled = true;
      throw new Error('fallback code should not be issued on upstream errors');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/bind', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(createValidBindRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    error?: { message?: string };
  };

  assert.equal(response.status, 403);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.message, 'Workspace not accessible.');
  assert.equal(issueFallbackCalled, false);
});

test('extension bind route proxies bind success and issues fallback code metadata', async () => {
  const bindResult = createBindResult();
  let capturedFetchUrl: string | undefined;
  let capturedFetchInit: RequestInit | undefined;
  let capturedFallbackInput: unknown;

  setBindRouteDependenciesForTests({
    apiUrl: 'http://platform.internal:4000',
    readAccessToken: async () => 'token_123',
    fetchImpl: async (input, init) => {
      capturedFetchUrl = String(input);
      capturedFetchInit = init;

      return new Response(
        JSON.stringify({
          ok: true,
          data: bindResult,
        }),
        {
          status: 201,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    },
    issueFallbackCode: async (input) => {
      capturedFallbackInput = input;

      return {
        code: 'bindc_demo123',
        expiresAt: '2026-03-27T10:03:00.000Z',
        ttlSeconds: 180,
        redeemPath: '/api/extension/bind/redeem',
      };
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/bind', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-quizmind-bridge-mode': 'fallback_code',
        'x-quizmind-bind-request-id': 'bind_123',
        'x-quizmind-bridge-nonce': 'nonce_12345',
        'x-quizmind-target-origin': 'https://app.quizmind.dev/callback?source=extension',
      },
      body: JSON.stringify(createValidBindRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    data?: ExtensionInstallationBindResult;
    fallbackCode?: {
      code: string;
      expiresAt: string;
      ttlSeconds: number;
      redeemPath: string;
    };
  };

  assert.equal(response.status, 201);
  assert.equal(payload.ok, true);
  assert.equal(payload.data?.installation.installationId, 'inst_123');
  assert.equal(payload.fallbackCode?.code, 'bindc_demo123');
  assert.equal(capturedFetchUrl, 'http://platform.internal:4000/extension/installations/bind');
  assert.equal((capturedFetchInit?.headers as Record<string, string>)?.authorization, 'Bearer token_123');
  assert.equal((capturedFetchInit?.headers as Record<string, string>)?.['content-type'], 'application/json');
  assert.deepEqual(
    JSON.parse(String(capturedFetchInit?.body)),
    createValidBindRequestBody(),
  );
  assert.deepEqual(capturedFallbackInput, {
    installationId: 'inst_123',
    requestId: 'bind_123',
    bridgeNonce: 'nonce_12345',
    targetOrigin: 'https://app.quizmind.dev',
    result: bindResult,
  });
});

test('extension bind route proxies bind success without issuing fallback code when secure bridge headers are absent', async () => {
  const bindResult = createBindResult();
  let capturedFallbackInput: unknown;

  setBindRouteDependenciesForTests({
    apiUrl: 'http://platform.internal:4000',
    readAccessToken: async () => 'token_123',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          ok: true,
          data: bindResult,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    issueFallbackCode: async (input) => {
      capturedFallbackInput = input;
      return {
        code: 'bindc_demo123',
        expiresAt: '2026-03-27T10:03:00.000Z',
        ttlSeconds: 180,
        redeemPath: '/api/extension/bind/redeem',
      };
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/bind', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(createValidBindRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    data?: ExtensionInstallationBindResult;
    fallbackCode?: {
      code: string;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data?.installation.installationId, 'inst_123');
  assert.equal(payload.fallbackCode, undefined);
  assert.equal(capturedFallbackInput, undefined);
});

test('extension bind route does not issue fallback code in bind_result mode even with secure bridge headers', async () => {
  const bindResult = createBindResult();
  let capturedFallbackInput: unknown;

  setBindRouteDependenciesForTests({
    readAccessToken: async () => 'token_123',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          ok: true,
          data: bindResult,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    issueFallbackCode: async (input) => {
      capturedFallbackInput = input;

      return {
        code: 'bindc_demo123',
        expiresAt: '2026-03-27T10:03:00.000Z',
        ttlSeconds: 180,
        redeemPath: '/api/extension/bind/redeem',
      };
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/bind', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-quizmind-bind-request-id': 'bind_123',
        'x-quizmind-bridge-nonce': 'nonce_12345',
        'x-quizmind-target-origin': 'https://app.quizmind.dev',
      },
      body: JSON.stringify(createValidBindRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    data?: ExtensionInstallationBindResult;
    fallbackCode?: {
      code: string;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data?.installation.installationId, 'inst_123');
  assert.equal(payload.fallbackCode, undefined);
  assert.equal(capturedFallbackInput, undefined);
});

test('extension bind route rejects incomplete secure bridge headers before proxying upstream', async () => {
  let fetchCalled = false;
  let issueFallbackCalled = false;

  setBindRouteDependenciesForTests({
    readAccessToken: async () => 'token_123',
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called for incomplete secure bridge headers');
    },
    issueFallbackCode: async () => {
      issueFallbackCalled = true;
      throw new Error('fallback code should not be issued for incomplete secure bridge headers');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/bind', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-quizmind-target-origin': 'https://app.quizmind.dev',
      },
      body: JSON.stringify(createValidBindRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    error?: {
      message?: string;
    };
  };

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.message, 'x-quizmind-bridge-nonce and x-quizmind-target-origin must be provided together.');
  assert.equal(fetchCalled, false);
  assert.equal(issueFallbackCalled, false);
});

test('extension bind route rejects invalid bridge mode before proxying upstream', async () => {
  let fetchCalled = false;
  let issueFallbackCalled = false;

  setBindRouteDependenciesForTests({
    readAccessToken: async () => 'token_123',
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called for invalid bridge mode');
    },
    issueFallbackCode: async () => {
      issueFallbackCalled = true;
      throw new Error('fallback code should not be issued for invalid bridge mode');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/bind', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-quizmind-bridge-mode': 'unexpected_mode',
      },
      body: JSON.stringify(createValidBindRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    error?: {
      message?: string;
    };
  };

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.message, 'x-quizmind-bridge-mode must be one of: bind_result, fallback_code.');
  assert.equal(fetchCalled, false);
  assert.equal(issueFallbackCalled, false);
});

test('extension bind route rejects fallback_code mode without full secure bridge headers', async () => {
  let fetchCalled = false;
  let issueFallbackCalled = false;

  setBindRouteDependenciesForTests({
    readAccessToken: async () => 'token_123',
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called when fallback_code mode context is incomplete');
    },
    issueFallbackCode: async () => {
      issueFallbackCalled = true;
      throw new Error('fallback code should not be issued when fallback_code mode context is incomplete');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/bind', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-quizmind-bridge-mode': 'fallback_code',
      },
      body: JSON.stringify(createValidBindRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    error?: {
      message?: string;
    };
  };

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(
    payload.error?.message,
    'x-quizmind-bridge-mode=fallback_code requires x-quizmind-bind-request-id, x-quizmind-bridge-nonce, and x-quizmind-target-origin.',
  );
  assert.equal(fetchCalled, false);
  assert.equal(issueFallbackCalled, false);
});
