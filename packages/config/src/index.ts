import process from 'node:process';

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
  const nodeEnv = resolveNodeEnv(source);

  return {
    nodeEnv,
    appUrl: source.APP_URL ?? source.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    apiUrl: source.API_URL ?? source.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
    databaseUrl:
      source.DATABASE_URL ??
      (nodeEnv === 'production' ? '' : 'postgresql://postgres:postgres@localhost:5432/quizmind'),
    redisUrl: source.REDIS_URL ?? (nodeEnv === 'production' ? '' : 'redis://localhost:6379'),
    runtimeMode: resolveRuntimeMode(source),
  };
}

export interface ApiEnv extends PlatformEnv {
  port: number;
  trustProxyHops: number;
  corsAllowedOrigins: string[];
  jwtSecret: string;
  jwtRefreshSecret: string;
  extensionTokenSecret: string;
  extensionSessionTtlMinutes: number;
  providerCredentialSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  emailProvider: 'noop' | 'resend';
  emailFrom: string;
  billingProvider: 'mock' | 'stripe' | 'manual' | 'yookassa' | 'paddle';
  resendApiKey?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  yookassaShopId?: string;
  yookassaSecretKey?: string;
  yookassaWebhookSecret?: string;
  yookassaReturnUrl?: string;
  paddleApiKey?: string;
  paddleWebhookSecret?: string;
  openRouterApiUrl: string;
  openRouterApiKey?: string;
  openRouterAppName: string;
  openRouterTimeoutMs: number;
  routerAiApiUrl: string;
  routerAiApiKey?: string;
  routerAiTimeoutMs: number;
  platformAiProvider: 'openrouter' | 'routerai';
  polzaApiUrl: string;
  polzaApiKey?: string;
  polzaTimeoutMs: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  authRateLimitWindowMs: number;
  authRateLimitMaxRequests: number;
  s3Bucket?: string;
  s3Endpoint?: string;
  adminBootstrapEmail?: string;
  adminBootstrapPassword?: string;
  adminBootstrapName?: string;
}

export interface WebEnv {
  nodeEnv: PlatformEnv['nodeEnv'];
  appUrl: string;
  apiUrl: string;
  defaultPersona: string;
  extensionBindCodeStoreModeRaw?: string;
  extensionStrictPlatformOriginRaw?: string;
}

