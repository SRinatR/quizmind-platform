import { NextResponse } from 'next/server';
import {
  adminLogExportFormats,
  adminLogSeverityFilters,
  adminLogStreamFilters,
  type AdminLogExportRequest,
  type AdminLogExportResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
  };
}

const validFormats = new Set(adminLogExportFormats);
const validStreams = new Set(adminLogStreamFilters);
const validSeverities = new Set(adminLogSeverityFilters);

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
    return badRequest('Sign in to export audit logs.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<AdminLogExportRequest> | null;
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : '';
  const stream = body?.stream && validStreams.has(body.stream) ? body.stream : body?.stream === undefined ? undefined : null;
  const severity =
    body?.severity && validSeverities.has(body.severity) ? body.severity : body?.severity === undefined ? undefined : null;
  const search = typeof body?.search === 'string' ? body.search.trim() : undefined;
  const limit =
    typeof body?.limit === 'number' && Number.isFinite(body.limit) ? Math.trunc(body.limit) : undefined;
  const format = body?.format && validFormats.has(body.format) ? body.format : undefined;

  if (stream === null) {
    return badRequest('stream must be a valid admin log stream filter.');
  }

  if (severity === null) {
    return badRequest('severity must be a valid admin log severity filter.');
  }

  if (!format) {
    return badRequest('format must be json or csv.');
  }

  const response = await fetch(`${API_URL}/admin/logs/export`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...(workspaceId ? { workspaceId } : {}),
      ...(stream ? { stream } : {}),
      ...(severity ? { severity } : {}),
      ...(search ? { search } : {}),
      ...(typeof limit === 'number' ? { limit } : {}),
      format,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<AdminLogExportResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to export audit logs right now.';

    return badRequest(fallbackMessage ?? 'Unable to export audit logs right now.', response.status || 500);
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
