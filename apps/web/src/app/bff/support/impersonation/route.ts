import { NextResponse } from 'next/server';
import { type SupportImpersonationRequest, type SupportImpersonationResult } from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
  };
}

interface UpstreamSupportImpersonationPayload {
  result?: SupportImpersonationResult;
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

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to start a support session.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<SupportImpersonationRequest> | null;
  const targetUserId = body?.targetUserId?.trim();
  const reason = body?.reason?.trim();
  const supportTicketId = body?.supportTicketId?.trim() || undefined;
  const operatorNote = body?.operatorNote?.trim() || undefined;

  if (!targetUserId) {
    return badRequest('Target user is required.');
  }

  if (!reason) {
    return badRequest('Reason is required.');
  }

  const response = await fetch(`${API_URL}/support/impersonation`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      targetUserId,
      reason,
      ...(supportTicketId ? { supportTicketId } : {}),
      ...(operatorNote ? { operatorNote } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<UpstreamSupportImpersonationPayload>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok || !payload.data.result) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to start a support session right now.';

    return badRequest(fallbackMessage ?? 'Unable to start a support session right now.', response.status || 500);
  }

  return NextResponse.json(
    {
      ok: true,
      data: payload.data.result,
    },
    {
      status: response.status,
    },
  );
}
