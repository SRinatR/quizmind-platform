import { NextResponse } from 'next/server';
import { type BillingInvoicePdfResult } from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
  };
}

function badRequest(message: string, status = 400) {
  return NextResponse.json<RouteErrorPayload>(
    {
      ok: false,
      error: {
        message,
      },
    },
    { status },
  );
}

interface RouteContext {
  params: Promise<{
    invoiceId: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to download billing invoices.', 401);
  }

  const { invoiceId } = await context.params;
  const resolvedInvoiceId = invoiceId?.trim();

  if (!resolvedInvoiceId) {
    return badRequest('invoiceId is required.');
  }

  const response = await fetch(`${API_URL}/billing/invoices/${encodeURIComponent(resolvedInvoiceId)}/pdf`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<BillingInvoicePdfResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to open the invoice PDF right now.';

    return badRequest(fallbackMessage ?? 'Unable to open the invoice PDF right now.', response.status || 500);
  }

  return NextResponse.json(
    {
      ok: true,
      data: payload.data,
    },
    {
      status: response.status,
    },
  );
}
