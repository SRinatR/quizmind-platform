import assert from 'node:assert/strict';
import test from 'node:test';
import { type ExtensionInstallationBindResult } from '@quizmind/contracts';

import {
  BindCodeStoreUnavailableError,
  extensionBindFallbackRedeemPath,
  issueBindFallbackCode,
  redeemBindFallbackCode,
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

test('issueBindFallbackCode creates a redeemable one-time bind code', async () => {
  const fallbackCode = await issueBindFallbackCode({
    result: createBindResult(),
    installationId: 'inst_123',
    requestId: 'bind_123',
    bridgeNonce: 'nonce_12345',
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    nowMs: Date.UTC(2026, 2, 27, 10, 0, 0),
  });

  assert.match(fallbackCode.code, /^bindc_/);
  assert.equal(fallbackCode.redeemPath, extensionBindFallbackRedeemPath);
  assert.equal(fallbackCode.ttlSeconds, 180);
});

test('redeemBindFallbackCode returns payload once and invalidates the code', async () => {
  const nowMs = Date.UTC(2026, 2, 27, 10, 0, 0);
  const fallbackCode = await issueBindFallbackCode({
    result: createBindResult(),
    installationId: 'inst_123',
    requestId: 'bind_123',
    bridgeNonce: 'nonce_12345',
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    nowMs,
  });

  const firstRedeem = await redeemBindFallbackCode({
    code: fallbackCode.code,
    installationId: 'inst_123',
    requestId: 'bind_123',
    bridgeNonce: 'nonce_12345',
    requestOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    nowMs: nowMs + 1_000,
  });

  assert.equal(firstRedeem.ok, true);
  if (firstRedeem.ok) {
    assert.equal(firstRedeem.result.installation.installationId, 'inst_123');
  }

  const secondRedeem = await redeemBindFallbackCode({
    code: fallbackCode.code,
    nowMs: nowMs + 2_000,
  });

  assert.equal(secondRedeem.ok, false);
  if (!secondRedeem.ok) {
    assert.equal(secondRedeem.code, 'invalid_or_expired');
  }
});

test('redeemBindFallbackCode enforces context checks when request metadata is present', async () => {
  const nowMs = Date.UTC(2026, 2, 27, 10, 0, 0);
  const fallbackCode = await issueBindFallbackCode({
    result: createBindResult(),
    installationId: 'inst_123',
    requestId: 'bind_123',
    bridgeNonce: 'nonce_12345',
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    nowMs,
  });

  const mismatch = await redeemBindFallbackCode({
    code: fallbackCode.code,
    installationId: 'inst_123',
    requestId: 'bind_123',
    bridgeNonce: 'wrong_nonce',
    requestOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    nowMs: nowMs + 1_000,
  });

  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) {
    assert.equal(mismatch.code, 'context_mismatch');
  }
});

test('redeemBindFallbackCode expires stale codes', async () => {
  const nowMs = Date.UTC(2026, 2, 27, 10, 0, 0);
  const fallbackCode = await issueBindFallbackCode({
    result: createBindResult(),
    installationId: 'inst_123',
    ttlSeconds: 60,
    nowMs,
  });

  const expired = await redeemBindFallbackCode({
    code: fallbackCode.code,
    nowMs: nowMs + 61_000,
  });

  assert.equal(expired.ok, false);
  if (!expired.ok) {
    assert.equal(expired.code, 'invalid_or_expired');
  }
});

test('bind fallback codes stay redeemable when redis is configured but unavailable', async () => {
  process.env.REDIS_URL = 'redis://127.0.0.1:6399';
  await resetBindFallbackCodesForTests();

  const nowMs = Date.UTC(2026, 2, 27, 10, 0, 0);
  const fallbackCode = await issueBindFallbackCode({
    result: createBindResult(),
    installationId: 'inst_123',
    nowMs,
  });

  const redeemed = await redeemBindFallbackCode({
    code: fallbackCode.code,
    nowMs: nowMs + 1_000,
  });

  assert.equal(redeemed.ok, true);
});

test('issueBindFallbackCode fails closed in required shared-store mode when redis is unavailable', async () => {
  process.env.REDIS_URL = 'redis://127.0.0.1:6399';
  process.env.QUIZMIND_EXTENSION_BIND_CODE_STORE_MODE = 'required';
  await resetBindFallbackCodesForTests();

  await assert.rejects(
    () =>
      issueBindFallbackCode({
        result: createBindResult(),
        installationId: 'inst_123',
        nowMs: Date.UTC(2026, 2, 27, 10, 0, 0),
      }),
    (error: unknown) => error instanceof BindCodeStoreUnavailableError,
  );
});

test('redeemBindFallbackCode reports store_unavailable in required shared-store mode when redis is unavailable', async () => {
  process.env.REDIS_URL = 'redis://127.0.0.1:6399';
  process.env.QUIZMIND_EXTENSION_BIND_CODE_STORE_MODE = 'required';
  await resetBindFallbackCodesForTests();

  const result = await redeemBindFallbackCode({
    code: 'bindc_missing',
    nowMs: Date.UTC(2026, 2, 27, 10, 0, 0),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'store_unavailable');
  }
});
