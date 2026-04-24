import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { createLogEvent } from '@quizmind/logger';
import { tap } from 'rxjs';
import { http5xxTotal, httpRequestDurationSeconds, httpRequestsTotal, normalizeRoute, statusClass } from './metrics';

const expectedExtensionUnauthorizedLogWindowMs = 10 * 60 * 1000;
const maxExpectedExtensionUnauthorizedLogKeys = 1_000;

interface ExpectedExtensionUnauthorizedLogState {
  nextLogAt: number;
  suppressed: number;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly isProduction = process.env.NODE_ENV === 'production';
  private readonly verboseLogging =
    process.env.REQUEST_LOGGING_VERBOSE === '1' || !this.isProduction;
  private readonly expectedExtensionUnauthorizedLogState = new Map<string, ExpectedExtensionUnauthorizedLogState>();

  intercept(context: ExecutionContext, next: CallHandler) {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Record<string, unknown>>();
    const response = httpContext.getResponse<{ statusCode?: number }>();
    const startedAt = Date.now();
    const requestMeta = this.buildRequestMeta(request);

    return next.handle().pipe(
      tap({
        next: () => {
          this.logRequest({
            method: this.safeString(request.method, 'UNKNOWN'),
            url: this.safeString(request.url, '/'),
            statusCode: response.statusCode ?? 200,
            durationMs: Date.now() - startedAt,
            outcome: 'success',
            meta: requestMeta,
          });
        },
        error: (error: unknown) => {
          const method = this.safeString(request.method, 'UNKNOWN');
          const url = this.safeString(request.url, '/');
          const fallbackStatusCode = response.statusCode ?? 500;
          const exceptionStatusCode =
            typeof (error as { getStatus?: () => unknown })?.getStatus === 'function'
              ? Number((error as { getStatus: () => unknown }).getStatus())
              : Number.NaN;
          const statusCode = Number.isFinite(exceptionStatusCode)
            ? Math.trunc(exceptionStatusCode)
            : fallbackStatusCode;
          const expectedExtensionUnauthorized = this.isExpectedExtensionUnauthorized(url, statusCode);

          this.logRequest({
            method,
            url,
            statusCode,
            durationMs: Date.now() - startedAt,
            outcome: 'failure',
            expectedExtensionUnauthorized,
            meta: expectedExtensionUnauthorized
              ? {}
              : {
                  ...requestMeta,
                  error: this.buildErrorMeta(error),
                },
          });
        },
      }),
    );
  }

  private logRequest(input: {
    method: string;
    url: string;
    statusCode: number;
    durationMs: number;
    outcome: 'success' | 'failure';
    meta?: Record<string, unknown>;
    expectedExtensionUnauthorized?: boolean;
  }) {
    // Record Prometheus metrics (skip the /metrics endpoint itself)
    let route = normalizeRoute(input.url);
    if (input.url !== '/metrics') {
      const sc = statusClass(input.statusCode);
      httpRequestsTotal.inc({ method: input.method, route, status_class: sc });
      httpRequestDurationSeconds.observe({ method: input.method, route }, input.durationMs / 1000);
      if (input.statusCode >= 500) {
        http5xxTotal.inc({ method: input.method, route });
      }
    }

    const compactExtension401 = input.expectedExtensionUnauthorized
      ? this.consumeExpectedExtensionUnauthorizedLogWindow(input.method, input.url)
      : null;

    if (compactExtension401 && !compactExtension401.shouldLog) {
      return;
    }

    const logUrl = compactExtension401?.endpoint ?? input.url;
    const metadata = compactExtension401
      ? {
          durationMs: input.durationMs,
          method: input.method,
          route,
          statusCode: input.statusCode,
          url: logUrl,
          expectedUnauthorized: true,
          suppressedSimilarRequests: compactExtension401.suppressed,
          sampleWindowSeconds: expectedExtensionUnauthorizedLogWindowMs / 1000,
        }
      : {
          durationMs: input.durationMs,
          method: input.method,
          statusCode: input.statusCode,
          url: input.url,
          ...(input.meta || {}),
        };

    const event = createLogEvent({
      eventId: `http:${input.method}:${logUrl}:${Date.now()}`,
      eventType: 'http.request',
      actorId: 'api',
      actorType: 'system',
      targetType: 'http_request',
      targetId: `${input.method} ${logUrl}`,
      occurredAt: new Date().toISOString(),
      category: 'system',
      severity: input.statusCode >= 500 ? 'error' : input.statusCode >= 400 ? 'warn' : 'info',
      status: input.outcome,
      metadata,
    });

    console.log(JSON.stringify(event));
  }

  private isExpectedExtensionUnauthorized(url: string, statusCode: number): boolean {
    return this.isProduction && statusCode === 401 && this.classifyExpectedExtensionEndpoint(url) !== null;
  }

