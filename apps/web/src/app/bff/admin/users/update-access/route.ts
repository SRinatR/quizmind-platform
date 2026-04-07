import { NextResponse } from 'next/server';
import {
  type AdminUserAccessUpdateRequest,
  type AdminUserMutationResult,
  systemRoles,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: {
    message: string;
  };
}

const validSystemRoles = new Set(systemRoles);

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

function normalizeSystemRoles(value: unknown): AdminUserAccessUpdateRequest['systemRoles'] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is (typeof systemRoles)[number] => validSystemRoles.has(item as (typeof systemRoles)[number]));

  return Array.from(new Set(normalized));
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to update user access.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<AdminUserAccessUpdateRequest> | null;
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const displayName =
    body && 'displayName' in body
      ? body.displayName === null
        ? null
        : typeof body.displayName === 'string'
          ? body.displayName.trim()
          : undefined
      : undefined;
  const systemRolesInput = body && 'systemRoles' in body ? normalizeSystemRoles(body.systemRoles) : undefined;
  const suspendReason =
    body && 'suspendReason' in body
      ? body.suspendReason === null
        ? null
        : typeof body.suspendReason === 'string'
          ? body.suspendReason.trim()
          : undefined
      : undefined;

  if (!userId) {
    return badRequest('userId is required.');
  }

  if (body && 'systemRoles' in body && systemRolesInput === null) {
    return badRequest('systemRoles must be an array of role ids.');
  }

  if (
    typeof displayName === 'undefined' &&
    typeof systemRolesInput === 'undefined' &&
    typeof body?.suspend !== 'boolean' &&
    typeof suspendReason === 'undefined'
  ) {
    return badRequest(
      'Provide at least one mutable field: displayName, systemRoles, suspend.',
    );
  }

  const systemRoles = systemRolesInput === null ? undefined : systemRolesInput;
  const upstreamBody: AdminUserAccessUpdateRequest = {
    userId,
    ...(displayName !== undefined ? { displayName } : {}),
    ...(systemRoles !== undefined ? { systemRoles } : {}),
    ...(typeof body?.suspend === 'boolean' ? { suspend: body.suspend } : {}),
    ...(suspendReason !== undefined ? { suspendReason } : {}),
  };

  const response = await fetch(`${API_URL}/admin/users/update-access`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(upstreamBody),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<AdminUserMutationResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to update user access right now.';

    return badRequest(
      fallbackMessage ?? 'Unable to update user access right now.',
      response.status || 500,
    );
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
