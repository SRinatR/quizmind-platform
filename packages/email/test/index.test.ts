import assert from 'node:assert/strict';
import test from 'node:test';

import { createResendEmailAdapter, verifyEmailTemplate } from '../src';

test('createResendEmailAdapter posts rendered emails to Resend and returns the message id', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestInit: RequestInit | undefined;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;

    return new Response(JSON.stringify({ id: 'email_123' }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });
  };

  try {
    const adapter = createResendEmailAdapter({
      apiKey: 'resend_test_key',
      from: 'noreply@quizmind.dev',
    });
    const receipt = await adapter.send(
      verifyEmailTemplate.render({
        productName: 'QuizMind',
        displayName: 'User',
        verifyUrl: 'https://app.quizmind.dev/auth/verify?token=abc',
        supportEmail: 'support@quizmind.dev',
      }),
      'user@quizmind.dev',
    );

    assert.equal(requestUrl, 'https://api.resend.com/emails');
    assert.equal((requestInit?.headers as Record<string, string>).authorization, 'Bearer resend_test_key');
    assert.match(String(requestInit?.body), /noreply@quizmind\.dev/);
    assert.match(String(requestInit?.body), /user@quizmind\.dev/);
    assert.equal(receipt.provider, 'resend');
    assert.equal(receipt.messageId, 'email_123');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
