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
      return new Response(JSON.stringify({ ok: true, data: { items: [], total: 0, page: 1, limit: 25 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const response = await GET(new Request('http://localhost/bff/admin/users?query=john&role=admin&page=2&limit=50') as never);
  const payload = await response.json() as { ok: boolean };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(capturedUrl, 'http://platform.internal:4000/admin/users?query=john&role=admin&page=2&limit=50');
  assert.equal((capturedInit?.headers as Record<string, string>).authorization, 'Bearer token_123');
});
