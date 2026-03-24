function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readDateFromUnixSeconds(value: unknown): Date | undefined {
  const timestamp = readNumber(value);

  return typeof timestamp === 'number' ? new Date(timestamp * 1000) : undefined;
}

function appendMetadata(params: URLSearchParams, prefix: string, metadata?: Record<string, string>): void {
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (value.trim().length > 0) {
      params.append(`${prefix}[${key}]`, value);
    }
  }
}

async function parseStripeJsonResponse<T extends Record<string, unknown>>(
  response: Response,
  path: string,
): Promise<T> {
  const rawBody = await response.text();
  let payload: unknown = {};

  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new Error(`Stripe API ${path} returned a non-JSON response.`);
    }
  }

  if (!response.ok) {
    const errorPayload = payload as {
      error?: {
        message?: unknown;
      };
    };
    const message =
      typeof errorPayload.error?.message === 'string'
        ? errorPayload.error.message
        : `Stripe API ${path} failed with status ${response.status}.`;

    throw new Error(message);
  }

  return payload as T;
}

async function postStripeForm<T extends Record<string, unknown>>(
  path: string,
  secretKey: string,
  params: URLSearchParams,
): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  return parseStripeJsonResponse<T>(response, path);
}

async function getStripeJson<T extends Record<string, unknown>>(path: string, secretKey: string): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });

  return parseStripeJsonResponse<T>(response, path);
}

export async function createStripeCustomer(input: {
  secretKey: string;
  name: string;
  email?: string;
  metadata?: Record<string, string>;
}): Promise<{ customerId: string }> {
  const params = new URLSearchParams();
  params.set('name', input.name);

  if (readString(input.email)) {
    params.set('email', input.email!);
  }

  appendMetadata(params, 'metadata', input.metadata);

  const payload = await postStripeForm<{ id?: unknown }>('customers', input.secretKey, params);
  const customerId = readString(payload.id);

  if (!customerId) {
    throw new Error('Stripe customer creation did not return a customer id.');
  }

  return {
    customerId,
  };
}

export async function createStripeCheckoutSession(input: {
  secretKey: string;
  customerId: string;
  stripePriceId: string;
  quantity: number;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId?: string;
  metadata?: Record<string, string>;
  subscriptionMetadata?: Record<string, string>;
}): Promise<{ sessionId: string; customerId: string; redirectUrl: string }> {
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('customer', input.customerId);
  params.set('success_url', input.successUrl);
  params.set('cancel_url', input.cancelUrl);
  params.set('line_items[0][price]', input.stripePriceId);
  params.set('line_items[0][quantity]', String(Math.max(1, input.quantity)));
  params.set('allow_promotion_codes', 'true');

  if (readString(input.clientReferenceId)) {
    params.set('client_reference_id', input.clientReferenceId!);
  }

  appendMetadata(params, 'metadata', input.metadata);
  appendMetadata(params, 'subscription_data[metadata]', input.subscriptionMetadata);

  const payload = await postStripeForm<{
    id?: unknown;
    customer?: unknown;
    url?: unknown;
  }>('checkout/sessions', input.secretKey, params);
  const sessionId = readString(payload.id);
  const customerId = readString(payload.customer) ?? input.customerId;
  const redirectUrl = readString(payload.url);

  if (!sessionId || !customerId || !redirectUrl) {
    throw new Error('Stripe checkout session creation returned an incomplete payload.');
  }

  return {
    sessionId,
    customerId,
    redirectUrl,
  };
}

export async function createStripeBillingPortalSession(input: {
  secretKey: string;
  customerId: string;
  returnUrl: string;
}): Promise<{ redirectUrl: string }> {
  const params = new URLSearchParams();
  params.set('customer', input.customerId);
  params.set('return_url', input.returnUrl);

  const payload = await postStripeForm<{ url?: unknown }>('billing_portal/sessions', input.secretKey, params);
  const redirectUrl = readString(payload.url);

  if (!redirectUrl) {
    throw new Error('Stripe billing portal creation did not return a redirect url.');
  }

  return {
    redirectUrl,
  };
}

export async function updateStripeSubscriptionCancellation(input: {
  secretKey: string;
  stripeSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
}): Promise<{
  stripeSubscriptionId: string;
  customerId?: string;
  stripePriceId?: string;
  cancelAtPeriodEnd: boolean;
  status?: string;
  currentPeriodEnd?: Date;
}> {
  const params = new URLSearchParams();
  params.set('cancel_at_period_end', input.cancelAtPeriodEnd ? 'true' : 'false');

  const payload = await postStripeForm<{
    id?: unknown;
    customer?: unknown;
    status?: unknown;
    cancel_at_period_end?: unknown;
    current_period_end?: unknown;
    items?: {
      data?: Array<{
        price?: {
          id?: unknown;
        };
      }>;
    };
  }>(`subscriptions/${input.stripeSubscriptionId}`, input.secretKey, params);
  const stripeSubscriptionId = readString(payload.id);

  if (!stripeSubscriptionId) {
    throw new Error('Stripe subscription update did not return a subscription id.');
  }

  return {
    stripeSubscriptionId,
    customerId: readString(payload.customer),
    stripePriceId: readString(payload.items?.data?.[0]?.price?.id),
    cancelAtPeriodEnd: payload.cancel_at_period_end === true,
    status: readString(payload.status),
    currentPeriodEnd: readDateFromUnixSeconds(payload.current_period_end),
  };
}

export async function getStripeInvoiceDocument(input: {
  secretKey: string;
  stripeInvoiceId: string;
}): Promise<{
  externalId: string;
  redirectUrl: string;
  format: 'pdf' | 'hosted_page';
}> {
  const payload = await getStripeJson<{
    id?: unknown;
    invoice_pdf?: unknown;
    hosted_invoice_url?: unknown;
  }>(`invoices/${input.stripeInvoiceId}`, input.secretKey);
  const externalId = readString(payload.id);
  const invoicePdfUrl = readString(payload.invoice_pdf);
  const hostedInvoiceUrl = readString(payload.hosted_invoice_url);
  const redirectUrl = invoicePdfUrl ?? hostedInvoiceUrl;

  if (!externalId) {
    throw new Error('Stripe invoice lookup did not return an invoice id.');
  }

  if (!redirectUrl) {
    throw new Error(`Stripe invoice ${externalId} does not expose a downloadable PDF or hosted invoice page yet.`);
  }

  return {
    externalId,
    redirectUrl,
    format: invoicePdfUrl ? 'pdf' : 'hosted_page',
  };
}