  private classifyExpectedExtensionEndpoint(url: string): string | null {
    const path = (url || '/').split('?', 1)[0]?.split('#', 1)[0] || '/';

    if (
      path === '/extension/bootstrap/v2' ||
      path === '/extension/session/refresh' ||
      path === '/extension/installations/session/refresh' ||
      path === '/extension/usage-events/v2' ||
      path === '/extension/ai/models'
    ) {
      return path;
    }

    if (path.startsWith('/extension/ai/')) {
      return '/extension/ai/*';
    }

    return null;
  }

  private consumeExpectedExtensionUnauthorizedLogWindow(
    method: string,
    url: string,
  ): { shouldLog: boolean; endpoint: string; suppressed: number } {
    const now = Date.now();
    const endpoint = this.classifyExpectedExtensionEndpoint(url) ?? normalizeRoute(url);
    const key = `${method}:${endpoint}`;
    const state = this.expectedExtensionUnauthorizedLogState.get(key);

    if (state && state.nextLogAt > now) {
      state.suppressed += 1;
      return { shouldLog: false, endpoint, suppressed: 0 };
    }

    const suppressed = state?.suppressed ?? 0;
    this.expectedExtensionUnauthorizedLogState.set(key, {
      nextLogAt: now + expectedExtensionUnauthorizedLogWindowMs,
      suppressed: 0,
    });
    this.pruneExpectedExtensionUnauthorizedLogState(now);

    return { shouldLog: true, endpoint, suppressed };
  }

  private pruneExpectedExtensionUnauthorizedLogState(now: number): void {
    if (this.expectedExtensionUnauthorizedLogState.size <= maxExpectedExtensionUnauthorizedLogKeys) {
      return;
    }

    for (const [key, state] of this.expectedExtensionUnauthorizedLogState.entries()) {
      if (state.nextLogAt <= now) {
        this.expectedExtensionUnauthorizedLogState.delete(key);
      }
    }

    while (this.expectedExtensionUnauthorizedLogState.size > maxExpectedExtensionUnauthorizedLogKeys) {
      const oldestKey = this.expectedExtensionUnauthorizedLogState.keys().next().value;

      if (!oldestKey) {
        return;
      }

      this.expectedExtensionUnauthorizedLogState.delete(oldestKey);
    }
  }

  private buildRequestMeta(request: Record<string, unknown>): Record<string, unknown> {
    if (!this.verboseLogging) return {};

    const headers = (request.headers as Record<string, unknown>) || {};
    const query = (request.query as Record<string, unknown>) || {};
    const params = (request.params as Record<string, unknown>) || {};

    return {
      ipAddress: this.safeString(request.ip, ''),
      origin: this.safeString(headers.origin, ''),
      referer: this.safeString(headers.referer, ''),
      userAgent: this.safeString(headers['user-agent'], ''),
      requestId: this.safeString(headers['x-request-id'], ''),
      query: this.sanitizeValue(query),
      params: this.sanitizeValue(params),
      body: this.sanitizeValue(request.body),
    };
  }

  private buildErrorMeta(error: unknown): Record<string, unknown> {
    if (!error || typeof error !== 'object') {
      return { message: String(error || 'Unknown error') };
    }

    const err = error as {
      name?: unknown;
      message?: unknown;
      stack?: unknown;
      response?: unknown;
    };

    return {
      name: this.safeString(err.name, 'Error'),
      message: this.safeString(err.message, 'Unknown error'),
      stackTop: this.safeString(err.stack, '').split('\n').slice(0, 2).join(' | '),
      response: this.sanitizeValue(err.response),
    };
  }

  private sanitizeValue(value: unknown, depth = 0, parentKey = ''): unknown {
    if (value == null) return value;
    if (depth > 3) return '[max-depth]';

    if (this.isSensitiveKey(parentKey)) return '[REDACTED]';

    if (typeof value === 'string') {
      return value.length > 240 ? `${value.slice(0, 240)}...[${value.length} chars]` : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') return value;

    if (Array.isArray(value)) {
      return {
        type: 'array',
        length: value.length,
        sample: value.slice(0, 5).map((entry) => this.sanitizeValue(entry, depth + 1, parentKey)),
      };
    }

    if (typeof value === 'object') {
      const input = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(input).slice(0, 30)) {
        out[key] = this.sanitizeValue(entry, depth + 1, key);
      }
      return out;
    }

    return String(value);
  }

  private isSensitiveKey(key: string): boolean {
    return /(token|secret|password|api[-_]?key|authorization|cookie)/i.test(String(key || ''));
  }

  private safeString(value: unknown, fallback: string): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
  }
}
