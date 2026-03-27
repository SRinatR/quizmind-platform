import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandshake } from '../../testing/src';
import {
  buildExtensionBootstrapV2,
  buildExtensionConnectUrl,
  connectToPlatform,
  createInMemoryPlatformStateStore,
  derivePlatformUiState,
  flushBufferedEvents,
  PlatformRuntimeClient,
  PlatformBridgeError,
  PlatformRequestError,
  PlatformStateManager,
  redeemBindFallbackCode,
  refreshBootstrap,
  resolveBootstrapRefreshDelayMs,
  sendRuntimeError,
  sendUsageEvent,
  shouldDisableManagedActions,
} from '@quizmind/extension';
import { type ExtensionInstallationBindResult, type UsageEventPayload } from '@quizmind/contracts';

function createBootstrap(issuedAt = '2026-03-27T12:00:00.000Z') {
  return buildExtensionBootstrapV2({
    installationId: 'inst_demo',
    workspaceId: 'ws_1',
    handshake: createHandshake({
      extensionVersion: '1.7.0',
      schemaVersion: '2',
      browser: 'chrome',
      capabilities: ['quiz-capture', 'history-sync'],
    }),
    compatibilityPolicy: {
      minimumVersion: '1.4.0',
      recommendedVersion: '1.7.0',
      supportedSchemaVersions: ['2'],
      requiredCapabilities: ['quiz-capture'],
    },
    flagDefinitions: [],
    remoteConfigLayers: [],
    entitlements: [],
    quotaHints: [],
    aiAccessPolicy: {
      mode: 'platform_only',
      allowPlatformManaged: true,
      allowBringYourOwnKey: false,
      allowDirectProviderMode: false,
      providers: ['openrouter'],
      defaultProvider: 'openrouter',
    },
    context: {
      workspaceId: 'ws_1',
      userId: 'user_1',
    },
    refreshAfterSeconds: 120,
    issuedAt,
  });
}

function createBindResult(): ExtensionInstallationBindResult {
  return {
    installation: {
      installationId: 'inst_demo',
      workspaceId: 'ws_1',
      userId: 'user_1',
      browser: 'chrome',
      extensionVersion: '1.7.0',
      schemaVersion: '2',
      capabilities: ['quiz-capture', 'history-sync'],
      boundAt: '2026-03-27T12:00:00.000Z',
      lastSeenAt: '2026-03-27T12:00:00.000Z',
    },
    session: {
      token: 'tok_demo_123',
      expiresAt: '2026-03-27T13:00:00.000Z',
      refreshAfterSeconds: 900,
    },
    bootstrap: createBootstrap(),
  };
}

test('PlatformStateManager persists installation id, bind session, and bootstrap cache', async () => {
  const store = createInMemoryPlatformStateStore();
  const state = new PlatformStateManager(store);
  const installationId = await state.getOrCreateInstallationId(() => 'inst_custom');

  assert.equal(installationId, 'inst_custom');
  await state.saveBindResult(createBindResult());

  const snapshot = await state.getSnapshot();

  assert.equal(snapshot.installationId, 'inst_custom');
  assert.equal(snapshot.workspaceId, 'ws_1');
  assert.equal(snapshot.installationSession?.token, 'tok_demo_123');
  assert.equal(snapshot.lastBootstrap?.installationId, 'inst_demo');
  assert.equal(snapshot.lastBootstrapFetchedAt, '2026-03-27T12:00:00.000Z');
});

