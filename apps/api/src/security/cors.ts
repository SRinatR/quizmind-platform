import { type ApiEnv } from '@quizmind/config';

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);

    if (!url.protocol || !url.host) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function buildCorsOptions(env: ApiEnv) {
  const allowedOrigins = new Set(env.corsAllowedOrigins);

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
