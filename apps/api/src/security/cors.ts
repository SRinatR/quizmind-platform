import { type ApiEnv } from '@quizmind/config';

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);

    if (!url.protocol || !url.host) {
      return null;
    }

    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
      return `${url.protocol}//${url.host}`;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function isExtensionOrigin(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'chrome-extension:' || protocol === 'moz-extension:';
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = String(hostname || '').trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function isLoopbackUrl(value: string): boolean {
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function buildCorsOptions(env: ApiEnv) {
  const allowedOrigins = new Set(env.corsAllowedOrigins);
  const allowAnyExtensionOrigin = env.nodeEnv !== 'production' || isLoopbackUrl(env.apiUrl);

  return {
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      if (allowAnyExtensionOrigin && normalizedOrigin && isExtensionOrigin(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Requested-With', 'X-Request-Id'],
    exposedHeaders: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
}
