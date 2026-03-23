import { Injectable } from '@nestjs/common';

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

@Injectable()
export class InMemoryRateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();

  consume(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitDecision {
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
}
