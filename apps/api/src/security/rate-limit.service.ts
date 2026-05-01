import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import IORedis from 'ioredis';
import { createThrottledErrorLogger } from '@quizmind/queue';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number, now?: number): RateLimitDecision | Promise<RateLimitDecision>;
}

const redisRateLimitScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`;

const inMemoryRateLimitPruneIntervalMs = 60_000;
const maxInMemoryRateLimitBuckets = 50_000;

function parseRedisNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

@Injectable()
export class InMemoryRateLimitService implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private lastPrunedAt = 0;

  consume(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitDecision {
    this.pruneExpiredBuckets(now);

    const existingBucket = this.buckets.get(key);
    const activeBucket =
      existingBucket && existingBucket.resetAt > now
        ? existingBucket
        : {
            count: 0,
            resetAt: now + windowMs,
          };

    activeBucket.count += 1;
    this.buckets.set(key, activeBucket);

    const remaining = Math.max(limit - activeBucket.count, 0);
    const allowed = activeBucket.count <= limit;
    const retryAfterSeconds = allowed ? 0 : Math.max(Math.ceil((activeBucket.resetAt - now) / 1000), 1);

    return {
      allowed,
      limit,
      remaining,
      retryAfterSeconds,
    };
  }

  private pruneExpiredBuckets(now: number): void {
    if (
      this.buckets.size <= maxInMemoryRateLimitBuckets &&
      now - this.lastPrunedAt < inMemoryRateLimitPruneIntervalMs
    ) {
      return;
    }

    this.lastPrunedAt = now;

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }

    while (this.buckets.size > maxInMemoryRateLimitBuckets) {
      const oldestKey = this.buckets.keys().next().value;

      if (!oldestKey) {
        return;
      }

      this.buckets.delete(oldestKey);
    }
  }
}

@Injectable()
export class DistributedRateLimitService implements RateLimitStore, OnModuleDestroy {
  private readonly env = loadApiEnv();
  private readonly redisKeyPrefix = 'quizmind:rate-limit';
  private readonly redisClient: IORedis | null;
  private readonly logRedisError = createThrottledErrorLogger({ context: 'api-rate-limit-redis', intervalMs: 30_000 });

  constructor(
    @Inject(InMemoryRateLimitService)
    private readonly fallbackStore: InMemoryRateLimitService,
  ) {
    this.redisClient =
      this.env.runtimeMode === 'connected'
        ? new IORedis(this.env.redisUrl, {
            enableReadyCheck: false,
            lazyConnect: true,
            maxRetriesPerRequest: null,
          })
        : null;

    this.redisClient?.on('error', (error) => {
      this.logRedisError(error);
    });
  }

  async consume(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitDecision> {
    if (!this.redisClient) {
      return this.fallbackStore.consume(key, limit, windowMs, now);
    }

    const bucketKey = `${this.redisKeyPrefix}:${key}`;

    try {
      if (this.redisClient.status === 'wait') {
        await this.redisClient.connect();
      }

      const evaluation = (await this.redisClient.eval(
        redisRateLimitScript,
        1,
        bucketKey,
        String(windowMs),
      )) as unknown;
      const values = Array.isArray(evaluation) ? evaluation : [];
      const count = Math.max(parseRedisNumber(values[0], 0), 0);
      const ttlMs = Math.max(parseRedisNumber(values[1], windowMs), 0);
      const remaining = Math.max(limit - count, 0);
      const allowed = count <= limit;
      const retryAfterSeconds = allowed ? 0 : Math.max(Math.ceil(ttlMs / 1000), 1);

      return {
        allowed,
        limit,
        remaining,
        retryAfterSeconds,
      };
    } catch {
      return this.fallbackStore.consume(key, limit, windowMs, now);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      await this.redisClient.quit();
    } catch {
      this.redisClient.disconnect();
    }
  }
}