test('buildExtensionConnectUrl and connectToPlatform produce/consume secure bridge envelopes', async () => {
  const requestId = 'bind_req_1';
  const bridgeNonce = 'nonce_abc12345';
  const handshake = createHandshake({
    extensionVersion: '1.7.0',
    schemaVersion: '2',
    capabilities: ['quiz-capture', 'history-sync'],
    browser: 'chrome',
    buildId: 'dev-local',
  });
  const directUrl = buildExtensionConnectUrl({
    siteUrl: 'http://localhost:3000',
    installationId: 'inst_demo',
    environment: 'development',
    handshake,
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    requestId,
    bridgeNonce,
    workspaceId: 'ws_1',
  });
  const parsedUrl = new URL(directUrl);

  assert.equal(parsedUrl.pathname, '/app/extension/connect');
  assert.equal(parsedUrl.searchParams.get('requestId'), requestId);
  assert.equal(parsedUrl.searchParams.get('bridgeNonce'), bridgeNonce);
  assert.equal(parsedUrl.searchParams.get('bridgeMode'), 'fallback_code');
  assert.equal(
    parsedUrl.searchParams.get('targetOrigin'),
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
  );

  const store = createInMemoryPlatformStateStore({
    'quizmind.platform.installation_id': 'inst_demo',
  });
  const state = new PlatformStateManager(store);
  const bindResult = createBindResult();
  const connected = await connectToPlatform({
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake,
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    requestId,
    bridgeNonce,
    state,
    workspaceId: 'ws_1',
    openBridge: ({ requestId: envelopeRequestId, bridgeNonce: envelopeNonce }) => ({
      type: 'quizmind.extension.bind_result',
      requestId: envelopeRequestId,
      bridgeNonce: envelopeNonce,
      payload: bindResult,
    }),
  });

  assert.equal(connected.session.token, 'tok_demo_123');
  assert.equal((await state.getInstallationSession())?.token, 'tok_demo_123');
});

test('connectToPlatform rejects bridge nonce mismatches', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
    }),
  );
  const handshake = createHandshake();

  await assert.rejects(
    () =>
      connectToPlatform({
        siteUrl: 'http://localhost:3000',
        environment: 'development',
        handshake,
        targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
        requestId: 'bind_req_2',
        bridgeNonce: 'nonce_expected',
        state,
        openBridge: () => ({
          type: 'quizmind.extension.bind_result',
          requestId: 'bind_req_2',
          bridgeNonce: 'nonce_wrong',
          payload: createBindResult(),
        }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof PlatformBridgeError);
      assert.equal(error.code, 'nonce_mismatch');
      return true;
    },
  );
});

test('redeemBindFallbackCode exchanges one-time fallback code for bind result', async () => {
  const bindResult = createBindResult();
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;

  const redeemed = await redeemBindFallbackCode({
    siteUrl: 'http://localhost:3000',
    fallbackCode: 'bindc_demo_123',
    installationId: 'inst_demo',
    requestId: 'bind_req_3',
    bridgeNonce: 'nonce_expected',
    fetcher: (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;

      return new Response(
        JSON.stringify({
          ok: true,
          data: bindResult,
          redeemedAt: '2026-03-27T12:10:00.000Z',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }) as typeof fetch,
  });

  assert.equal(redeemed.session.token, 'tok_demo_123');
  assert.equal(capturedUrl, 'http://localhost:3000/api/extension/bind/redeem');
  assert.equal((capturedInit?.method ?? '').toUpperCase(), 'POST');
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    code: 'bindc_demo_123',
    installationId: 'inst_demo',
    requestId: 'bind_req_3',
    bridgeNonce: 'nonce_expected',
  });
});

test('connectToPlatform redeems bridge fallback code envelopes and saves session state', async () => {
  const store = createInMemoryPlatformStateStore({
    'quizmind.platform.installation_id': 'inst_demo',
  });
  const state = new PlatformStateManager(store);
  const handshake = createHandshake();
  const bindResult = createBindResult();
  let capturedRedeemBody: Record<string, unknown> | null = null;

  const connected = await connectToPlatform({
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake,
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    requestId: 'bind_req_4',
    bridgeNonce: 'nonce_expected',
    state,
    openBridge: () => ({
      type: 'quizmind.extension.bind_fallback_code',
      requestId: 'bind_req_4',
      bridgeNonce: 'nonce_expected',
      fallbackCode: {
        code: 'bindc_demo_123',
      },
    }),
    fetcher: (async (_input, init) => {
      capturedRedeemBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

      return new Response(
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
      );
    }) as typeof fetch,
  });

  assert.equal(connected.session.token, 'tok_demo_123');
  assert.deepEqual(capturedRedeemBody, {
    code: 'bindc_demo_123',
    installationId: 'inst_demo',
    requestId: 'bind_req_4',
    bridgeNonce: 'nonce_expected',
  });
  assert.equal((await state.getInstallationSession())?.token, 'tok_demo_123');
});

