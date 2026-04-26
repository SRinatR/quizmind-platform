import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GET,
  resetAdminUsersRouteDependenciesForTests,
  setAdminUsersRouteDependenciesForTests,
} from '../src/app/bff/admin/users/route';

test.beforeEach(() => {
  resetAdminUsersRouteDependenciesForTests();
});

test('admin users bff forwards auth token and query params', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  setAdminUsersRouteDependenciesForTests({
    apiUrl: 'http://platform.internal:4000',
    readAccessToken: async () => 'token_123',
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true, data: { items: [], hasNext: false, nextCursor: null, limit: 25 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const response = await GET(new Request('http://localhost/bff/admin/users?query=john&role=admin&cursor=abc&page=2&limit=50') as never);
  const payload = await response.json() as { ok: boolean };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(capturedUrl, 'http://platform.internal:4000/admin/users?query=john&role=admin&page=2&cursor=abc&limit=50');
  assert.equal((capturedInit?.headers as Record<string, string>).authorization, 'Bearer token_123');
});

test('admin users bff omits page by default when not present in request', async () => {
  let capturedUrl = '';

  setAdminUsersRouteDependenciesForTests({
    apiUrl: 'http://platform.internal:4000',
    readAccessToken: async () => 'token_123',
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ ok: true, data: { items: [], hasNext: false, nextCursor: null, limit: 25 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const response = await GET(new Request('http://localhost/bff/admin/users?query=john&limit=25') as never);
  assert.equal(response.status, 200);
  assert.equal(capturedUrl, 'http://platform.internal:4000/admin/users?query=john&limit=25');
});
