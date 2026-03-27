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

test('RateLimitGuard.resolveIdentity ignores spoofable forwarded headers and prefers trusted socket/request ip', () => {
  const fallback = new InMemoryRateLimitService();
  const distributed = new DistributedRateLimitService(fallback);
  const guard = new RateLimitGuard(distributed);
  const identity = (guard as any).resolveIdentity({
    headers: {
      'x-forwarded-for': '198.51.100.23',
    },
    ip: '10.0.0.7',
    socket: {
      remoteAddress: '172.16.0.8',
    },
  });

  assert.equal(identity, '10.0.0.7');
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
