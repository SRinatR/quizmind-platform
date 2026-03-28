import assert from 'node:assert/strict';
import test from 'node:test';
import { type ExtensionInstallationBindResult } from '@quizmind/contracts';

import { OPTIONS, POST } from '../src/app/api/extension/bind/redeem/route';
import {
  issueBindFallbackCode,
  resetBindFallbackCodesForTests,
} from '../src/lib/extension-bind-code-store';

const originalRedisUrl = process.env.REDIS_URL;
const originalBindCodeStoreMode = process.env.QUIZMIND_EXTENSION_BIND_CODE_STORE_MODE;

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

test.beforeEach(async () => {
  delete process.env.REDIS_URL;
  delete process.env.QUIZMIND_EXTENSION_BIND_CODE_STORE_MODE;
  await resetBindFallbackCodesForTests();
});

test.after(() => {
  if (typeof originalRedisUrl === 'string') {
    process.env.REDIS_URL = originalRedisUrl;
  } else {
    delete process.env.REDIS_URL;
  }

  if (typeof originalBindCodeStoreMode === 'string') {
    process.env.QUIZMIND_EXTENSION_BIND_CODE_STORE_MODE = originalBindCodeStoreMode;
  } else {
    delete process.env.QUIZMIND_EXTENSION_BIND_CODE_STORE_MODE;
  }
});

test('extension bind redeem route returns bind payload and CORS headers for valid fallback code', async () => {
  const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const fallbackCode = await issueBindFallbackCode({
    result: createBindResult(),
    installationId: 'inst_123',
    requestId: 'bind_123',
    bridgeNonce: 'nonce_12345',
    targetOrigin: origin,
  });

  const response = await POST(
    new Request('http://localhost/api/extension/bind/redeem', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({
        code: fallbackCode.code,
        installationId: 'inst_123',
        requestId: 'bind_123',
        bridgeNonce: 'nonce_12345',
      }),
    }),
  );

  const payload = (await response.json()) as {
    ok: boolean;
    data?: ExtensionInstallationBindResult;
    redeemedAt?: string;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data?.installation.installationId, 'inst_123');
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(response.headers.get('vary'), 'origin');
});

test('extension bind redeem route returns 403 when fallback context does not match', async () => {
  const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const fallbackCode = await issueBindFallbackCode({
    result: createBindResult(),
    installationId: 'inst_123',
    requestId: 'bind_123',
    bridgeNonce: 'nonce_12345',
    targetOrigin: origin,
  });

  const response = await POST(
    new Request('http://localhost/api/extension/bind/redeem', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({
        code: fallbackCode.code,
        installationId: 'inst_123',
        requestId: 'bind_123',
        bridgeNonce: 'wrong_nonce',
      }),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    error?: {
      code: string;
      message: string;
    };
  };

  assert.equal(response.status, 403);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.code, 'context_mismatch');
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
});

test('extension bind redeem route returns 404 for invalid or expired fallback code', async () => {
  const response = await POST(
    new Request('http://localhost/api/extension/bind/redeem', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        code: 'bindc_invalid_code',
      }),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    error?: {
      code: string;
      message: string;
    };
  };

  assert.equal(response.status, 404);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.code, 'invalid_or_expired');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('extension bind redeem route returns 503 when shared bind code store is required but unavailable', async () => {
  process.env.REDIS_URL = 'redis://127.0.0.1:6399';
  process.env.QUIZMIND_EXTENSION_BIND_CODE_STORE_MODE = 'required';
  await resetBindFallbackCodesForTests();

  const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const response = await POST(
    new Request('http://localhost/api/extension/bind/redeem', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({
        code: 'bindc_unavailable',
      }),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    error?: {
      code: string;
      message: string;
    };
  };

  assert.equal(response.status, 503);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.code, 'store_unavailable');
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
});

test('extension bind redeem OPTIONS responds with CORS metadata for valid extension origins', async () => {
  const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const response = await OPTIONS(
    new Request('http://localhost/api/extension/bind/redeem', {
      method: 'OPTIONS',
      headers: {
        origin,
      },
    }),
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-headers'), 'content-type');
});
