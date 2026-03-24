import assert from 'node:assert/strict';
import test from 'node:test';

import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { RateLimitGuard } from '../src/security/rate-limit.guard';
import { InMemoryRateLimitService } from '../src/security/rate-limit.service';

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
    providers: [RateLimitGuard, InMemoryRateLimitService],
  })
  class TestModule {}

  const app = await NestFactory.createApplicationContext(TestModule, {
    logger: false,
  });

  try {
    const guard = app.get(RateLimitGuard);
    const service = app.get(InMemoryRateLimitService);

    assert.ok(guard);
    assert.ok(service);
    assert.equal((guard as any).rateLimitService, service);
  } finally {
    await app.close();
  }
});
