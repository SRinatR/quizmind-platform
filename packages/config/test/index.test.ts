import assert from 'node:assert/strict';
import test from 'node:test';

import { loadApiEnv, loadWebEnv, loadWorkerEnv, validateApiEnv, validateWebEnv, validateWorkerEnv } from '../src';

test('loadApiEnv derives strict CORS and JWT defaults from app and api URLs', () => {
  const env = loadApiEnv({
    NODE_ENV: 'development',
    QUIZMIND_RUNTIME_MODE: 'connected',
    APP_URL: 'https://app.quizmind.dev',
    API_URL: 'https://api.quizmind.dev',
    JWT_SECRET: 'super-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
  });

  assert.deepEqual(env.corsAllowedOrigins, ['https://app.quizmind.dev']);
  assert.equal(env.jwtIssuer, 'https://api.quizmind.dev');
  assert.equal(env.jwtAudience, 'https://app.quizmind.dev');
  assert.equal(env.trustProxyHops, 0);
});

test('validateApiEnv rejects wildcard CORS and prod placeholder providers', () => {
  const env = loadApiEnv({
    NODE_ENV: 'production',
    QUIZMIND_RUNTIME_MODE: 'connected',
    APP_URL: 'https://app.quizmind.dev',
    API_URL: 'https://api.quizmind.dev',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/quizmind',
    REDIS_URL: 'redis://localhost:6379',
    CORS_ALLOWED_ORIGINS: '*',
    JWT_SECRET: 'super-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    EMAIL_FROM: 'noreply@quizmind.dev',
  });

  const issues = validateApiEnv(env);

  assert.ok(issues.some((issue) => issue.key === 'CORS_ALLOWED_ORIGINS'));
  assert.ok(issues.some((issue) => issue.key === 'EMAIL_PROVIDER'));
  assert.ok(issues.some((issue) => issue.key === 'BILLING_PROVIDER'));
});

test('validateApiEnv rejects negative trust proxy hops', () => {
  const env = loadApiEnv({
    NODE_ENV: 'development',
    QUIZMIND_RUNTIME_MODE: 'connected',
    APP_URL: 'https://app.quizmind.dev',
    API_URL: 'https://api.quizmind.dev',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/quizmind',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'super-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    TRUST_PROXY_HOPS: '-1',
  });

  const issues = validateApiEnv(env);

  assert.ok(issues.some((issue) => issue.key === 'TRUST_PROXY_HOPS'));
});

test('validateWorkerEnv enforces email provider settings for production queue delivery', () => {
  const env = loadWorkerEnv({
    NODE_ENV: 'production',
    QUIZMIND_RUNTIME_MODE: 'connected',
    API_URL: 'https://api.quizmind.dev',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/quizmind',
    REDIS_URL: 'redis://localhost:6379',
    EMAIL_PROVIDER: 'noop',
    EMAIL_FROM: 'noreply@quizmind.local',
  });

  const issues = validateWorkerEnv(env);

  assert.ok(issues.some((issue) => issue.key === 'EMAIL_PROVIDER'));
  assert.ok(issues.some((issue) => issue.key === 'EMAIL_FROM'));
});

test('validateApiEnv rejects insecure production URL and runtime settings', () => {
  const env = loadApiEnv({
    NODE_ENV: 'production',
    QUIZMIND_RUNTIME_MODE: 'mock',
    APP_URL: 'http://localhost:3000',
    API_URL: 'http://127.0.0.1:4000',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    JWT_ISSUER: 'http://localhost:4000',
    JWT_AUDIENCE: 'http://localhost:3000',
    JWT_SECRET: 'super-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    EXTENSION_TOKEN_SECRET: 'extension-secret',
    PROVIDER_CREDENTIAL_SECRET: 'provider-secret',
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 'resend-key',
    BILLING_PROVIDER: 'manual',
    EMAIL_FROM: 'noreply@quizmind.dev',
  });

  const issues = validateApiEnv(env);

  assert.ok(issues.some((issue) => issue.key === 'QUIZMIND_RUNTIME_MODE'));
  assert.ok(issues.some((issue) => issue.key === 'API_URL' && issue.message.includes('https://')));
  assert.ok(issues.some((issue) => issue.key === 'APP_URL' && issue.message.includes('https://')));
  assert.ok(issues.some((issue) => issue.key === 'JWT_ISSUER' && issue.message.includes('https://')));
  assert.ok(issues.some((issue) => issue.key === 'JWT_AUDIENCE' && issue.message.includes('https://')));
  assert.ok(issues.some((issue) => issue.key === 'CORS_ALLOWED_ORIGINS' && issue.message.includes('https://')));
  assert.ok(issues.some((issue) => issue.key === 'API_URL' && issue.message.includes('localhost')));
  assert.ok(issues.some((issue) => issue.key === 'APP_URL' && issue.message.includes('localhost')));
});

test('validateWebEnv rejects insecure production URLs', () => {
  const env = loadWebEnv({
    NODE_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4000',
    DEFAULT_PERSONA: 'platform-admin',
  });

  const issues = validateWebEnv(env);

  assert.ok(issues.some((issue) => issue.key === 'APP_URL' && issue.message.includes('https://')));
  assert.ok(issues.some((issue) => issue.key === 'API_URL' && issue.message.includes('https://')));
  assert.ok(issues.some((issue) => issue.key === 'APP_URL' && issue.message.includes('localhost')));
  assert.ok(issues.some((issue) => issue.key === 'API_URL' && issue.message.includes('localhost')));
});

test('validateWebEnv accepts secure production URLs', () => {
  const env = loadWebEnv({
    NODE_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'https://app.quizmind.dev',
    NEXT_PUBLIC_API_URL: 'https://api.quizmind.dev',
    DEFAULT_PERSONA: 'platform-admin',
  });

  const issues = validateWebEnv(env);

  assert.equal(issues.length, 0);
});