export interface WorkerEnv extends PlatformEnv {
  heartbeatIntervalMs: number;
  emailProvider: 'noop' | 'resend';
  emailFrom: string;
  resendApiKey?: string;
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

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
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

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
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

    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
      return `${url.protocol}//${url.host}`;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function loadCorsAllowedOrigins(source: EnvSource, appUrl: string): string[] {
  const rawOrigins = parseListEnv(source.CORS_ALLOWED_ORIGINS);
  const resolvedOrigins = rawOrigins.length > 0 ? rawOrigins : [appUrl];
  const webOrigins = resolvedOrigins.map((origin) => normalizeOrigin(origin) ?? origin);

  const extensionOrigins = parseListEnv(source.ALLOWED_EXTENSION_ORIGINS)
    .map((o) => normalizeOrigin(o))
    .filter((o): o is string => o !== null && isExtensionOrigin(o));

  return [...webOrigins, ...extensionOrigins];
}

function resolveEmailProvider(source: EnvSource): ApiEnv['emailProvider'] {
  return source.EMAIL_PROVIDER === 'resend' ? 'resend' : 'noop';
}

function resolveBillingProvider(source: EnvSource): ApiEnv['billingProvider'] {
  if (source.BILLING_PROVIDER === 'manual') {
    return 'manual';
  }

  if (source.BILLING_PROVIDER === 'yookassa') {
    return 'yookassa';
  }

  if (source.BILLING_PROVIDER === 'paddle') {
    return 'paddle';
  }

  return source.BILLING_PROVIDER === 'stripe' ? 'stripe' : 'mock';
}

function resolvePlatformAiProvider(source: EnvSource): ApiEnv['platformAiProvider'] {
  return source.PLATFORM_AI_PROVIDER === 'routerai' ? 'routerai' : 'openrouter';
}

export function loadApiEnv(source: EnvSource = process.env): ApiEnv {
  const platformEnv = loadPlatformEnv(source);

  return {
    ...platformEnv,
    port: readNumberEnv(source, 'API_PORT', 4000),
    trustProxyHops: readNumberEnv(source, 'TRUST_PROXY_HOPS', 0),
    corsAllowedOrigins: loadCorsAllowedOrigins(source, platformEnv.appUrl),
    jwtSecret: source.JWT_SECRET ?? 'replace-me',
    jwtRefreshSecret: source.JWT_REFRESH_SECRET ?? 'replace-me-refresh',
    extensionTokenSecret:
      source.EXTENSION_TOKEN_SECRET ??
      (platformEnv.nodeEnv === 'production' ? '' : source.JWT_REFRESH_SECRET ?? 'replace-me-extension'),
    extensionSessionTtlMinutes: readNumberEnv(source, 'EXTENSION_SESSION_TTL_MINUTES', 30),
    providerCredentialSecret:
      source.PROVIDER_CREDENTIAL_SECRET ??
      (platformEnv.nodeEnv === 'production' ? '' : source.JWT_REFRESH_SECRET ?? 'replace-me-provider'),
    jwtIssuer: source.JWT_ISSUER ?? platformEnv.apiUrl,
    jwtAudience: source.JWT_AUDIENCE ?? platformEnv.appUrl,
    emailProvider: resolveEmailProvider(source),
    emailFrom: source.EMAIL_FROM ?? 'noreply@quizmind.local',
    billingProvider: resolveBillingProvider(source),
    resendApiKey: source.RESEND_API_KEY,
    stripeSecretKey: source.STRIPE_SECRET_KEY,
    stripeWebhookSecret: source.STRIPE_WEBHOOK_SECRET,
    yookassaShopId: source.YOOKASSA_SHOP_ID,
    yookassaSecretKey: source.YOOKASSA_SECRET_KEY,
    yookassaWebhookSecret: source.YOOKASSA_WEBHOOK_SECRET,
    yookassaReturnUrl: source.YOOKASSA_RETURN_URL,
    paddleApiKey: source.PADDLE_API_KEY,
    paddleWebhookSecret: source.PADDLE_WEBHOOK_SECRET,
    openRouterApiUrl: source.OPENROUTER_API_URL ?? 'https://openrouter.ai/api/v1',
    openRouterApiKey: source.OPENROUTER_API_KEY,
    openRouterAppName: source.OPENROUTER_APP_NAME ?? 'QuizMind Platform',
    openRouterTimeoutMs: readNumberEnv(source, 'OPENROUTER_TIMEOUT_MS', 45000),
    routerAiApiUrl: source.ROUTERAI_API_URL ?? 'https://routerai.ru/api/v1',
    routerAiApiKey: source.ROUTERAI_API_KEY,
    routerAiTimeoutMs: readNumberEnv(source, 'ROUTERAI_TIMEOUT_MS', 45000),
    platformAiProvider: resolvePlatformAiProvider(source),
    polzaApiUrl: source.POLZA_API_URL ?? 'https://api.polza.ai/v1',
    polzaApiKey: source.POLZA_API_KEY,
    polzaTimeoutMs: readNumberEnv(source, 'POLZA_TIMEOUT_MS', 45000),
    rateLimitWindowMs: readNumberEnv(source, 'RATE_LIMIT_WINDOW_MS', 60_000),
    rateLimitMaxRequests: readNumberEnv(source, 'RATE_LIMIT_MAX_REQUESTS', 120),
    authRateLimitWindowMs: readNumberEnv(source, 'AUTH_RATE_LIMIT_WINDOW_MS', 900_000),
    authRateLimitMaxRequests: readNumberEnv(source, 'AUTH_RATE_LIMIT_MAX_REQUESTS', 10),
    s3Bucket: source.S3_BUCKET,
    s3Endpoint: source.S3_ENDPOINT,
    adminBootstrapEmail: source.ADMIN_BOOTSTRAP_EMAIL,
    adminBootstrapPassword: source.ADMIN_BOOTSTRAP_PASSWORD,
    adminBootstrapName: source.ADMIN_BOOTSTRAP_NAME,
  };
}

export function loadWebEnv(source: EnvSource = process.env): WebEnv {
  const platformEnv = loadPlatformEnv(source);
  const extensionBindCodeStoreModeRaw = source.QUIZMIND_EXTENSION_BIND_CODE_STORE_MODE?.trim();
  const extensionStrictPlatformOriginRaw = source.QUIZMIND_EXTENSION_STRICT_PLATFORM_ORIGIN?.trim();

  return {
    nodeEnv: platformEnv.nodeEnv,
    appUrl: platformEnv.appUrl,
    apiUrl: platformEnv.apiUrl,
    defaultPersona: source.DEFAULT_PERSONA ?? 'platform-admin',
    ...(extensionBindCodeStoreModeRaw ? { extensionBindCodeStoreModeRaw } : {}),
    ...(extensionStrictPlatformOriginRaw ? { extensionStrictPlatformOriginRaw } : {}),
  };
}

export function loadWorkerEnv(source: EnvSource = process.env): WorkerEnv {
  const platformEnv = loadPlatformEnv(source);

  return {
    ...platformEnv,
    heartbeatIntervalMs: readNumberEnv(source, 'WORKER_HEARTBEAT_MS', 30000),
    emailProvider: resolveEmailProvider(source),
    emailFrom: source.EMAIL_FROM ?? 'noreply@quizmind.local',
    resendApiKey: source.RESEND_API_KEY,
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

  if (!Number.isInteger(env.trustProxyHops) || env.trustProxyHops < 0) {
    issues.push({
      key: 'TRUST_PROXY_HOPS',
      message: 'TRUST_PROXY_HOPS must be an integer of 0 or greater.',
    });
  }

  if (!env.jwtSecret || env.jwtSecret === 'replace-me') {
    issues.push({ key: 'JWT_SECRET', message: 'JWT_SECRET must be set to a non-placeholder value.' });
  }

  if (!env.jwtRefreshSecret || env.jwtRefreshSecret === 'replace-me-refresh') {
    issues.push({ key: 'JWT_REFRESH_SECRET', message: 'JWT_REFRESH_SECRET must be set to a non-placeholder value.' });
  }

  if (!env.extensionTokenSecret || env.extensionTokenSecret === 'replace-me-extension') {
    issues.push({
      key: 'EXTENSION_TOKEN_SECRET',
      message: 'EXTENSION_TOKEN_SECRET must be set to a non-placeholder value.',
    });
  }

  if (!env.providerCredentialSecret || env.providerCredentialSecret === 'replace-me-provider') {
    issues.push({
      key: 'PROVIDER_CREDENTIAL_SECRET',
      message: 'PROVIDER_CREDENTIAL_SECRET must be set to a non-placeholder value.',
    });
  }

  if (!Number.isInteger(env.extensionSessionTtlMinutes) || env.extensionSessionTtlMinutes < 5) {
    issues.push({
      key: 'EXTENSION_SESSION_TTL_MINUTES',
      message: 'EXTENSION_SESSION_TTL_MINUTES must be an integer of at least 5 minutes.',
    });
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

  if (isBlank(env.openRouterApiUrl)) {
    issues.push({ key: 'OPENROUTER_API_URL', message: 'OPENROUTER_API_URL must be defined.' });
  } else if (!isValidUrl(env.openRouterApiUrl)) {
    issues.push({ key: 'OPENROUTER_API_URL', message: 'OPENROUTER_API_URL must be a valid absolute URL.' });
  }

  if (!Number.isInteger(env.openRouterTimeoutMs) || env.openRouterTimeoutMs < 1_000) {
    issues.push({
      key: 'OPENROUTER_TIMEOUT_MS',
      message: 'OPENROUTER_TIMEOUT_MS must be an integer of at least 1000 milliseconds.',
    });
  }

  if (isBlank(env.routerAiApiUrl)) {
    issues.push({ key: 'ROUTERAI_API_URL', message: 'ROUTERAI_API_URL must be defined.' });
  } else if (!isValidUrl(env.routerAiApiUrl)) {
    issues.push({ key: 'ROUTERAI_API_URL', message: 'ROUTERAI_API_URL must be a valid absolute URL.' });
  }

  if (!Number.isInteger(env.routerAiTimeoutMs) || env.routerAiTimeoutMs < 1_000) {
    issues.push({
      key: 'ROUTERAI_TIMEOUT_MS',
      message: 'ROUTERAI_TIMEOUT_MS must be an integer of at least 1000 milliseconds.',
    });
  }

  if (env.platformAiProvider !== 'openrouter' && env.platformAiProvider !== 'routerai') {
    issues.push({
      key: 'PLATFORM_AI_PROVIDER',
      message: 'PLATFORM_AI_PROVIDER must be either "openrouter" or "routerai".',
    });
  }

  if (isBlank(env.polzaApiUrl)) {
    issues.push({ key: 'POLZA_API_URL', message: 'POLZA_API_URL must be defined.' });
  } else if (!isValidUrl(env.polzaApiUrl)) {
    issues.push({ key: 'POLZA_API_URL', message: 'POLZA_API_URL must be a valid absolute URL.' });
  }

  if (!Number.isInteger(env.polzaTimeoutMs) || env.polzaTimeoutMs < 1_000) {
    issues.push({
      key: 'POLZA_TIMEOUT_MS',
      message: 'POLZA_TIMEOUT_MS must be an integer of at least 1000 milliseconds.',
    });
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
    if (env.runtimeMode !== 'connected') {
      issues.push({
        key: 'QUIZMIND_RUNTIME_MODE',
        message: 'QUIZMIND_RUNTIME_MODE must be "connected" in production.',
      });
    }

    if (!isHttpsUrl(env.apiUrl)) {
      issues.push({ key: 'API_URL', message: 'API_URL must use https:// in production.' });
    }

    if (!isHttpsUrl(env.appUrl)) {
      issues.push({ key: 'APP_URL', message: 'APP_URL must use https:// in production.' });
    }

    if (!isHttpsUrl(env.jwtIssuer)) {
      issues.push({ key: 'JWT_ISSUER', message: 'JWT_ISSUER must use https:// in production.' });
    }

    if (!isHttpsUrl(env.jwtAudience)) {
      issues.push({ key: 'JWT_AUDIENCE', message: 'JWT_AUDIENCE must use https:// in production.' });
    }

    if (isLoopbackUrl(env.apiUrl)) {
      issues.push({ key: 'API_URL', message: 'API_URL must not target localhost in production.' });
    }

    if (isLoopbackUrl(env.appUrl)) {
      issues.push({ key: 'APP_URL', message: 'APP_URL must not target localhost in production.' });
    }

    if (isLoopbackUrl(env.jwtIssuer)) {
      issues.push({ key: 'JWT_ISSUER', message: 'JWT_ISSUER must not target localhost in production.' });
    }

    if (isLoopbackUrl(env.jwtAudience)) {
      issues.push({ key: 'JWT_AUDIENCE', message: 'JWT_AUDIENCE must not target localhost in production.' });
    }

    for (const origin of env.corsAllowedOrigins) {
      if (isLoopbackUrl(origin)) {
        issues.push({
          key: 'CORS_ALLOWED_ORIGINS',
          message: `CORS origin "${origin}" must not target localhost in production.`,
        });
      }

      if (!isExtensionOrigin(origin) && !isHttpsUrl(origin)) {
        issues.push({
          key: 'CORS_ALLOWED_ORIGINS',
          message: `CORS origin "${origin}" must use https:// in production.`,
        });
      }
    }

    // EMAIL_PROVIDER=noop is allowed in production for deployments where email is
    // intentionally disabled or handled externally. When resend is chosen, the key is required.
    if (env.emailProvider === 'resend' && isBlank(env.resendApiKey)) {
      issues.push({ key: 'RESEND_API_KEY', message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend.' });
    }

    // BILLING_PROVIDER=mock is not allowed in production; manual/stripe/yookassa/paddle are fine.
    if (!['stripe', 'manual', 'yookassa', 'paddle'].includes(env.billingProvider)) {
      issues.push({
        key: 'BILLING_PROVIDER',
        message: 'BILLING_PROVIDER must be set to "stripe", "manual", "yookassa", or "paddle" in production.',
      });
    }

    if (env.billingProvider === 'stripe') {
      if (isBlank(env.stripeSecretKey)) {
        issues.push({ key: 'STRIPE_SECRET_KEY', message: 'STRIPE_SECRET_KEY is required in production for Stripe.' });
      }

      if (isBlank(env.stripeWebhookSecret)) {
        issues.push({
          key: 'STRIPE_WEBHOOK_SECRET',
          message: 'STRIPE_WEBHOOK_SECRET is required in production for Stripe.',
        });
      }
    }

    if (env.billingProvider === 'yookassa') {
      if (isBlank(env.yookassaShopId)) {
        issues.push({
          key: 'YOOKASSA_SHOP_ID',
          message: 'YOOKASSA_SHOP_ID is required in production for YooKassa.',
        });
      }

      if (isBlank(env.yookassaSecretKey)) {
        issues.push({
          key: 'YOOKASSA_SECRET_KEY',
          message: 'YOOKASSA_SECRET_KEY is required in production for YooKassa.',
        });
      }
    }

    if (env.billingProvider === 'paddle') {
      if (isBlank(env.paddleApiKey)) {
        issues.push({
          key: 'PADDLE_API_KEY',
          message: 'PADDLE_API_KEY is required in production for Paddle.',
        });
      }
    }

    // Only enforce a real EMAIL_FROM when email sending is active.
    if (env.emailProvider !== 'noop' && (isBlank(env.emailFrom) || env.emailFrom === 'noreply@quizmind.local')) {
      issues.push({ key: 'EMAIL_FROM', message: 'EMAIL_FROM must be set to a real sender address in production when email is enabled.' });
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

  if (env.emailProvider === 'resend' && isBlank(env.resendApiKey)) {
    issues.push({ key: 'RESEND_API_KEY', message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend.' });
  }

  if (env.nodeEnv === 'production') {
    if (env.runtimeMode !== 'connected') {
      issues.push({
        key: 'QUIZMIND_RUNTIME_MODE',
        message: 'QUIZMIND_RUNTIME_MODE must be "connected" in production for worker queue processing.',
      });
    }

    if (isLoopbackUrl(env.apiUrl)) {
      issues.push({ key: 'API_URL', message: 'API_URL must not target localhost in production.' });
    }

    if (env.emailProvider === 'noop') {
      issues.push({
        key: 'EMAIL_PROVIDER',
        message: 'EMAIL_PROVIDER must be set to "resend" in production for worker queue delivery.',
      });
    }

    if (isBlank(env.emailFrom) || env.emailFrom === 'noreply@quizmind.local') {
      issues.push({
        key: 'EMAIL_FROM',
        message: 'EMAIL_FROM must be set to a real sender address in production for worker queue delivery.',
      });
    }
  }

  return issues;
}

export function validateWebEnv(env: WebEnv): EnvValidationIssue[] {
  const issues: EnvValidationIssue[] = [];

  if (isBlank(env.appUrl)) {
    issues.push({ key: 'APP_URL', message: 'APP_URL must be defined.' });
  } else if (!isValidUrl(env.appUrl)) {
    issues.push({ key: 'APP_URL', message: 'APP_URL must be a valid absolute URL.' });
  }

  if (isBlank(env.apiUrl)) {
    issues.push({ key: 'API_URL', message: 'API_URL must be defined.' });
  } else if (!isValidUrl(env.apiUrl)) {
    issues.push({ key: 'API_URL', message: 'API_URL must be a valid absolute URL.' });
  }

  if (isBlank(env.defaultPersona)) {
    issues.push({ key: 'DEFAULT_PERSONA', message: 'DEFAULT_PERSONA must be defined.' });
  }

  if (!isBlank(env.extensionBindCodeStoreModeRaw)) {
    const normalizedMode = env.extensionBindCodeStoreModeRaw!.toLowerCase();
    const validModes = new Set(['required', 'optional']);

    if (!validModes.has(normalizedMode)) {
      issues.push({
        key: 'QUIZMIND_EXTENSION_BIND_CODE_STORE_MODE',
        message: 'QUIZMIND_EXTENSION_BIND_CODE_STORE_MODE must be either "required" or "optional".',
      });
    }
  }

  if (!isBlank(env.extensionStrictPlatformOriginRaw)) {
    const normalizedStrictMode = env.extensionStrictPlatformOriginRaw!.toLowerCase();
    const validStrictModes = new Set(['1', '0', 'true', 'false', 'yes', 'no']);

    if (!validStrictModes.has(normalizedStrictMode)) {
      issues.push({
        key: 'QUIZMIND_EXTENSION_STRICT_PLATFORM_ORIGIN',
        message:
          'QUIZMIND_EXTENSION_STRICT_PLATFORM_ORIGIN must be one of: true, false, 1, 0, yes, no.',
      });
    }
  }

  if (env.nodeEnv === 'production') {
    if (!isHttpsUrl(env.appUrl)) {
      issues.push({ key: 'APP_URL', message: 'APP_URL must use https:// in production.' });
    }

    if (!isHttpsUrl(env.apiUrl)) {
      issues.push({ key: 'API_URL', message: 'API_URL must use https:// in production.' });
    }

    if (isLoopbackUrl(env.appUrl)) {
      issues.push({ key: 'APP_URL', message: 'APP_URL must not target localhost in production.' });
    }

    if (isLoopbackUrl(env.apiUrl)) {
      issues.push({ key: 'API_URL', message: 'API_URL must not target localhost in production.' });
    }
  }

  return issues;
}
