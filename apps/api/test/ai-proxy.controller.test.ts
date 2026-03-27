import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';

import { AiProxyController } from '../src/ai/ai-proxy.controller';
import { type CurrentSessionSnapshot } from '../src/auth/auth.types';

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
    permissions: [],
  };
}

function createSseReadableStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }

      controller.close();
    },
  });
}

function createMockSseResponse() {
  const writable = new PassThrough();
  const chunks: Buffer[] = [];
  const headers = new Map<string, string>();
  let statusCode = 0;
  let flushed = false;

  writable.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const response = Object.assign(writable, {
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    flushHeaders() {
      flushed = true;
    },
  });

  return {
    response,
    getStatusCode() {
      return statusCode;
    },
    getHeader(name: string) {
      return headers.get(name);
    },
    wasFlushed() {
      return flushed;
    },
    getBody() {
      return Buffer.concat(chunks).toString('utf8');
    },
  };
}

test('AiProxyController.proxy streams SSE responses with passthrough headers and completion handling', async () => {
  const session = createSession();
  let proxyStreamCalled = false;
  let completionAwaited = false;
  let abortCalls = 0;
  const authService = {
    async getCurrentSession() {
      return session;
    },
  };
  const aiProxyService = {
    async proxyForCurrentSession() {
      throw new Error('proxyForCurrentSession should not be called for stream requests');
    },
    async proxyStreamForCurrentSession() {
      proxyStreamCalled = true;

      return {
        requestId: 'req_stream_1',
        workspaceId: 'ws_1',
        provider: 'openrouter' as const,
        model: 'openrouter/auto',
        keySource: 'platform' as const,
        contentType: 'text/event-stream; charset=utf-8',
        stream: createSseReadableStream([
          'data: {"id":"chunk_1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
        completion: Promise.resolve({
          requestId: 'req_stream_1',
          workspaceId: 'ws_1',
          provider: 'openrouter' as const,
          model: 'openrouter/auto',
          keySource: 'platform' as const,
          quota: {
            key: 'limit.requests_per_day',
            consumed: 2,
            limit: 5,
            remaining: 3,
            periodStart: '2026-03-24T00:00:00.000Z',
            periodEnd: '2026-03-25T00:00:00.000Z',
            decremented: true,
          },
        }).then((value) => {
          completionAwaited = true;
          return value;
        }),
        abort() {
          abortCalls += 1;
        },
      };
    },
    async listModelsForCurrentSession() {
      throw new Error('listModelsForCurrentSession is not part of this scenario');
    },
  };
  const controller = new AiProxyController(authService as any, aiProxyService as any);
  const mockResponse = createMockSseResponse();

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  await controller.proxy(
    {
      model: 'openrouter/auto',
      stream: true,
      messages: [{ role: 'user', content: 'Hello!' }],
    } as any,
    'Bearer token-stream',
    mockResponse.response,
  );

  assert.equal(proxyStreamCalled, true);
  assert.equal(mockResponse.getStatusCode(), 200);
  assert.equal(mockResponse.getHeader('Content-Type'), 'text/event-stream; charset=utf-8');
  assert.equal(mockResponse.getHeader('Cache-Control'), 'no-cache, no-transform');
  assert.equal(mockResponse.getHeader('Connection'), 'keep-alive');
  assert.equal(mockResponse.getHeader('X-Accel-Buffering'), 'no');
  assert.equal(mockResponse.wasFlushed(), true);
  assert.match(mockResponse.getBody(), /data: \{"id":"chunk_1"/);
  assert.equal(completionAwaited, true);
  assert.equal(abortCalls, 0);
});

test('AiProxyController.proxy returns ok envelope for non-stream proxy requests', async () => {
  const session = createSession();
  let proxyCalled = false;
  const authService = {
    async getCurrentSession() {
      return session;
    },
  };
  const aiProxyService = {
    async proxyForCurrentSession() {
      proxyCalled = true;

      return {
        requestId: 'req_sync_1',
        workspaceId: 'ws_1',
        provider: 'openrouter' as const,
        model: 'openrouter/auto',
        keySource: 'platform' as const,
        response: {
          id: 'gen_1',
        },
      };
    },
    async proxyStreamForCurrentSession() {
      throw new Error('proxyStreamForCurrentSession should not be called for non-stream requests');
    },
    async listModelsForCurrentSession() {
      throw new Error('listModelsForCurrentSession is not part of this scenario');
    },
  };
  const controller = new AiProxyController(authService as any, aiProxyService as any);

  (controller as any).env = {
    runtimeMode: 'connected',
  };

  const result = await controller.proxy(
    {
      model: 'openrouter/auto',
      messages: [{ role: 'user', content: 'Hello!' }],
    } as any,
    'Bearer token-sync',
  );

  assert.equal(proxyCalled, true);
  assert.equal(result?.ok, true);
  assert.equal(result?.data?.requestId, 'req_sync_1');
});

test('AiProxyController.proxy swallows stream completion persistence errors and logs them', async (t) => {
  const session = createSession();
  let proxyStreamCalled = false;
  let abortCalls = 0;
  const authService = {
    async getCurrentSession() {
      return session;
    },
  };
  const aiProxyService = {
    async proxyForCurrentSession() {
      throw new Error('proxyForCurrentSession should not be called for stream requests');
    },
    async proxyStreamForCurrentSession() {
      proxyStreamCalled = true;

      return {
        requestId: 'req_stream_2',
        workspaceId: 'ws_1',
        provider: 'openrouter' as const,
        model: 'openrouter/auto',
        keySource: 'platform' as const,
        contentType: 'text/event-stream; charset=utf-8',
        stream: createSseReadableStream(['data: {"id":"chunk_2","choices":[{"delta":{"content":"Hello"}}]}\n\n']),
        completion: Promise.reject(new Error('failed to persist completion')),
        abort() {
          abortCalls += 1;
        },
      };
    },
    async listModelsForCurrentSession() {
      throw new Error('listModelsForCurrentSession is not part of this scenario');
    },
  };
  const controller = new AiProxyController(authService as any, aiProxyService as any);
  const mockResponse = createMockSseResponse();
  const originalConsoleError = console.error;
  const logCalls: unknown[][] = [];

  (controller as any).env = {
    runtimeMode: 'connected',
  };
  console.error = (...args: unknown[]) => {
    logCalls.push(args);
  };
  t.after(() => {
    console.error = originalConsoleError;
  });

  await controller.proxy(
    {
      model: 'openrouter/auto',
      stream: true,
      messages: [{ role: 'user', content: 'Hello!' }],
    } as any,
    'Bearer token-stream',
    mockResponse.response,
  );

  assert.equal(proxyStreamCalled, true);
  assert.equal(mockResponse.getStatusCode(), 200);
  assert.equal(abortCalls, 0);
  assert.equal(logCalls.length, 1);
  assert.equal(logCalls[0]?.[0], '[ai-proxy] Failed to persist stream completion event.');
  assert.match(String(logCalls[0]?.[1]), /failed to persist completion/i);
});
