import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GET,
  resetAdminLogsRouteDependenciesForTests,
  setAdminLogsRouteDependenciesForTests,
} from '../src/app/bff/admin/logs/route';

test.beforeEach(() => {
  resetAdminLogsRouteDependenciesForTests();
});

test('admin logs bff forwards auth token and query params', async () => {
  let capturedUrl = '';

  setAdminLogsRouteDependenciesForTests({
    apiUrl: 'http://platform.internal:4000',
    readAccessToken: async () => 'token_abc',
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ ok: true, data: { items: [], total: 0, hasNext: false, filters: { stream: 'all', severity: 'all', limit: 25, page: 1 }, categoryCounts: { auth: 0, extension: 0, ai: 0, admin: 0, system: 0 }, streamCounts: { audit: 0, activity: 0, security: 0, domain: 0 }, permissions: [], accessDecision: { allowed: true, reasons: [] }, exportDecision: { allowed: true, reasons: [] }, personaKey: 'connected-user' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const response = await GET(new Request('http://localhost/bff/admin/logs?stream=audit&severity=error&page=3') as never);
  const payload = await response.json() as { ok: boolean };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(capturedUrl, 'http://platform.internal:4000/admin/logs?stream=audit&severity=error&page=3');
});
