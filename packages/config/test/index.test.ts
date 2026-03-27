import assert from 'node:assert/strict';
import test from 'node:test';

import { loadApiEnv, loadWorkerEnv, validateApiEnv, validateWorkerEnv } from '../src';

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
