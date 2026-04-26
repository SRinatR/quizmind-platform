import assert from 'node:assert/strict';
import test from 'node:test';

import { buildForwardedAuthHeaders } from '../src/lib/bff-forwarding';

test('buildForwardedAuthHeaders preserves browser user-agent and forwarded chain', () => {
  const request = new Request('http://localhost/bff/auth/login', {
    method: 'POST',
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36',
      'x-forwarded-for': '198.51.100.23, 172.19.0.5',
      'x-real-ip': '198.51.100.23',
      'x-forwarded-proto': 'https',
    },
  });

  const headers = buildForwardedAuthHeaders(request);

  assert.equal(headers['user-agent'], 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36');
  assert.equal(headers['x-forwarded-for'], '198.51.100.23, 172.19.0.5');
  assert.equal(headers['x-real-ip'], '198.51.100.23');
  assert.equal(headers['x-forwarded-proto'], 'https');
});

test('buildForwardedAuthHeaders falls back to x-real-ip when x-forwarded-for is missing', () => {
  const request = new Request('http://localhost/bff/auth/login', {
    method: 'POST',
    headers: {
      'x-real-ip': '203.0.113.9',
    },
  });

  const headers = buildForwardedAuthHeaders(request);

  assert.equal(headers['x-forwarded-for'], '203.0.113.9');
});
