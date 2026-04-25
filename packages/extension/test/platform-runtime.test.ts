import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandshake } from '../../testing/src';
import {
  buildExtensionBootstrapV2,
  buildRecommendedHandshakeCapabilities,
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
  resolvePlatformSiteUrl,
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
      expiresAt: '2036-03-27T13:00:00.000Z',
      refreshAfterSeconds: 900,
    },
    bootstrap: createBootstrap(),
  };
}

function createUsageEvent(eventType: string, occurredAt: string): UsageEventPayload {
  return {
    installationId: 'inst_demo',
    workspaceId: 'ws_1',
    eventType,
    occurredAt,
    payload: {
      surface: 'popup',
    },
  };
}

function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
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

test('PlatformStateManager buffers telemetry events and trims oversized queues', async () => {
  const store = createInMemoryPlatformStateStore({
    'quizmind.platform.installation_id': 'inst_demo',
  });
  const state = new PlatformStateManager(store);

  await state.appendBufferedEvent(createUsageEvent('extension.quiz_answer_requested', '2026-03-27T12:01:00.000Z'), {
    maxItems: 2,
  });
  await state.appendBufferedEvent(createUsageEvent('extension.runtime_error', '2026-03-27T12:02:00.000Z'), {
    maxItems: 2,
  });
  await state.appendBufferedEvent(createUsageEvent('extension.installation_reconnect_requested', '2026-03-27T12:03:00.000Z'), {
    maxItems: 2,
  });

  const buffered = await state.getBufferedEvents();

  assert.equal(buffered.length, 2);
  assert.equal(buffered[0]?.eventType, 'extension.runtime_error');
  assert.equal(buffered[1]?.eventType, 'extension.installation_reconnect_requested');

  await state.clearRuntimeState({ keepInstallationId: true });

  assert.equal((await state.getInstallationId())?.startsWith('inst_'), true);
  assert.equal((await state.getBufferedEvents()).length, 0);
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
    relayUrl: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/relay.html',
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
    parsedUrl.searchParams.get('relayUrl'),
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop/relay.html',
  );
  assert.equal(parsedUrl.searchParams.get('platformOrigin'), 'http://localhost:3000');
  assert.equal(
    parsedUrl.searchParams.get('targetOrigin'),
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
  );

  const store = createInMemoryPlatformStateStore({
    'quizmind.platform.installation_id': 'inst_demo',
  });
  const state = new PlatformStateManager(store);
  const bindResult = createBindResult();
  let openedBridgeUrl: string | null = null;
  const connected = await connectToPlatform({
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake,
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    relayUrl: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/relay.html',
    requestId,
    bridgeNonce,
    state,
    workspaceId: 'ws_1',
    openBridge: ({ url, requestId: envelopeRequestId, bridgeNonce: envelopeNonce }) => {
      openedBridgeUrl = url;

      return {
        type: 'quizmind.extension.bind_result',
        requestId: envelopeRequestId,
        bridgeNonce: envelopeNonce,
        payload: bindResult,
      };
    },
  });

  assert.equal(connected.session.token, 'tok_demo_123');
  assert.equal((await state.getInstallationSession())?.token, 'tok_demo_123');
  assert.equal(new URL(String(openedBridgeUrl)).searchParams.get('requestId'), requestId);
  assert.equal(
    new URL(String(openedBridgeUrl)).searchParams.get('relayUrl'),
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop/relay.html',
  );
});

test('buildRecommendedHandshakeCapabilities includes quiz-capture and relay capabilities', () => {
  const capabilities = buildRecommendedHandshakeCapabilities([
    'runtime.chat',
    ' custom.capability ',
    '',
  ]);

  assert.ok(capabilities.includes('quiz-capture'));
  assert.ok(capabilities.includes('relay.query_payload'));
  assert.ok(capabilities.includes('relay.postmessage_payload'));
  assert.ok(capabilities.includes('runtime.chat'));
  assert.ok(capabilities.includes('custom.capability'));
  assert.equal(capabilities.filter((capability) => capability === 'runtime.chat').length, 1);
});