test('PlatformRuntimeClient.redeemBindFallbackCode supports manual fallback redeem and persists bind state', async () => {
  const store = createInMemoryPlatformStateStore({
    'quizmind.platform.installation_id': 'inst_manual',
  });
  const state = new PlatformStateManager(store);
  const bindResult = createBindResult();
  let capturedRequestBody: Record<string, unknown> | null = null;
  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: async () => createBindResult(),
    fetcher: (async (_input, init) => {
      capturedRequestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

      return new Response(
        JSON.stringify({
          ok: true,
          data: bindResult,
          redeemedAt: '2026-03-27T12:10:00.000Z',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }) as typeof fetch,
  });

  const redeemed = await runtime.redeemBindFallbackCode({
    fallbackCode: 'bindc_manual_123',
    requestId: 'bind_req_5',
    bridgeNonce: 'nonce_manual',
  });

  assert.equal(redeemed.session.token, 'tok_demo_123');
  assert.deepEqual(capturedRequestBody, {
    code: 'bindc_manual_123',
    installationId: 'inst_manual',
    requestId: 'bind_req_5',
    bridgeNonce: 'nonce_manual',
  });
  assert.equal((await state.getInstallationSession())?.token, 'tok_demo_123');
});

test('refreshBootstrap stores cache and computes refresh delays', async () => {
  const state = new PlatformStateManager(createInMemoryPlatformStateStore());
  const bootstrap = createBootstrap('2026-03-27T12:00:00.000Z');
  const fetcher = (async () =>
    new Response(JSON.stringify({ ok: true, data: bootstrap }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })) as typeof fetch;
  const result = await refreshBootstrap({
    apiUrl: 'http://localhost:4000',
    token: 'tok_demo_123',
    request: {
      installationId: 'inst_demo',
      environment: 'development',
      handshake: createHandshake(),
    },
    state,
    fetcher,
  });

  assert.equal(result.installationId, 'inst_demo');
  assert.equal((await state.getBootstrapCache())?.payload.installationId, 'inst_demo');
  assert.equal(
    resolveBootstrapRefreshDelayMs({
      bootstrap,
      nowMs: Date.parse('2026-03-27T12:00:30.000Z'),
      earlyRefreshSeconds: 30,
      minDelayMs: 1_000,
    }),
    60_000,
  );
});

test('sendUsageEvent/sendRuntimeError/flushBufferedEvents deliver and retain events correctly', async () => {
  const observedEvents: UsageEventPayload[] = [];
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as UsageEventPayload;
    observedEvents.push(body);
    const shouldFail = body.eventType === 'extension.force_fail';

    return new Response(
      JSON.stringify(
        shouldFail
          ? { ok: false, error: { message: 'forced failure' } }
          : {
              ok: true,
              data: {
                queued: true,
                queue: 'usage-events',
                job: {
                  id: `job_${observedEvents.length}`,
                  queue: 'usage-events',
                  createdAt: new Date().toISOString(),
                },
                handler: 'worker.process-usage-event',
                logEvent: {
                  eventId: `evt_${observedEvents.length}`,
                  eventType: body.eventType,
                  occurredAt: body.occurredAt,
                  status: 'success',
                },
              },
            },
      ),
      {
        status: shouldFail ? 500 : 200,
        headers: {
          'content-type': 'application/json',
        },
      },
    );
  }) as typeof fetch;

  const usageResult = await sendUsageEvent({
    apiUrl: 'http://localhost:4000',
    token: 'tok_demo_123',
    event: {
      installationId: 'inst_demo',
      workspaceId: 'ws_1',
      eventType: 'extension.quiz_answer_requested',
      occurredAt: '2026-03-27T12:00:00.000Z',
      payload: {
        surface: 'popup',
      },
    },
    fetcher,
  });

  assert.equal(usageResult.queued, true);

  await sendRuntimeError({
    apiUrl: 'http://localhost:4000',
    token: 'tok_demo_123',
    installationId: 'inst_demo',
    workspaceId: 'ws_1',
    surface: 'popup',
    message: 'runtime crash',
    severity: 'error',
    fetcher,
  });
  assert.equal(observedEvents[1]?.eventType, 'extension.runtime_error');

  const flushed = await flushBufferedEvents({
    apiUrl: 'http://localhost:4000',
    token: 'tok_demo_123',
    fetcher,
    events: [
      {
        installationId: 'inst_demo',
        workspaceId: 'ws_1',
        eventType: 'extension.quiz_answer_requested',
        occurredAt: '2026-03-27T12:01:00.000Z',
        payload: {},
      },
      {
        installationId: 'inst_demo',
        workspaceId: 'ws_1',
        eventType: 'extension.force_fail',
        occurredAt: '2026-03-27T12:02:00.000Z',
        payload: {},
      },
    ],
  });

  assert.equal(flushed.delivered.length, 1);
  assert.equal(flushed.remaining.length, 1);
  assert.equal(flushed.remaining[0]?.eventType, 'extension.force_fail');
});

