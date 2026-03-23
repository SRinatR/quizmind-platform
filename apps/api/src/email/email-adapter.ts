import { type ApiEnv } from '@quizmind/config';
import { createNoopEmailAdapter, createResendEmailAdapter, type EmailAdapter } from '@quizmind/email';

export function createApiEmailAdapter(env: ApiEnv): EmailAdapter {
  if (env.emailProvider === 'resend') {
    if (!env.resendApiKey) {
      throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY.');
    }

    return createResendEmailAdapter({
      apiKey: env.resendApiKey,
      from: env.emailFrom,
    });
  }

  return createNoopEmailAdapter();
}