test('resolvePlatformSiteUrl defaults to localhost for development and normalizes URL origin', () => {
  assert.equal(resolvePlatformSiteUrl(), 'http://localhost:3000');
  assert.equal(
    resolvePlatformSiteUrl({
      nodeEnv: 'development',
      devOverrideSiteUrl: 'http://localhost:3000/app/extension/connect?mode=signup',
    }),
    'http://localhost:3000',
  );
});

test('resolvePlatformSiteUrl enforces secure non-loopback production URL', () => {
  assert.equal(
    resolvePlatformSiteUrl({
      nodeEnv: 'production',
      productionSiteUrl: 'https://quizmind.app/connect?flow=extension',
    }),
    'https://quizmind.app',
  );

  assert.throws(
    () =>
      resolvePlatformSiteUrl({
        nodeEnv: 'production',
      }),
    /required/i,
  );

  assert.throws(
    () =>
      resolvePlatformSiteUrl({
        nodeEnv: 'production',
        productionSiteUrl: 'http://quizmind.app',
      }),
    /https/i,
  );

  assert.throws(
    () =>
      resolvePlatformSiteUrl({
        nodeEnv: 'production',
        productionSiteUrl: 'https://localhost:3000',
      }),
    /localhost/i,
  );
});

test('buildExtensionConnectUrl rejects relay URLs that do not match targetOrigin', () => {
  const handshake = createHandshake({
    extensionVersion: '1.7.0',
    schemaVersion: '2',
    capabilities: ['quiz-capture', 'history-sync'],
    browser: 'chrome',
    buildId: 'dev-local',
  });

  assert.throws(
    () =>
      buildExtensionConnectUrl({
        siteUrl: 'http://localhost:3000',
        installationId: 'inst_demo',
        environment: 'development',
        handshake,
        targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
        relayUrl: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/relay.html',
        requestId: 'bind_req_1',
        bridgeNonce: 'nonce_abc12345',
      }),
    /relayUrl origin must match targetOrigin/i,
  );
});