test('PlatformRuntimeClient sends runtime and lifecycle telemetry through persisted session context', async () => {
  const observedEvents: UsageEventPayload[] = [];
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  await state.saveInstallationSession({
    token: 'tok_demo_123',
    expiresAt: '2026-03-27T13:00:00.000Z',
    refreshAfterSeconds: 900,
  });

  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: async () => createBindResult(),
    fetcher: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as UsageEventPayload;
      observedEvents.push(body);

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            queued: true,
            queue: 'usage-events',
            job: {
              id: `job_${observedEvents.length}`,
              queue: 'usage-events',
              createdAt: new Date().toISOString(),
            },
            handler: 'worker.process-usage-event',
            logEvent: {
              eventId: `evt_${observedEvents.length}`,
              eventType: body.eventType,
              occurredAt: body.occurredAt,
              status: 'success',
            },
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }) as typeof fetch,
  });

  await runtime.sendRuntimeError({
    surface: 'popup',
    message: 'runtime crash',
    severity: 'error',
  });
  await runtime.sendBootstrapRefreshFailedEvent({
    message: 'gateway timeout',
    status: 504,
    retryable: true,
  });
  await runtime.sendReconnectRequestedEvent({
    reason: 'token_expired',
  });
  await runtime.sendReconnectedEvent();
  const flushed = await runtime.flushBufferedEvents({
    events: [
      {
        installationId: 'inst_demo',
        workspaceId: 'ws_1',
        eventType: 'extension.quiz_answer_requested',
        occurredAt: '2026-03-27T12:05:00.000Z',
        payload: {
          surface: 'popup',
        },
      },
    ],
  });

  assert.equal(flushed.delivered.length, 1);
  assert.equal(flushed.remaining.length, 0);
  assert.equal(observedEvents[0]?.eventType, 'extension.runtime_error');
  assert.equal(observedEvents[0]?.installationId, 'inst_demo');
  assert.equal(observedEvents[1]?.eventType, 'extension.bootstrap_refresh_failed');
  assert.equal(observedEvents[2]?.eventType, 'extension.installation_reconnect_requested');
  assert.equal(observedEvents[3]?.eventType, 'extension.installation_reconnected');
  assert.equal(observedEvents[4]?.eventType, 'extension.quiz_answer_requested');
});

