import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';

import { DistributedRateLimitService } from './rate-limit.service';

interface RateLimitedRequest {
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

const extensionAuthRuntimeWindowMs = 60_000;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(DistributedRateLimitService)
    private readonly rateLimitService: DistributedRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    const decision = await this.rateLimitService.consume(
      `${policy.key}:${identity}`,
      policy.maxRequests,
      policy.windowMs,
    );

    response.setHeader?.('X-RateLimit-Limit', String(decision.limit));
    response.setHeader?.('X-RateLimit-Remaining', String(decision.remaining));

    if (!decision.allowed) {
      response.setHeader?.('Retry-After', String(decision.retryAfterSeconds));
      throw new HttpException('Too many requests.', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private resolvePolicy(method: string, path: string): RateLimitPolicy | null {
    if (path === '/health' || path === '/ready') {
      return null;
    }

    if (
      path.startsWith('/auth/login') ||
      path.startsWith('/auth/register') ||
      path.startsWith('/auth/refresh') ||
      path.startsWith('/auth/forgot-password') ||
      path.startsWith('/auth/reset-password')
    ) {
      return {
        key: `auth:${method}:${path}`,
        maxRequests: this.env.authRateLimitMaxRequests,
        windowMs: this.env.authRateLimitWindowMs,
      };
    }

    if (
      path === '/extension/bootstrap/v2' ||
      path === '/extension/session/refresh' ||
      path === '/extension/installations/session/refresh'
    ) {
      return {
        key: `extension-auth:${method}:${path}`,
        maxRequests: 30,
        windowMs: extensionAuthRuntimeWindowMs,
      };
    }

    if (path === '/extension/ai/models') {
      return {
        key: `extension-runtime:${method}:${path}`,
        maxRequests: 30,
        windowMs: extensionAuthRuntimeWindowMs,
      };
    }

    if (path === '/extension/usage-events/v2' || path.startsWith('/extension/ai/')) {
      return {
        key: `extension-runtime:${method}:${path}`,
        maxRequests: 60,
        windowMs: extensionAuthRuntimeWindowMs,
      };
    }

    return {
      key: `api:${method}:${path}`,
      maxRequests: this.env.rateLimitMaxRequests,
      windowMs: this.env.rateLimitWindowMs,
    };
  }

  private resolveIdentity(request: RateLimitedRequest): string {
    const requestIp = request.ip?.trim();
    const remoteIp = request.socket?.remoteAddress?.trim();

    return requestIp || remoteIp || 'anonymous';
  }
}
