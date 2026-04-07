import { NextResponse } from 'next/server';
import {
  type SupportTicketWorkflowUpdateRequest,
  type SupportTicketWorkflowUpdateResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

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

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to update a support ticket.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<SupportTicketWorkflowUpdateRequest> | null;
  const supportTicketId = body?.supportTicketId?.trim();
  const assignedToUserId =
    body && 'assignedToUserId' in body ? body.assignedToUserId?.trim() || null : undefined;
  const handoffNote =
    body && 'handoffNote' in body ? body.handoffNote?.trim() || null : undefined;

  if (!supportTicketId) {
    return badRequest('Support ticket is required.');
  }

  const response = await fetch(`${API_URL}/support/tickets/update`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      supportTicketId,
      ...(body?.status ? { status: body.status } : {}),
      ...(assignedToUserId !== undefined ? { assignedToUserId } : {}),
      ...(handoffNote !== undefined ? { handoffNote } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<SupportTicketWorkflowUpdateResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to update the support ticket right now.';

    return badRequest(fallbackMessage ?? 'Unable to update the support ticket right now.', response.status || 500);
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