test('derivePlatformUiState reflects reconnect, unsupported, and warning signals', () => {
  const unsupportedBootstrap = {
    ...createBootstrap(),
    compatibility: {
      status: 'unsupported',
      minimumVersion: '1.4.0',
      recommendedVersion: '1.7.0',
      supportedSchemaVersions: ['2'],
      reason: 'Upgrade required',
    },
    deprecationMessages: ['Upgrade required'],
    killSwitches: ['extension.unsupported'],
    quotaHints: [
      {
        key: 'limit.requests_per_day',
        label: 'Requests today',
        status: 'warning',
        enforcementMode: 'hard_limit',
      },
    ],
  };
  const state = derivePlatformUiState({
    bootstrap: unsupportedBootstrap,
    installationTokenExpiresAt: '2026-03-27T11:00:00.000Z',
    nowMs: Date.parse('2026-03-27T12:00:00.000Z'),
  });

  assert.equal(state.connectionState, 'reconnect_required');
  assert.equal(state.showReconnectPrompt, true);
  assert.equal(state.showUnsupportedBanner, true);
  assert.equal(state.quotaWarningCount, 1);
  assert.equal(shouldDisableManagedActions(unsupportedBootstrap), true);
});

test('PlatformRuntimeClient refreshes bootstrap and falls back to cache on auth expiry', async () => {
  const store = createInMemoryPlatformStateStore({
    'quizmind.platform.installation_id': 'inst_demo',
  });
  const state = new PlatformStateManager(store);
  const cachedBootstrap = createBootstrap('2026-03-27T11:00:00.000Z');

  await state.saveInstallationSession({
    token: 'tok_expired_soon',
    expiresAt: '2026-03-27T12:00:00.000Z',
    refreshAfterSeconds: 900,
  });
  await state.saveBootstrapCache(cachedBootstrap, '2026-03-27T11:00:00.000Z');

  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: async () => createBindResult(),
    fetcher: (async () =>
      new Response(JSON.stringify({ ok: false, error: { message: 'expired token' } }), {
        status: 401,
        headers: {
          'content-type': 'application/json',
        },
      })) as typeof fetch,
  });
  const refreshed = await runtime.refreshBootstrap();

  assert.equal(refreshed.source, 'cache');
  assert.equal(refreshed.reconnectRequired, true);
  assert.equal((await state.getInstallationSession())?.token, undefined);
});

test('PlatformRuntimeClient sends usage events and clears session when auth becomes invalid', async () => {
  const store = createInMemoryPlatformStateStore({
    'quizmind.platform.installation_id': 'inst_demo',
    'quizmind.platform.workspace_id': 'ws_1',
  });
  const state = new PlatformStateManager(store);

  await state.saveInstallationSession({
    token: 'tok_demo_123',
    expiresAt: '2026-03-27T13:00:00.000Z',
    refreshAfterSeconds: 900,
  });

  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: async () => createBindResult(),
    fetcher: (async () =>
      new Response(JSON.stringify({ ok: false, error: { message: 'expired token' } }), {
        status: 401,
        headers: {
          'content-type': 'application/json',
        },
      })) as typeof fetch,
  });

  await assert.rejects(
    () =>
      runtime.sendUsageEvent({
        eventType: 'extension.quiz_answer_requested',
        payload: {
          surface: 'popup',
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof PlatformRequestError);
      assert.equal(error.status, 401);
      return true;
    },
  );
  assert.equal((await state.getInstallationSession())?.token, undefined);
});

test('PlatformRuntimeClient schedules bootstrap refresh using computed delays', async () => {
  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state: new PlatformStateManager(createInMemoryPlatformStateStore()),
    openBridge: async () => createBindResult(),
  });
  let capturedDelayMs = -1;
  let invoked = false;
  const scheduled = runtime.scheduleBootstrapRefresh({
    bootstrap: createBootstrap('2026-03-27T12:00:00.000Z'),
    nowMs: Date.parse('2026-03-27T12:00:30.000Z'),
    earlyRefreshSeconds: 30,
    minDelayMs: 1_000,
    onRefresh: () => {
      invoked = true;
    },
    setTimer: (handler, timeoutMs) => {
      capturedDelayMs = timeoutMs;
      handler();
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
  });

  assert.equal(capturedDelayMs, 60_000);
  assert.equal(scheduled.delayMs, 60_000);
  assert.equal(invoked, true);
  scheduled.cancel();
});
