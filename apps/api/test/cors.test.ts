import assert from 'node:assert/strict';
import test from 'node:test';

import { type ApiEnv } from '@quizmind/config';

import { buildCorsOptions } from '../src/security/cors';

function createApiEnv(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return {
    nodeEnv: 'development',
    appUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:4000',
    databaseUrl: 'postgresql://postgres:postgres@localhost:5432/quizmind',
    redisUrl: 'redis://localhost:6379',
    runtimeMode: 'connected',
    port: 4000,
    trustProxyHops: 0,
    corsAllowedOrigins: ['http://localhost:3000'],
    jwtSecret: 'jwt-secret',
    jwtRefreshSecret: 'refresh-secret',
    extensionTokenSecret: 'extension-secret',
    extensionSessionTtlMinutes: 30,
    providerCredentialSecret: 'provider-secret',
    jwtIssuer: 'http://localhost:4000',
    jwtAudience: 'http://localhost:3000',
    emailProvider: 'noop',
    emailFrom: 'noreply@quizmind.local',
    billingProvider: 'manual',
    openRouterApiUrl: 'https://openrouter.ai/api/v1',
    openRouterApiKey: undefined,
    openRouterAppName: 'QuizMind Platform',
    openRouterTimeoutMs: 45000,
    polzaApiUrl: 'https://api.polza.ai/v1',
    polzaApiKey: undefined,
    polzaTimeoutMs: 45000,
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 120,
    authRateLimitWindowMs: 900000,
    authRateLimitMaxRequests: 10,
    ...overrides,
  };
}

function evaluateOrigin(
  env: ApiEnv,
  origin: string | undefined,
): Promise<{ error: Error | null; allow: boolean | undefined }> {
  const options = buildCorsOptions(env);

  return new Promise((resolve) => {
    options.origin(origin, (error, allow) => {
      resolve({ error, allow });
    });
  });
}

test('buildCorsOptions allows extension origins in development mode', async () => {
  const result = await evaluateOrigin(
    createApiEnv({ nodeEnv: 'development' }),
    'chrome-extension://ohglblaobifcglkcijfmmhgpkeknfmai',
  );

  assert.equal(result.error, null);
  assert.equal(result.allow, true);
});

test('buildCorsOptions allows extension origins for local API even when NODE_ENV=production', async () => {
  const result = await evaluateOrigin(
    createApiEnv({
      nodeEnv: 'production',
      apiUrl: 'http://localhost:4000',
    }),
    'chrome-extension://ohglblaobifcglkcijfmmhgpkeknfmai',
  );

  assert.equal(result.error, null);
  assert.equal(result.allow, true);
});

test('buildCorsOptions allows any extension origin in production for non-loopback API', async () => {
  const origin = 'chrome-extension://ohglblaobifcglkcijfmmhgpkeknfmai';
  const result = await evaluateOrigin(
    createApiEnv({
      nodeEnv: 'production',
      apiUrl: 'https://api.quizmind.app',
      corsAllowedOrigins: ['https://quizmind.app'],
    }),
    origin,
  );

  assert.equal(result.error, null);
  assert.equal(result.allow, true);
});

test('buildCorsOptions allows explicitly configured extension origins in production', async () => {
  const origin = 'chrome-extension://ohglblaobifcglkcijfmmhgpkeknfmai';
  const result = await evaluateOrigin(
    createApiEnv({
      nodeEnv: 'production',
      apiUrl: 'https://api.quizmind.app',
      corsAllowedOrigins: ['https://quizmind.app', origin],
    }),
    origin,
  );

  assert.equal(result.error, null);
  assert.equal(result.allow, true);
});

test('buildCorsOptions allows the deployed extension ID in production with real API URL', async () => {
  // Regression test: chrome-extension://miccididebbhdkfbjaebbkaainbgpmkg must be allowed
  // when ALLOWED_EXTENSION_ORIGINS is set and the API is on a non-loopback production URL.
  const extensionOrigin = 'chrome-extension://miccididebbhdkfbjaebbkaainbgpmkg';
  const result = await evaluateOrigin(
    createApiEnv({
      nodeEnv: 'production',
      apiUrl: 'https://ods.uz/api',
      corsAllowedOrigins: ['https://ods.uz', extensionOrigin],
    }),
    extensionOrigin,
  );

  assert.equal(result.error, null);
  assert.equal(result.allow, true);
});

test('buildCorsOptions allows any extension ID in production with real API URL', async () => {
  const allowedExtension = 'chrome-extension://miccididebbhdkfbjaebbkaainbgpmkg';
  const otherExtension = 'chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh';
  const result = await evaluateOrigin(
    createApiEnv({
      nodeEnv: 'production',
      apiUrl: 'https://ods.uz/api',
      corsAllowedOrigins: ['https://ods.uz', allowedExtension],
    }),
    otherExtension,
  );

  assert.equal(result.error, null);
  assert.equal(result.allow, true);
});

test('buildCorsOptions allows moz-extension origin not in allowlist in production', async () => {
  const result = await evaluateOrigin(
    createApiEnv({
      nodeEnv: 'production',
      apiUrl: 'https://ods.uz/api',
      corsAllowedOrigins: ['https://ods.uz'],
    }),
    'moz-extension://someunknownid',
  );

  assert.equal(result.error, null);
  assert.equal(result.allow, true);
});
