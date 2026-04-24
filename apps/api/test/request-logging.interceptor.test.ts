import assert from 'node:assert/strict';
import test from 'node:test';

import { RequestLoggingInterceptor } from '../src/request-logging.interceptor';

test('RequestLoggingInterceptor samples expected production extension 401 logs compactly', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVerbose = process.env.REQUEST_LOGGING_VERBOSE;
  const originalLog = console.log;
  const logs: string[] = [];

  process.env.NODE_ENV = 'production';
  delete process.env.REQUEST_LOGGING_VERBOSE;
  console.log = (message?: unknown) => {
    logs.push(String(message));
  };

  try {
    const interceptor = new RequestLoggingInterceptor();
    const input = {
      method: 'POST',
      url: '/extension/bootstrap/v2',
      statusCode: 401,
      durationMs: 7,
      outcome: 'failure' as const,
      expectedExtensionUnauthorized: true,
      meta: {
        body: { token: 'secret-token' },
        error: {
          stackTop: 'Error: should not be logged',
          response: { message: 'large response should not be logged' },
        },
      },
    };

    (interceptor as any).logRequest(input);
    (interceptor as any).logRequest(input);
  } finally {
    console.log = originalLog;
    if (typeof previousNodeEnv === 'string') {
      process.env.NODE_ENV = previousNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (typeof previousVerbose === 'string') {
      process.env.REQUEST_LOGGING_VERBOSE = previousVerbose;
    } else {
      delete process.env.REQUEST_LOGGING_VERBOSE;
    }
  }

  assert.equal(logs.length, 1);
  const event = JSON.parse(logs[0] ?? '{}') as { metadata?: Record<string, unknown> };
  assert.equal(event.metadata?.expectedUnauthorized, true);
  assert.equal(event.metadata?.url, '/extension/bootstrap/v2');
  assert.equal('body' in (event.metadata ?? {}), false);
  assert.equal('error' in (event.metadata ?? {}), false);
  assert.equal(JSON.stringify(event).includes('stackTop'), false);
  assert.equal(JSON.stringify(event).includes('secret-token'), false);
});