test('buildExtensionConnectUrl rejects invalid bridge request metadata format', () => {
  const handshake = createHandshake({
    extensionVersion: '1.7.0',
    schemaVersion: '2',
    capabilities: ['quiz-capture', 'history-sync'],
    browser: 'chrome',
    buildId: 'dev-local',
  });

  assert.throws(
    () =>
      buildExtensionConnectUrl({
        siteUrl: 'http://localhost:3000',
        installationId: 'inst_demo',
        environment: 'development',
        handshake,
        targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
        requestId: 'invalid request id',
        bridgeNonce: 'nonce_abc12345',
      }),
    /requestId must be/i,
  );

  assert.throws(
    () =>
      buildExtensionConnectUrl({
        siteUrl: 'http://localhost:3000',
        installationId: 'inst_demo',
        environment: 'development',
        handshake,
        targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
        requestId: 'bind_req_valid_1',
        bridgeNonce: 'nonce invalid',
      }),
    /bridgeNonce must be/i,
  );
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

test('connectToPlatform rejects invalid requestId and bridgeNonce before opening bridge', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
    }),
  );
  const handshake = createHandshake();
  let openBridgeCalled = false;

  await assert.rejects(
    () =>
      connectToPlatform({
        siteUrl: 'http://localhost:3000',
        environment: 'development',
        handshake,
        targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
        requestId: 'invalid request id',
        state,
        openBridge: () => {
          openBridgeCalled = true;
          return createBindResult();
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof PlatformBridgeError);
      assert.equal(error.code, 'invalid_request_id');
      return true;
    },
  );
  assert.equal(openBridgeCalled, false);

  await assert.rejects(
    () =>
      connectToPlatform({
        siteUrl: 'http://localhost:3000',
        environment: 'development',
        handshake,
        targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
        requestId: 'bind_req_valid_1',
        bridgeNonce: 'nonce invalid',
        state,
        openBridge: () => {
          openBridgeCalled = true;
          return createBindResult();
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof PlatformBridgeError);
      assert.equal(error.code, 'invalid_bridge_nonce');
      return true;
    },
  );
  assert.equal(openBridgeCalled, false);
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

test('connectToPlatform accepts relay.query_payload bind_result URL responses', async () => {
  const store = createInMemoryPlatformStateStore({
    'quizmind.platform.installation_id': 'inst_demo',
  });
  const state = new PlatformStateManager(store);
  const handshake = createHandshake();
  const bindResult = createBindResult();
  const requestId = 'bind_req_query_payload_1';
  const bridgeNonce = 'nonce_query_payload_12345';
  const envelope = {
    type: 'quizmind.extension.bind_result',
    requestId,
    payload: bindResult,
  };
  const encodedPayload = encodeBase64UrlJson(envelope);

  const connected = await connectToPlatform({
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake,
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    requestId,
    bridgeNonce,
    state,
    openBridge: () =>
      `chrome-extension://abcdefghijklmnopabcdefghijklmnop/relay.html?quizmind_bridge_payload=${encodedPayload}&quizmind_bridge_payload_format=base64url-json&requestId=${requestId}&bridgeNonce=${bridgeNonce}`,
  });

  assert.equal(connected.session.token, 'tok_demo_123');
  assert.equal((await state.getInstallationSession())?.token, 'tok_demo_123');
});

test('connectToPlatform redeems fallback codes from relay.query_payload URL responses', async () => {
  const store = createInMemoryPlatformStateStore({
    'quizmind.platform.installation_id': 'inst_demo',
  });
  const state = new PlatformStateManager(store);
  const handshake = createHandshake();
  const bindResult = createBindResult();
  const requestId = 'bind_req_query_payload_2';
  const bridgeNonce = 'nonce_query_payload_67890';
  const envelope = {
    type: 'quizmind.extension.bind_fallback_code',
    requestId,
    fallbackCode: {
      code: 'bindc_query_payload_123',
    },
  };
  const encodedPayload = encodeBase64UrlJson(envelope);
  let capturedRedeemBody: Record<string, unknown> | null = null;

  const connected = await connectToPlatform({
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake,
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    requestId,
    bridgeNonce,
    state,
    openBridge: () =>
      `chrome-extension://abcdefghijklmnopabcdefghijklmnop/relay.html?quizmind_bridge_payload=${encodedPayload}&quizmind_bridge_payload_format=base64url-json&requestId=${requestId}&bridgeNonce=${bridgeNonce}`,
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
    code: 'bindc_query_payload_123',
    installationId: 'inst_demo',
    requestId,
    bridgeNonce,
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

test('flushBufferedEvents preserves FIFO ordering and stops on first failed event', async () => {
  const observedEvents: UsageEventPayload[] = [];
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as UsageEventPayload;
    observedEvents.push(body);
    const shouldFail = body.eventType === 'extension.force_fail_first';

    return new Response(
      JSON.stringify(
        shouldFail
          ? { ok: false, error: { message: 'forced first failure' } }
          : {
              ok: true,
              data: {
                queued: true,
                queue: 'usage-events',
                job: {
                  id: `job_${observedEvents.length}`,
                  queue: 'usage-events',
                  createdAt: '2026-03-27T12:03:00.000Z',
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

  const flushed = await flushBufferedEvents({
    apiUrl: 'http://localhost:4000',
    token: 'tok_demo_123',
    fetcher,
    events: [
      {
        installationId: 'inst_demo',
        workspaceId: 'ws_1',
        eventType: 'extension.force_fail_first',
        occurredAt: '2026-03-27T12:01:00.000Z',
        payload: {},
      },
      {
        installationId: 'inst_demo',
        workspaceId: 'ws_1',
        eventType: 'extension.should_not_send',
        occurredAt: '2026-03-27T12:02:00.000Z',
        payload: {},
      },
    ],
  });

  assert.equal(observedEvents.length, 1);
  assert.equal(flushed.delivered.length, 0);
  assert.equal(flushed.remaining.length, 2);
  assert.equal(flushed.remaining[0]?.eventType, 'extension.force_fail_first');
  assert.equal(flushed.remaining[1]?.eventType, 'extension.should_not_send');
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
    expiresAt: '2036-03-27T13:00:00.000Z',
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
    expiresAt: '2036-03-27T12:00:00.000Z',
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
  const bufferedEvents = await state.getBufferedEvents();

  assert.equal(bufferedEvents.length, 1);
  assert.equal(bufferedEvents[0]?.eventType, 'extension.installation_reconnect_requested');
  assert.equal((bufferedEvents[0]?.payload as { reason?: string }).reason, 'installation_session_expired');
});

test('PlatformRuntimeClient refreshBootstrap buffers one reconnect request when session is already missing', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );
  const cachedBootstrap = createBootstrap('2026-03-27T11:30:00.000Z');

  await state.saveBootstrapCache(cachedBootstrap, '2026-03-27T11:30:00.000Z');

  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: async () => createBindResult(),
    fetcher: (async () => {
      throw new Error('fetch should not be called without installation session');
    }) as typeof fetch,
  });

  const first = await runtime.refreshBootstrap();
  const second = await runtime.refreshBootstrap();

  assert.equal(first.source, 'cache');
  assert.equal(first.reconnectRequired, true);
  assert.equal(second.source, 'cache');
  assert.equal(second.reconnectRequired, true);
  const bufferedEvents = await state.getBufferedEvents();

  assert.equal(bufferedEvents.length, 1);
  assert.equal(bufferedEvents[0]?.eventType, 'extension.installation_reconnect_requested');
  assert.equal((bufferedEvents[0]?.payload as { reason?: string } | undefined)?.reason, 'installation_session_missing');
});

test('PlatformRuntimeClient refreshBootstrap treats expired session as reconnect-required when refresh rejects', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );
  const cachedBootstrap = createBootstrap('2026-03-27T11:45:00.000Z');

  await state.saveInstallationSession({
    token: 'tok_expired_local',
    expiresAt: '2026-03-27T11:00:00.000Z',
    refreshAfterSeconds: 900,
  });
  await state.saveBootstrapCache(cachedBootstrap, '2026-03-27T11:45:00.000Z');

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
  const bufferedEvents = await state.getBufferedEvents();

  assert.equal(bufferedEvents.length, 1);
  assert.equal(bufferedEvents[0]?.eventType, 'extension.installation_reconnect_requested');
  assert.equal((bufferedEvents[0]?.payload as { reason?: string } | undefined)?.reason, 'installation_session_expired');
});

test('PlatformRuntimeClient buffers bootstrap refresh failure telemetry for retryable backend outages', async () => {
  const store = createInMemoryPlatformStateStore({
    'quizmind.platform.installation_id': 'inst_demo',
    'quizmind.platform.workspace_id': 'ws_1',
  });
  const state = new PlatformStateManager(store);
  const cachedBootstrap = createBootstrap('2026-03-27T11:00:00.000Z');

  await state.saveInstallationSession({
    token: 'tok_retryable',
    expiresAt: '2036-03-27T12:30:00.000Z',
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
      new Response(JSON.stringify({ ok: false, error: { message: 'gateway timeout' } }), {
        status: 503,
        headers: {
          'content-type': 'application/json',
        },
      })) as typeof fetch,
  });
  const refreshed = await runtime.refreshBootstrap();

  assert.equal(refreshed.source, 'cache');
  assert.equal(refreshed.backendUnavailable, true);
  assert.equal(refreshed.reconnectRequired, false);
  const bufferedEvents = await state.getBufferedEvents();

  assert.equal(bufferedEvents.length, 1);
  assert.equal(bufferedEvents[0]?.eventType, 'extension.bootstrap_refresh_failed');
  assert.equal((bufferedEvents[0]?.payload as { status?: number }).status, 503);
  assert.equal((bufferedEvents[0]?.payload as { retryable?: boolean }).retryable, true);
});

test('PlatformRuntimeClient refreshes near-expiry session before bootstrap request', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  await state.saveInstallationSession({
    token: 'tok_expiring',
    expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    refreshAfterSeconds: 60,
  });

  const observedAuthHeaders: string[] = [];
  let refreshCallCount = 0;

  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: async () => createBindResult(),
    fetcher: (async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const authHeader = (init?.headers as Record<string, string> | undefined)?.authorization;

      if (url.endsWith('/extension/session/refresh')) {
        refreshCallCount += 1;
        assert.equal(authHeader, 'Bearer tok_expiring');
        assert.equal((await state.getInstallationSession())?.token, 'tok_expiring');

        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              installationToken: 'tok_refreshed',
              tokenExpiresAt: '2036-03-27T13:00:00.000Z',
              refreshAfterSeconds: 900,
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
      }

      observedAuthHeaders.push(authHeader ?? '');

      return new Response(
        JSON.stringify({
          ok: true,
          data: createBootstrap(),
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

  const result = await runtime.refreshBootstrap();

  assert.equal(result.source, 'live');
  assert.equal(refreshCallCount, 1);
  assert.deepEqual(observedAuthHeaders, ['Bearer tok_refreshed']);
  assert.equal((await state.getInstallationSession())?.token, 'tok_refreshed');
});

test('PlatformRuntimeClient deduplicates concurrent installation session refreshes', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  await state.saveInstallationSession({
    token: 'tok_expiring',
    expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    refreshAfterSeconds: 60,
  });

  let refreshCallCount = 0;

  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: async () => createBindResult(),
    fetcher: (async (input) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/extension/session/refresh')) {
        refreshCallCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));

        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              installationToken: 'tok_refreshed_once',
              tokenExpiresAt: '2036-03-27T13:00:00.000Z',
              refreshAfterSeconds: 900,
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          data: { accepted: true },
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

  await Promise.all([
    runtime.sendUsageEvent({
      eventType: 'extension.quiz_answer_requested',
      payload: { surface: 'popup' },
    }),
    runtime.sendUsageEvent({
      eventType: 'extension.quiz_answer_requested',
      payload: { surface: 'popup' },
    }),
  ]);

  assert.equal(refreshCallCount, 1);
  assert.equal((await state.getInstallationSession())?.token, 'tok_refreshed_once');
});

test('PlatformRuntimeClient sends usage events and clears session when auth becomes invalid', async () => {
  const store = createInMemoryPlatformStateStore({
    'quizmind.platform.installation_id': 'inst_demo',
    'quizmind.platform.workspace_id': 'ws_1',
  });
  const state = new PlatformStateManager(store);

  await state.saveInstallationSession({
    token: 'tok_demo_123',
    expiresAt: '2036-03-27T13:00:00.000Z',
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
  const bufferedEvents = await state.getBufferedEvents();

  assert.equal(bufferedEvents.length, 2);
  assert.equal(bufferedEvents[0]?.eventType, 'extension.quiz_answer_requested');
  assert.equal(bufferedEvents[1]?.eventType, 'extension.installation_reconnect_requested');
  assert.equal(
    (bufferedEvents[1]?.payload as { sourceEventType?: string } | undefined)?.sourceEventType,
    'extension.quiz_answer_requested',
  );
});

test('PlatformRuntimeClient retries usage event once after silent refresh on 401', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  await state.saveInstallationSession({
    token: 'tok_old',
    expiresAt: '2036-03-27T13:00:00.000Z',
    refreshAfterSeconds: 900,
  });

  let usageAttempts = 0;
  let refreshAttempts = 0;

  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: async () => createBindResult(),
    fetcher: (async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const authHeader = (init?.headers as Record<string, string> | undefined)?.authorization;

      if (url.endsWith('/extension/session/refresh')) {
        refreshAttempts += 1;
        assert.equal(authHeader, 'Bearer tok_old');

        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              installationToken: 'tok_new',
              tokenExpiresAt: '2036-03-27T14:00:00.000Z',
              refreshAfterSeconds: 900,
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
      }

      usageAttempts += 1;

      if (usageAttempts === 1) {
        return new Response(JSON.stringify({ ok: false, error: { message: 'expired token' } }), {
          status: 401,
          headers: {
            'content-type': 'application/json',
          },
        });
      }

      assert.equal(authHeader, 'Bearer tok_new');

      return new Response(JSON.stringify({ ok: true, data: { accepted: true } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    }) as typeof fetch,
  });

  const result = await runtime.sendUsageEvent({
    eventType: 'extension.quiz_answer_requested',
    payload: {
      surface: 'popup',
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(usageAttempts, 2);
  assert.equal(refreshAttempts, 1);
  assert.equal((await state.getInstallationSession())?.token, 'tok_new');
});

test('PlatformRuntimeClient buffers reconnect lifecycle telemetry when runtime error auth becomes invalid', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  await state.saveInstallationSession({
    token: 'tok_demo_123',
    expiresAt: '2036-03-27T13:00:00.000Z',
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
      runtime.sendRuntimeError({
        surface: 'popup',
        message: 'runtime crash',
        severity: 'error',
      }),
    (error: unknown) => {
      assert.ok(error instanceof PlatformRequestError);
      assert.equal(error.status, 401);
      return true;
    },
  );
  assert.equal((await state.getInstallationSession())?.token, undefined);
  const bufferedEvents = await state.getBufferedEvents();

  assert.equal(bufferedEvents.length, 2);
  assert.equal(bufferedEvents[0]?.eventType, 'extension.runtime_error');
  assert.equal(bufferedEvents[1]?.eventType, 'extension.installation_reconnect_requested');
  assert.equal(
    (bufferedEvents[1]?.payload as { sourceEventType?: string } | undefined)?.sourceEventType,
    'extension.runtime_error',
  );
});

test('PlatformRuntimeClient.sendUsageEvent can disable 401 buffering and reconnect telemetry', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  await state.saveInstallationSession({
    token: 'tok_demo_123',
    expiresAt: '2036-03-27T13:00:00.000Z',
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
        bufferOnFailure: false,
      }),
    (error: unknown) => {
      assert.ok(error instanceof PlatformRequestError);
      assert.equal(error.status, 401);
      return true;
    },
  );

  assert.equal((await state.getInstallationSession())?.token, undefined);
  assert.equal((await state.getBufferedEvents()).length, 0);
});

test('PlatformRuntimeClient.sendUsageEvent buffers event and deduplicates reconnect telemetry when session is missing', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: async () => createBindResult(),
    fetcher: (async () => {
      throw new Error('fetch should not be called without installation session');
    }) as typeof fetch,
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

  const bufferedEvents = await state.getBufferedEvents();
  const reconnectEventCount = bufferedEvents.filter(
    (event) => event.eventType === 'extension.installation_reconnect_requested',
  ).length;

  assert.equal(bufferedEvents.length, 3);
  assert.equal(bufferedEvents[0]?.eventType, 'extension.quiz_answer_requested');
  assert.equal(bufferedEvents[1]?.eventType, 'extension.installation_reconnect_requested');
  assert.equal(bufferedEvents[2]?.eventType, 'extension.quiz_answer_requested');
  assert.equal(reconnectEventCount, 1);
});

test('PlatformRuntimeClient.sendUsageEvent buffers telemetry when refresh fails for expired local session', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  await state.saveInstallationSession({
    token: 'tok_expired_local',
    expiresAt: '2026-03-27T11:00:00.000Z',
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
  const bufferedEvents = await state.getBufferedEvents();

  assert.equal(bufferedEvents.length, 2);
  assert.equal(bufferedEvents[0]?.eventType, 'extension.quiz_answer_requested');
  assert.equal(bufferedEvents[1]?.eventType, 'extension.installation_reconnect_requested');
  assert.equal((bufferedEvents[1]?.payload as { reason?: string } | undefined)?.reason, 'installation_session_expired');
});

test('PlatformRuntimeClient.sendRuntimeError buffers telemetry when session is missing', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: async () => createBindResult(),
    fetcher: (async () => {
      throw new Error('fetch should not be called without installation session');
    }) as typeof fetch,
  });

  await assert.rejects(
    () =>
      runtime.sendRuntimeError({
        surface: 'popup',
        message: 'runtime crash',
        severity: 'error',
      }),
    (error: unknown) => {
      assert.ok(error instanceof PlatformRequestError);
      assert.equal(error.status, 401);
      return true;
    },
  );

  const bufferedEvents = await state.getBufferedEvents();

  assert.equal(bufferedEvents.length, 2);
  assert.equal(bufferedEvents[0]?.eventType, 'extension.runtime_error');
  assert.equal(bufferedEvents[1]?.eventType, 'extension.installation_reconnect_requested');
  assert.equal((bufferedEvents[1]?.payload as { reason?: string } | undefined)?.reason, 'installation_session_missing');
});

test('PlatformRuntimeClient.flushBufferedEvents requires reconnect when refresh fails for expired local session', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  await state.saveInstallationSession({
    token: 'tok_expired_local',
    expiresAt: '2026-03-27T11:00:00.000Z',
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
      runtime.flushBufferedEvents({
        events: [
          {
            installationId: 'inst_demo',
            workspaceId: 'ws_1',
            eventType: 'extension.quiz_answer_requested',
            occurredAt: '2026-03-27T12:00:00.000Z',
            payload: {
              surface: 'popup',
            },
          },
        ],
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

test('PlatformRuntimeClient buffers retryable usage events and flushes persisted buffer', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  await state.saveInstallationSession({
    token: 'tok_demo_123',
    expiresAt: '2036-03-27T13:00:00.000Z',
    refreshAfterSeconds: 900,
  });

  let requestCount = 0;
  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: async () => createBindResult(),
    fetcher: (async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return new Response(JSON.stringify({ ok: false, error: { message: 'gateway timeout' } }), {
          status: 503,
          headers: {
            'content-type': 'application/json',
          },
        });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            queued: true,
            queue: 'usage-events',
            job: {
              id: `job_${requestCount}`,
              queue: 'usage-events',
              createdAt: '2026-03-27T12:20:00.000Z',
            },
            handler: 'worker.process-usage-event',
            logEvent: {
              eventId: `evt_${requestCount}`,
              eventType: 'extension.quiz_answer_requested',
              occurredAt: '2026-03-27T12:20:00.000Z',
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
      assert.equal(error.status, 503);
      return true;
    },
  );

  assert.equal((await state.getBufferedEvents()).length, 1);

  const flushed = await runtime.flushBufferedEventsFromState();

  assert.equal(flushed.delivered.length, 1);
  assert.equal(flushed.remaining.length, 0);
  assert.equal((await state.getBufferedEvents()).length, 0);
});

test('PlatformRuntimeClient.connectToPlatform flushes buffered telemetry after bind', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  await state.appendBufferedEvent(createUsageEvent('extension.quiz_answer_requested', '2026-03-27T12:30:00.000Z'));

  const observedUsageEvents: UsageEventPayload[] = [];
  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: ({ requestId, bridgeNonce }) => ({
      type: 'quizmind.extension.bind_result',
      requestId,
      bridgeNonce,
      payload: createBindResult(),
    }),
    fetcher: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as UsageEventPayload;
      observedUsageEvents.push(body);

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            queued: true,
            queue: 'usage-events',
            job: {
              id: `job_${observedUsageEvents.length}`,
              queue: 'usage-events',
              createdAt: '2026-03-27T12:31:00.000Z',
            },
            handler: 'worker.process-usage-event',
            logEvent: {
              eventId: `evt_${observedUsageEvents.length}`,
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

  const connected = await runtime.connectToPlatform({
    requestId: 'bind_req_flush_1',
    bridgeNonce: 'nonce_flush_12345',
  });

  assert.equal(connected.installation.installationId, 'inst_demo');
  assert.equal(observedUsageEvents.length, 1);
  assert.equal(observedUsageEvents[0]?.eventType, 'extension.quiz_answer_requested');
  assert.equal((await state.getBufferedEvents()).length, 0);
});

test('PlatformRuntimeClient.connectToPlatform emits reconnected telemetry when reconnect context exists', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
      'quizmind.platform.workspace_id': 'ws_1',
    }),
  );

  await state.saveBootstrapCache(createBootstrap('2026-03-27T12:40:00.000Z'), '2026-03-27T12:40:00.000Z');

  const observedUsageEvents: UsageEventPayload[] = [];
  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: ({ requestId, bridgeNonce }) => ({
      type: 'quizmind.extension.bind_result',
      requestId,
      bridgeNonce,
      payload: createBindResult(),
    }),
    fetcher: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as UsageEventPayload;
      observedUsageEvents.push(body);

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            queued: true,
            queue: 'usage-events',
            job: {
              id: `job_${observedUsageEvents.length}`,
              queue: 'usage-events',
              createdAt: '2026-03-27T12:41:00.000Z',
            },
            handler: 'worker.process-usage-event',
            logEvent: {
              eventId: `evt_${observedUsageEvents.length}`,
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

  const connected = await runtime.connectToPlatform({
    requestId: 'bind_req_reconnect_1',
    bridgeNonce: 'nonce_reconnect_12345',
  });

  assert.equal(connected.installation.installationId, 'inst_demo');
  assert.equal(observedUsageEvents.length, 1);
  assert.equal(observedUsageEvents[0]?.eventType, 'extension.installation_reconnected');
  assert.equal(
    (observedUsageEvents[0]?.payload as { source?: string } | undefined)?.source,
    'connect_to_platform',
  );
});

test('PlatformRuntimeClient.connectToPlatform does not emit reconnected telemetry on first bind', async () => {
  const state = new PlatformStateManager(
    createInMemoryPlatformStateStore({
      'quizmind.platform.installation_id': 'inst_demo',
    }),
  );
  const observedUsageEvents: UsageEventPayload[] = [];
  const runtime = new PlatformRuntimeClient({
    apiUrl: 'http://localhost:4000',
    siteUrl: 'http://localhost:3000',
    environment: 'development',
    handshake: createHandshake(),
    targetOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    state,
    openBridge: ({ requestId, bridgeNonce }) => ({
      type: 'quizmind.extension.bind_result',
      requestId,
      bridgeNonce,
      payload: createBindResult(),
    }),
    fetcher: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as UsageEventPayload;
      observedUsageEvents.push(body);

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            queued: true,
            queue: 'usage-events',
            job: {
              id: `job_${observedUsageEvents.length}`,
              queue: 'usage-events',
              createdAt: '2026-03-27T12:42:00.000Z',
            },
            handler: 'worker.process-usage-event',
            logEvent: {
              eventId: `evt_${observedUsageEvents.length}`,
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

  const connected = await runtime.connectToPlatform({
    requestId: 'bind_req_initial_1',
    bridgeNonce: 'nonce_initial_12345',
  });

  assert.equal(connected.installation.installationId, 'inst_demo');
  assert.equal(observedUsageEvents.length, 0);
});
