import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { createLogEvent } from '@quizmind/logger';
import { tap } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<{ method?: string; url?: string }>();
    const response = httpContext.getResponse<{ statusCode?: number }>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logRequest({
            method: request.method ?? 'UNKNOWN',
            url: request.url ?? '/',
            statusCode: response.statusCode ?? 200,
            durationMs: Date.now() - startedAt,
            outcome: 'success',
          });
        },
        error: () => {
          this.logRequest({
            method: request.method ?? 'UNKNOWN',
            url: request.url ?? '/',
            statusCode: response.statusCode ?? 500,
            durationMs: Date.now() - startedAt,
            outcome: 'failure',
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
  }) {
    const event = createLogEvent({
      eventId: `http:${input.method}:${input.url}:${Date.now()}`,
      eventType: 'http.request',
      actorId: 'api',
      actorType: 'system',
      targetType: 'http_request',
      targetId: `${input.method} ${input.url}`,
      occurredAt: new Date().toISOString(),
      category: 'system',
      severity: input.statusCode >= 500 ? 'error' : input.statusCode >= 400 ? 'warn' : 'info',
      status: input.outcome,
      metadata: {
        durationMs: input.durationMs,
        method: input.method,
        statusCode: input.statusCode,
        url: input.url,
      },
    });

    console.log(JSON.stringify(event));
  }
}
