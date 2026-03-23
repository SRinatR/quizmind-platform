export interface PlatformEnv {
  nodeEnv: 'development' | 'test' | 'production';
  appUrl: string;
  apiUrl: string;
  databaseUrl: string;
  redisUrl: string;
  runtimeMode: 'mock' | 'connected';
}

export type EnvSource = Record<string, string | undefined>;

export function readRequiredEnv(source: EnvSource, name: string): string {
  const value = source[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function readNumberEnv(source: EnvSource, name: string, fallback: number): number {
  const rawValue = source[name];

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function resolveNodeEnv(source: EnvSource): PlatformEnv['nodeEnv'] {
  const nodeEnv = source.NODE_ENV ?? 'development';

  return nodeEnv === 'production' || nodeEnv === 'test' ? nodeEnv : 'development';
}

function resolveRuntimeMode(source: EnvSource): PlatformEnv['runtimeMode'] {
  return source.QUIZMIND_RUNTIME_MODE === 'connected' ? 'connected' : 'mock';
}

export function loadPlatformEnv(source: EnvSource = process.env): PlatformEnv {
  return {
    nodeEnv: resolveNodeEnv(source),
    appUrl: source.APP_URL ?? source.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    apiUrl: source.API_URL ?? source.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
    databaseUrl: source.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/quizmind',
    redisUrl: source.REDIS_URL ?? 'redis://localhost:6379',
    runtimeMode: resolveRuntimeMode(source),
  };
}

export interface ApiEnv extends PlatformEnv {
  port: number;
  corsAllowedOrigins: string[];
  jwtSecret: string;
  jwtRefreshSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  emailProvider: 'noop' | 'resend';
  emailFrom: string;
  billingProvider: 'mock' | 'stripe';
  resendApiKey?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  authRateLimitWindowMs: number;
  authRateLimitMaxRequests: number;
  s3Bucket?: string;
  s3Endpoint?: string;
}

export interface WebEnv {
  nodeEnv: PlatformEnv['nodeEnv'];
  appUrl: string;
  apiUrl: string;
  defaultPersona: string;
}

export interface WorkerEnv extends PlatformEnv {
  heartbeatIntervalMs: number;
  s3Bucket?: string;
  s3Endpoint?: string;
}

function isBlank(value: string | undefined): boolean {
  return typeof value === 'undefined' || value.trim().length === 0;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
}

function parseListEnv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

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

function loadCorsAllowedOrigins(source: EnvSource, appUrl: string): string[] {
  const rawOrigins = parseListEnv(source.CORS_ALLOWED_ORIGINS);
  const resolvedOrigins = rawOrigins.length > 0 ? rawOrigins : [appUrl];

  return resolvedOrigins.map((origin) => normalizeOrigin(origin) ?? origin);
}

function resolveEmailProvider(source: EnvSource): ApiEnv['emailProvider'] {
  return source.EMAIL_PROVIDER === 'resend' ? 'resend' : 'noop';
}

function resolveBillingProvider(source: EnvSource): ApiEnv['billingProvider'] {
  return source.BILLING_PROVIDER === 'stripe' ? 'stripe' : 'mock';
}

export function loadApiEnv(source: EnvSource = process.env): ApiEnv {
  const platformEnv = loadPlatformEnv(source);

  return {
    ...platformEnv,
    port: readNumberEnv(source, 'API_PORT', 4000),
    corsAllowedOrigins: loadCorsAllowedOrigins(source, platformEnv.appUrl),
    jwtSecret: source.JWT_SECRET ?? 'replace-me',
    jwtRefreshSecret: source.JWT_REFRESH_SECRET ?? 'replace-me-refresh',
    jwtIssuer: source.JWT_ISSUER ?? platformEnv.apiUrl,
    jwtAudience: source.JWT_AUDIENCE ?? platformEnv.appUrl,
    emailProvider: resolveEmailProvider(source),
    emailFrom: source.EMAIL_FROM ?? 'noreply@quizmind.local',
    billingProvider: resolveBillingProvider(source),
    resendApiKey: source.RESEND_API_KEY,
    stripeSecretKey: source.STRIPE_SECRET_KEY,
    stripeWebhookSecret: source.STRIPE_WEBHOOK_SECRET,
    rateLimitWindowMs: readNumberEnv(source, 'RATE_LIMIT_WINDOW_MS', 60_000),
    rateLimitMaxRequests: readNumberEnv(source, 'RATE_LIMIT_MAX_REQUESTS', 120),
    authRateLimitWindowMs: readNumberEnv(source, 'AUTH_RATE_LIMIT_WINDOW_MS', 900_000),
    authRateLimitMaxRequests: readNumberEnv(source, 'AUTH_RATE_LIMIT_MAX_REQUESTS', 10),
    s3Bucket: source.S3_BUCKET,
    s3Endpoint: source.S3_ENDPOINT,
  };
}

export function loadWebEnv(source: EnvSource = process.env): WebEnv {
  const platformEnv = loadPlatformEnv(source);

  return {
    nodeEnv: platformEnv.nodeEnv,
    appUrl: platformEnv.appUrl,
    apiUrl: platformEnv.apiUrl,
    defaultPersona: source.DEFAULT_PERSONA ?? 'platform-admin',
  };
}

export function loadWorkerEnv(source: EnvSource = process.env): WorkerEnv {
  const platformEnv = loadPlatformEnv(source);

  return {
    ...platformEnv,
    heartbeatIntervalMs: readNumberEnv(source, 'WORKER_HEARTBEAT_MS', 30000),
    s3Bucket: source.S3_BUCKET,
    s3Endpoint: source.S3_ENDPOINT,
  };
}


export interface EnvValidationIssue {
  key: string;
  message: string;
}

export function validateApiEnv(env: ApiEnv): EnvValidationIssue[] {
  const issues: EnvValidationIssue[] = [];

  if (isBlank(env.apiUrl)) {
    issues.push({ key: 'API_URL', message: 'API_URL must be defined.' });
  } else if (!isValidUrl(env.apiUrl)) {
    issues.push({ key: 'API_URL', message: 'API_URL must be a valid absolute URL.' });
  }

  if (isBlank(env.appUrl)) {
    issues.push({ key: 'APP_URL', message: 'APP_URL must be defined.' });
  } else if (!isValidUrl(env.appUrl)) {
    issues.push({ key: 'APP_URL', message: 'APP_URL must be a valid absolute URL.' });
  }

  if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
    issues.push({ key: 'API_PORT', message: 'API_PORT must be an integer between 1 and 65535.' });
  }

  if (!env.jwtSecret || env.jwtSecret === 'replace-me') {
    issues.push({ key: 'JWT_SECRET', message: 'JWT_SECRET must be set to a non-placeholder value.' });
  }

  if (!env.jwtRefreshSecret || env.jwtRefreshSecret === 'replace-me-refresh') {
    issues.push({ key: 'JWT_REFRESH_SECRET', message: 'JWT_REFRESH_SECRET must be set to a non-placeholder value.' });
  }

  if (isBlank(env.jwtIssuer)) {
    issues.push({ key: 'JWT_ISSUER', message: 'JWT_ISSUER must be defined.' });
  } else if (!isValidUrl(env.jwtIssuer)) {
    issues.push({ key: 'JWT_ISSUER', message: 'JWT_ISSUER must be a valid absolute URL.' });
  }

  if (isBlank(env.jwtAudience)) {
    issues.push({ key: 'JWT_AUDIENCE', message: 'JWT_AUDIENCE must be defined.' });
  } else if (!isValidUrl(env.jwtAudience)) {
    issues.push({ key: 'JWT_AUDIENCE', message: 'JWT_AUDIENCE must be a valid absolute URL.' });
  }

  if (env.corsAllowedOrigins.length === 0) {
    issues.push({ key: 'CORS_ALLOWED_ORIGINS', message: 'At least one CORS origin must be configured.' });
  }

  for (const origin of env.corsAllowedOrigins) {
    if (origin === '*') {
      issues.push({ key: 'CORS_ALLOWED_ORIGINS', message: 'Wildcard CORS origins are not allowed.' });
      continue;
    }

    if (!normalizeOrigin(origin)) {
      issues.push({
        key: 'CORS_ALLOWED_ORIGINS',
        message: `CORS origin "${origin}" must be a valid absolute origin.`,
      });
    }
  }

  if (!Number.isInteger(env.rateLimitWindowMs) || env.rateLimitWindowMs < 1) {
    issues.push({ key: 'RATE_LIMIT_WINDOW_MS', message: 'RATE_LIMIT_WINDOW_MS must be a positive integer.' });
  }

  if (!Number.isInteger(env.rateLimitMaxRequests) || env.rateLimitMaxRequests < 1) {
    issues.push({ key: 'RATE_LIMIT_MAX_REQUESTS', message: 'RATE_LIMIT_MAX_REQUESTS must be a positive integer.' });
  }

  if (!Number.isInteger(env.authRateLimitWindowMs) || env.authRateLimitWindowMs < 1) {
    issues.push({
      key: 'AUTH_RATE_LIMIT_WINDOW_MS',
      message: 'AUTH_RATE_LIMIT_WINDOW_MS must be a positive integer.',
    });
  }

  if (!Number.isInteger(env.authRateLimitMaxRequests) || env.authRateLimitMaxRequests < 1) {
    issues.push({
      key: 'AUTH_RATE_LIMIT_MAX_REQUESTS',
      message: 'AUTH_RATE_LIMIT_MAX_REQUESTS must be a positive integer.',
    });
  }

  if (env.runtimeMode === 'connected') {
    if (!env.databaseUrl) {
      issues.push({ key: 'DATABASE_URL', message: 'DATABASE_URL is required in connected mode.' });
    }

    if (!env.redisUrl) {
      issues.push({ key: 'REDIS_URL', message: 'REDIS_URL is required in connected mode.' });
    }
  }

  if (env.nodeEnv === 'production') {
    if (env.emailProvider !== 'resend') {
      issues.push({
        key: 'EMAIL_PROVIDER',
        message: 'EMAIL_PROVIDER must be set to "resend" in production so auth emails are not dropped.',
      });
    }

    if (isBlank(env.resendApiKey)) {
      issues.push({ key: 'RESEND_API_KEY', message: 'RESEND_API_KEY is required in production.' });
    }

    if (env.billingProvider !== 'stripe') {
      issues.push({
        key: 'BILLING_PROVIDER',
        message: 'BILLING_PROVIDER must be set to "stripe" in production.',
      });
    }

    if (isBlank(env.stripeSecretKey)) {
      issues.push({ key: 'STRIPE_SECRET_KEY', message: 'STRIPE_SECRET_KEY is required in production.' });
    }

    if (isBlank(env.stripeWebhookSecret)) {
      issues.push({ key: 'STRIPE_WEBHOOK_SECRET', message: 'STRIPE_WEBHOOK_SECRET is required in production.' });
    }

    if (isBlank(env.emailFrom) || env.emailFrom === 'noreply@quizmind.local') {
      issues.push({ key: 'EMAIL_FROM', message: 'EMAIL_FROM must be set to a real sender address in production.' });
    }
  }

  if (!isBlank(env.s3Bucket) && isBlank(env.s3Endpoint)) {
    issues.push({ key: 'S3_ENDPOINT', message: 'S3_ENDPOINT is required when S3_BUCKET is set.' });
  }

  if (!isBlank(env.s3Endpoint) && isBlank(env.s3Bucket)) {
    issues.push({ key: 'S3_BUCKET', message: 'S3_BUCKET is required when S3_ENDPOINT is set.' });
  }

  return issues;
}

export function validateWorkerEnv(env: WorkerEnv): EnvValidationIssue[] {
  const issues: EnvValidationIssue[] = [];

  if (isBlank(env.apiUrl)) {
    issues.push({ key: 'API_URL', message: 'API_URL must be defined.' });
  } else if (!isValidUrl(env.apiUrl)) {
    issues.push({ key: 'API_URL', message: 'API_URL must be a valid absolute URL.' });
  }

  if (env.runtimeMode === 'connected') {
    if (!env.databaseUrl) {
      issues.push({ key: 'DATABASE_URL', message: 'DATABASE_URL is required in connected mode.' });
    }

    if (!env.redisUrl) {
      issues.push({ key: 'REDIS_URL', message: 'REDIS_URL is required in connected mode.' });
    }
  }

  if (!isBlank(env.s3Bucket) && isBlank(env.s3Endpoint)) {
    issues.push({ key: 'S3_ENDPOINT', message: 'S3_ENDPOINT is required when S3_BUCKET is set.' });
  }

  if (!isBlank(env.s3Endpoint) && isBlank(env.s3Bucket)) {
    issues.push({ key: 'S3_BUCKET', message: 'S3_BUCKET is required when S3_ENDPOINT is set.' });
  }

  return issues;
}
