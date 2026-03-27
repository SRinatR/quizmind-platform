import assert from 'node:assert/strict';
import test from 'node:test';
import { type ExtensionInstallationRotateSessionResult } from '@quizmind/contracts';

import {
  POST,
  resetRotateSessionRouteDependenciesForTests,
  setRotateSessionRouteDependenciesForTests,
} from '../src/app/api/extension/installations/rotate-session/route';

function createRotateResult(): ExtensionInstallationRotateSessionResult {
  return {
    installationId: 'inst_123',
    workspaceId: 'ws_123',
    revokedSessionCount: 3,
    rotatedAt: '2026-03-27T12:00:00.000Z',
    session: {
      token: 'inst_tok_rotated_123',
      expiresAt: '2026-03-27T13:00:00.000Z',
      refreshAfterSeconds: 900,
    },
  };
}

function createValidRequestBody(overrides?: Partial<Record<string, unknown>>) {
  return {
    installationId: 'inst_123',
    workspaceId: 'ws_123',
    ...(overrides ?? {}),
  };
}

test.beforeEach(() => {
  resetRotateSessionRouteDependenciesForTests();
});

test('extension rotate-session route returns 401 when site session token is missing', async () => {
  let fetchCalled = false;

  setRotateSessionRouteDependenciesForTests({
    readAccessToken: async () => null,
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called when access token is missing');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/installations/rotate-session', {
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
  assert.equal(payload.error?.message, 'Sign in on the site before rotating an installation session.');
  assert.equal(fetchCalled, false);
});

test('extension rotate-session route validates installationId before upstream proxying', async () => {
  let fetchCalled = false;

  setRotateSessionRouteDependenciesForTests({
    readAccessToken: async () => 'token_123',
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called for invalid payload');
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/installations/rotate-session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        createValidRequestBody({
          installationId: '',
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

test('extension rotate-session route maps upstream errors', async () => {
  setRotateSessionRouteDependenciesForTests({
    readAccessToken: async () => 'token_123',
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: ['Workspace not found or not accessible.'] }), {
        status: 403,
        headers: {
          'content-type': 'application/json',
        },
      }),
  });

  const response = await POST(
    new Request('http://localhost/api/extension/installations/rotate-session', {
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

  assert.equal(response.status, 403);
  assert.equal(payload.ok, false);
  assert.equal(payload.error?.message, 'Workspace not found or not accessible.');
});

test('extension rotate-session route proxies success payload and request metadata', async () => {
  const rotateResult = createRotateResult();
  let capturedFetchUrl: string | undefined;
  let capturedFetchInit: RequestInit | undefined;

  setRotateSessionRouteDependenciesForTests({
    apiUrl: 'http://platform.internal:4000',
    readAccessToken: async () => 'token_123',
    fetchImpl: async (input, init) => {
      capturedFetchUrl = String(input);
      capturedFetchInit = init;

      return new Response(
        JSON.stringify({
          ok: true,
          data: rotateResult,
        }),
        {
          status: 201,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    },
  });

  const response = await POST(
    new Request('http://localhost/api/extension/installations/rotate-session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(createValidRequestBody()),
    }),
  );
  const payload = (await response.json()) as {
    ok: boolean;
    data?: ExtensionInstallationRotateSessionResult;
  };

  assert.equal(response.status, 201);
  assert.equal(payload.ok, true);
  assert.equal(payload.data?.installationId, 'inst_123');
  assert.equal(payload.data?.revokedSessionCount, 3);
  assert.equal(payload.data?.session.token, 'inst_tok_rotated_123');
  assert.equal(capturedFetchUrl, 'http://platform.internal:4000/extension/installations/rotate-session');
  assert.equal((capturedFetchInit?.headers as Record<string, string>)?.authorization, 'Bearer token_123');
  assert.equal((capturedFetchInit?.headers as Record<string, string>)?.['content-type'], 'application/json');
  assert.deepEqual(
    JSON.parse(String(capturedFetchInit?.body)),
    createValidRequestBody(),
  );
});
