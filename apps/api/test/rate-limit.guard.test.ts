import assert from 'node:assert/strict';
import test from 'node:test';

import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { RateLimitGuard } from '../src/security/rate-limit.guard';
import { DistributedRateLimitService, InMemoryRateLimitService } from '../src/security/rate-limit.service';

test('InMemoryRateLimitService blocks requests after the configured limit until the window resets', () => {
  const service = new InMemoryRateLimitService();
  const first = service.consume('auth:127.0.0.1', 2, 1_000, 1_000);
  const second = service.consume('auth:127.0.0.1', 2, 1_000, 1_100);
  const third = service.consume('auth:127.0.0.1', 2, 1_000, 1_200);
  const reset = service.consume('auth:127.0.0.1', 2, 1_000, 2_100);

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.equal(third.retryAfterSeconds, 1);
  assert.equal(reset.allowed, true);
  assert.equal(reset.remaining, 1);
});

test('InMemoryRateLimitService prunes expired buckets during later consumes', () => {
  const service = new InMemoryRateLimitService();
  service.consume('extension:stale:127.0.0.1', 1, 1_000, 1_000);
  service.consume('extension:fresh:127.0.0.1', 1, 1_000, 62_000);

  assert.equal((service as any).buckets.has('extension:stale:127.0.0.1'), false);
  assert.equal((service as any).buckets.has('extension:fresh:127.0.0.1'), true);
});

test('RateLimitGuard resolves its rate limit service through Nest DI', async () => {
  @Module({
    providers: [RateLimitGuard, InMemoryRateLimitService, DistributedRateLimitService],
  })
  class TestModule {}

  const app = await NestFactory.createApplicationContext(TestModule, {
    logger: false,
  });

  try {
    const guard = app.get(RateLimitGuard);
    const service = app.get(DistributedRateLimitService);

    assert.ok(guard);
    assert.ok(service);
    assert.equal((guard as any).rateLimitService, service);
  } finally {
    await app.close();
  }
});

test('DistributedRateLimitService uses in-memory fallback in mock runtime mode', async () => {
  const fallback = new InMemoryRateLimitService();
  const service = new DistributedRateLimitService(fallback);
  const first = await service.consume('api:GET:/workspaces:127.0.0.1', 2, 1_000, 1_000);
  const second = await service.consume('api:GET:/workspaces:127.0.0.1', 2, 1_000, 1_100);
  const third = await service.consume('api:GET:/workspaces:127.0.0.1', 2, 1_000, 1_200);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
});

test('RateLimitGuard.resolveIdentity uses first x-forwarded-for entry when client IP is first', () => {
  const fallback = new InMemoryRateLimitService();
  const distributed = new DistributedRateLimitService(fallback);
  const guard = new RateLimitGuard(distributed);
  const identity = (guard as any).resolveIdentity({
    headers: {
      'x-forwarded-for': '188.130.155.182, 172.19.0.6',
      'x-real-ip': '172.19.0.6',
    },
    ip: '172.19.0.6',
    socket: {
      remoteAddress: '172.16.0.8',
    },
  });

  assert.equal(identity, '188.130.155.182');
});

test('RateLimitGuard.resolveIdentity keeps first forwarded hop even if later hop is public', () => {
  const fallback = new InMemoryRateLimitService();
  const distributed = new DistributedRateLimitService(fallback);
  const guard = new RateLimitGuard(distributed);
  const identity = (guard as any).resolveIdentity({
    headers: {
      'x-forwarded-for': '172.19.0.6, 198.51.100.23',
    },
    ip: '172.19.0.6',
    socket: {
      remoteAddress: '172.16.0.8',
    },
  });

  assert.equal(identity, '172.19.0.6');
});

test('RateLimitGuard.resolveIdentity falls back to x-real-ip when x-forwarded-for is missing', () => {
  const fallback = new InMemoryRateLimitService();
  const distributed = new DistributedRateLimitService(fallback);
  const guard = new RateLimitGuard(distributed);
  const identity = (guard as any).resolveIdentity({
    headers: {
      'x-real-ip': '203.0.113.12',
    },
    ip: '172.19.0.6',
    socket: {
      remoteAddress: '172.16.0.8',
    },
  });

  assert.equal(identity, '203.0.113.12');
});

test('RateLimitGuard.resolvePolicy excludes health and readiness probes from throttling', () => {
  const fallback = new InMemoryRateLimitService();
  const distributed = new DistributedRateLimitService(fallback);
  const guard = new RateLimitGuard(distributed);
  const healthPolicy = (guard as any).resolvePolicy('GET', '/health');
  const readyPolicy = (guard as any).resolvePolicy('GET', '/ready');
  const authPolicy = (guard as any).resolvePolicy('POST', '/auth/login');

  assert.equal(healthPolicy, null);
  assert.equal(readyPolicy, null);
  assert.equal(authPolicy?.key?.startsWith('auth:POST:/auth/login'), true);
});

test('RateLimitGuard.resolvePolicy applies stricter buckets to extension runtime auth endpoints', () => {
  const fallback = new InMemoryRateLimitService();
  const distributed = new DistributedRateLimitService(fallback);
  const guard = new RateLimitGuard(distributed);
  const refreshPolicy = (guard as any).resolvePolicy('POST', '/extension/session/refresh');
  const usagePolicy = (guard as any).resolvePolicy('POST', '/extension/usage-events/v2');
  const aiPolicy = (guard as any).resolvePolicy('POST', '/extension/ai/answer');

  assert.equal(refreshPolicy?.key, 'extension-auth:POST:/extension/session/refresh');
  assert.equal(refreshPolicy?.maxRequests, 30);
  assert.equal(usagePolicy?.key, 'extension-runtime:POST:/extension/usage-events/v2');
  assert.equal(usagePolicy?.maxRequests, 60);
  assert.equal(aiPolicy?.key, 'extension-runtime:POST:/extension/ai/answer');
  assert.equal(aiPolicy?.maxRequests, 60);
});
