import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GET,
  resetAdminLogDetailRouteDependenciesForTests,
  setAdminLogDetailRouteDependenciesForTests,
} from '../src/app/bff/admin/logs/[id]/route';

test.beforeEach(() => {
  resetAdminLogDetailRouteDependenciesForTests();
});

test('admin log detail bff forwards auth token and path id', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  setAdminLogDetailRouteDependenciesForTests({
    apiUrl: 'http://platform.internal:4000',
    readAccessToken: async () => 'token_detail',
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true, data: { id: 'audit:abc' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const response = await GET(new Request('http://localhost/bff/admin/logs/audit%3Aabc') as never, {
    params: Promise.resolve({ id: 'audit:abc' }),
  });
  const payload = await response.json() as { ok: boolean; data?: { id?: string } };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data?.id, 'audit:abc');
  assert.equal(capturedUrl, 'http://platform.internal:4000/admin/logs/audit%3Aabc');
  assert.equal((capturedInit?.headers as Record<string, string>).authorization, 'Bearer token_detail');
});
