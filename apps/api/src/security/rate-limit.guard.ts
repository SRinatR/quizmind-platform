import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';

import { InMemoryRateLimitService } from './rate-limit.service';

interface RateLimitedRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  method?: string;
  originalUrl?: string;
  socket?: {
    remoteAddress?: string;
  };
  url?: string;
}

interface RateLimitedResponse {
  setHeader?: (name: string, value: string) => void;
}

interface RateLimitPolicy {
  key: string;
  maxRequests: number;
  windowMs: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly env = loadApiEnv();

  constructor(private readonly rateLimitService: InMemoryRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const response = context.switchToHttp().getResponse<RateLimitedResponse>();

    if (!request || request.method === 'OPTIONS') {
      return true;
    }

    const method = request.method ?? 'GET';
    const path = (request.originalUrl ?? request.url ?? '/').split('?', 1)[0] ?? '/';
    const policy = this.resolvePolicy(method, path);

    if (!policy) {
      return true;
    }

    const identity = this.resolveIdentity(request);
    const decision = this.rateLimitService.consume(`${policy.key}:${identity}`, policy.maxRequests, policy.windowMs);

    response.setHeader?.('X-RateLimit-Limit', String(decision.limit));
    response.setHeader?.('X-RateLimit-Remaining', String(decision.remaining));

    if (!decision.allowed) {
      response.setHeader?.('Retry-After', String(decision.retryAfterSeconds));
      throw new HttpException('Too many requests.', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private resolvePolicy(method: string, path: string): RateLimitPolicy | null {
    if (path === '/health') {
      return null;
    }

    if (path.startsWith('/auth/login') || path.startsWith('/auth/register') || path.startsWith('/auth/refresh')) {
      return {
        key: `auth:${method}:${path}`,
        maxRequests: this.env.authRateLimitMaxRequests,
        windowMs: this.env.authRateLimitWindowMs,
      };
    }

    return {
      key: `api:${method}:${path}`,
      maxRequests: this.env.rateLimitMaxRequests,
      windowMs: this.env.rateLimitWindowMs,
    };
  }

  private resolveIdentity(request: RateLimitedRequest): string {
    const forwardedFor = request.headers?.['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const forwardedIp = forwardedValue?.split(',', 1)[0]?.trim();

    return forwardedIp || request.ip || request.socket?.remoteAddress || 'anonymous';
  }
}
