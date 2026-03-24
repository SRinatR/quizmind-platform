import { NextResponse } from 'next/server';
import {
  usageExportFormats,
  usageExportScopes,
  type UsageExportRequest,
  type UsageExportResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
  };
}

const validFormats = new Set(usageExportFormats);
const validScopes = new Set(usageExportScopes);

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
    return badRequest('Sign in to export usage.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<UsageExportRequest> | null;
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : '';
  const format = body?.format && validFormats.has(body.format) ? body.format : undefined;
  const scope = body?.scope && validScopes.has(body.scope) ? body.scope : undefined;

  if (!workspaceId) {
    return badRequest('workspaceId is required.');
  }

  if (!format) {
    return badRequest('format must be json or csv.');
  }

  if (!scope) {
    return badRequest('scope must be full, quotas, installations, or events.');
  }

  const response = await fetch(`${API_URL}/admin/usage/export`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      workspaceId,
      format,
      scope,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<UsageExportResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to export usage right now.';

    return badRequest(fallbackMessage ?? 'Unable to export usage right now.', response.status || 500);
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
