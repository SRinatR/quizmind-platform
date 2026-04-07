import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();

collectDefaultMetrics({ register, prefix: 'quizmind_api_' });

// HTTP counters and histograms
export const httpRequestsTotal = new Counter({
  name: 'quizmind_api_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_class'] as const,
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'quizmind_api_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const http5xxTotal = new Counter({
  name: 'quizmind_api_http_5xx_total',
  help: 'Total number of HTTP 5xx responses',
  labelNames: ['method', 'route'] as const,
  registers: [register],
});

// App-level counters
export const extensionBindTotal = new Counter({
  name: 'quizmind_api_extension_bind_total',
  help: 'Total extension bind attempts',
  labelNames: ['outcome'] as const,
  registers: [register],
});

export const aiProxyRequestsTotal = new Counter({
  name: 'quizmind_api_ai_proxy_requests_total',
  help: 'Total AI proxy requests',
  labelNames: ['outcome'] as const,
  registers: [register],
});

/**
 * Normalize a URL path to a low-cardinality route label.
 * Takes the first two non-empty path segments.
 * e.g. /auth/login?foo=bar -> /auth/login
 *      /admin/users/abc123 -> /admin/users
 */
export function normalizeRoute(url: string): string {
  const path = (url || '/').split('?')[0].split('#')[0];
  const parts = path.split('/').filter(Boolean).slice(0, 2);
  return parts.length === 0 ? '/' : '/' + parts.join('/');
}

export function statusClass(code: number): string {
  if (code < 200) return '1xx';
  if (code < 300) return '2xx';
  if (code < 400) return '3xx';
  if (code < 500) return '4xx';
  return '5xx';
}
