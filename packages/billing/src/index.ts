import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifyStripeWebhookSignatureInput {
  payload: Buffer | string;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
  now?: Date;
}

function toUtf8String(value: Buffer | string): string {
  return typeof value === 'string' ? value : value.toString('utf8');
}

function normalizeDigest(value: string): Buffer {
  return Buffer.from(value, 'hex');
}

export function signStripeWebhookPayload(payload: Buffer | string, secret: string, timestamp: number | string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${toUtf8String(payload)}`).digest('hex');
}

export function verifyStripeWebhookSignature(input: VerifyStripeWebhookSignatureInput): { timestamp: number } {
  const components = input.signatureHeader.split(',').map((part) => part.trim()).filter(Boolean);
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const component of components) {
    const [key, value] = component.split('=', 2);

    if (!key || !value) {
      continue;
    }

    if (key === 't') {
      const parsedTimestamp = Number(value);

      if (Number.isFinite(parsedTimestamp)) {
        timestamp = parsedTimestamp;
      }

      continue;
    }

    if (key === 'v1') {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid Stripe signature header.');
  }

  const expectedSignature = normalizeDigest(signStripeWebhookPayload(input.payload, input.secret, timestamp));
  const now = input.now ?? new Date();
  const toleranceSeconds = input.toleranceSeconds ?? 300;
  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - timestamp);

  if (ageSeconds > toleranceSeconds) {
    throw new Error('Stripe signature timestamp is outside the allowed tolerance.');
  }

  const matches = signatures.some((signature) => {
    const providedSignature = normalizeDigest(signature);

    return providedSignature.length === expectedSignature.length && timingSafeEqual(providedSignature, expectedSignature);
  });

  if (!matches) {
    throw new Error('Invalid Stripe signature.');
  }

  return { timestamp };
}
