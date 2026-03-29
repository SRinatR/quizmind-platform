import { NextResponse } from 'next/server';
import {
  type AdminUserCreateRequest,
  type AdminUserMutationResult,
  systemRoles,
  workspaceRoles,
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
const validWorkspaceRoles = new Set(workspaceRoles);

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

function normalizeSystemRoles(value: unknown): AdminUserCreateRequest['systemRoles'] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is (typeof systemRoles)[number] => validSystemRoles.has(item as (typeof systemRoles)[number]));

  return Array.from(new Set(normalized));
}

function normalizeWorkspaceMemberships(value: unknown): AdminUserCreateRequest['workspaceMemberships'] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const memberships = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }

      const candidate = entry as { workspaceId?: unknown; role?: unknown };
      const workspaceId = typeof candidate.workspaceId === 'string' ? candidate.workspaceId.trim() : '';
      const role = typeof candidate.role === 'string' ? candidate.role.trim() : '';

      if (!workspaceId || !validWorkspaceRoles.has(role as (typeof workspaceRoles)[number])) {
        return null;
      }

      return {
        workspaceId,
        role: role as (typeof workspaceRoles)[number],
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const byWorkspace = new Map<string, (typeof workspaceRoles)[number]>();

  for (const membership of memberships) {
    byWorkspace.set(membership.workspaceId, membership.role);
  }

  return Array.from(byWorkspace.entries()).map(([workspaceId, role]) => ({
    workspaceId,
    role,
  }));
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to create users.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<AdminUserCreateRequest> | null;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password.trim() : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const systemRolesInput = body && 'systemRoles' in body ? normalizeSystemRoles(body.systemRoles) : undefined;
  const workspaceMembershipsInput =
    body && 'workspaceMemberships' in body ? normalizeWorkspaceMemberships(body.workspaceMemberships) : undefined;

  if (!email) {
    return badRequest('email is required.');
  }

  if (!password) {
    return badRequest('password is required.');
  }

  if (body && 'systemRoles' in body && systemRolesInput === null) {
    return badRequest('systemRoles must be an array of role ids.');
  }

  if (body && 'workspaceMemberships' in body && workspaceMembershipsInput === null) {
    return badRequest('workspaceMemberships must be an array of { workspaceId, role } objects.');
  }

  const systemRoles = systemRolesInput === null ? undefined : systemRolesInput;
  const workspaceMemberships =
    workspaceMembershipsInput === null ? undefined : workspaceMembershipsInput;
  const upstreamBody: AdminUserCreateRequest = {
    email,
    password,
    ...(displayName ? { displayName } : {}),
    ...(systemRoles !== undefined ? { systemRoles } : {}),
    ...(workspaceMemberships !== undefined ? { workspaceMemberships } : {}),
    ...(typeof body?.emailVerified === 'boolean' ? { emailVerified: body.emailVerified } : {}),
  };

  const response = await fetch(`${API_URL}/admin/users/create`, {
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
        : 'Unable to create the user right now.';

    return badRequest(fallbackMessage ?? 'Unable to create the user right now.', response.status || 500);
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
