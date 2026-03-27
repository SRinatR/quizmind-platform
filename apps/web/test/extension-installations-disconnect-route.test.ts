import assert from 'node:assert/strict';
import test from 'node:test';
import { type ExtensionInstallationDisconnectResult } from '@quizmind/contracts';

import {
  POST,
  resetDisconnectRouteDependenciesForTests,
  setDisconnectRouteDependenciesForTests,
} from '../src/app/api/extension/installations/disconnect/route';

function createDisconnectResult(): ExtensionInstallationDisconnectResult {
  return {
    installationId: 'inst_123',
    workspaceId: 'ws_123',
    revokedSessionCount: 2,
    disconnectedAt: '2026-03-27T12:00:00.000Z',
    requiresReconnect: true,
  };
}

function createValidRequestBody(overrides?: Partial<Record<string, unknown>>) {
  return {
    installationId: 'inst_123',
    workspaceId: 'ws_123',
    reason: 'Investigating suspicious extension token activity.',
    ...(overrides ?? {}),
  };
}

test.beforeEach(() => {
  resetDisconnectRouteDependenciesForTests();
});

test('extension disconnect route returns 401 when site session token is missing', async () => {
  let fetchCalled = false;

  setDisconnectRouteDependenciesForTests({
    readAccessToken: async () => null,
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called when access token is missing');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/installations/disconnect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(createValidRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    error?: { message?: string };
  };

  assert.equal(response.status, 401);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.message, 'Sign in on the site before disconnecting an extension installation.');
  assert.equal(fetchCalled, false);
});

test('extension disconnect route validates installationId before upstream proxying', async () => {
  let fetchCalled = false;

  setDisconnectRouteDependenciesForTests({
    readAccessToken: async () => 'token_123',
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called for invalid payload');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/installations/disconnect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        createValidRequestBody({
          installationId: '   ',
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
  assert.equal(payload.error?.message, 'installationId is required.');
  assert.equal(fetchCalled, false);
});

test('extension disconnect route validates reason before upstream proxying', async () => {
  let fetchCalled = false;

  setDisconnectRouteDependenciesForTests({
    readAccessToken: async () => 'token_123',
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called for invalid payload');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/installations/disconnect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        createValidRequestBody({
          reason: '   ',
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
  assert.equal(payload.error?.message, 'reason is required.');
  assert.equal(fetchCalled, false);
});

test('extension disconnect route maps upstream errors', async () => {
  setDisconnectRouteDependenciesForTests({
    readAccessToken: async () => 'token_123',
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: ['Installation not found for workspace.'] }), {
        status: 404,
        headers: {
          'content-type': 'application/json',
        },
      }),
  });

  const response = await POST(
    new Request('http://localhost/api/extension/installations/disconnect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(createValidRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    error?: { message?: string };
  };

  assert.equal(response.status, 404);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.message, 'Installation not found for workspace.');
});

test('extension disconnect route proxies success payload and request metadata', async () => {
  const disconnectResult = createDisconnectResult();
  let capturedFetchUrl: string | undefined;
  let capturedFetchInit: RequestInit | undefined;

  setDisconnectRouteDependenciesForTests({
    apiUrl: 'http://platform.internal:4000',
    readAccessToken: async () => 'token_123',
    fetchImpl: async (input, init) => {
      capturedFetchUrl = String(input);
      capturedFetchInit = init;

      return new Response(
        JSON.stringify({
          ok: true,
          data: disconnectResult,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/installations/disconnect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(createValidRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    data?: ExtensionInstallationDisconnectResult;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data?.installationId, 'inst_123');
  assert.equal(payload.data?.revokedSessionCount, 2);
  assert.equal(capturedFetchUrl, 'http://platform.internal:4000/extension/installations/disconnect');
  assert.equal((capturedFetchInit?.headers as Record<string, string>)?.authorization, 'Bearer token_123');
  assert.equal((capturedFetchInit?.headers as Record<string, string>)?.['content-type'], 'application/json');
  assert.deepEqual(
    JSON.parse(String(capturedFetchInit?.body)),
    createValidRequestBody(),
  );
});
