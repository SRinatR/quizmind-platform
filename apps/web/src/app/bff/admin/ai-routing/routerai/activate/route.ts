import { NextResponse } from 'next/server';
import {
  type AdminProviderGovernanceSnapshot,
  type AiProviderPolicyUpdateResult,
  type ProviderCredentialMutationResult,
} from '@quizmind/contracts';

import { API_URL, type ApiEnvelope } from '../../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../../lib/auth-session';

interface RouteErrorPayload {
  ok: false;
  error: { message: string };
}

interface ActivateResult {
  credentialUpdatedAt?: string;
  policyUpdatedAt: string;
}

function badRequest(message: string, status = 400) {
  return NextResponse.json<RouteErrorPayload>({ ok: false, error: { message } }, { status });
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to activate RouterAI routing.', 401);
  }

  const body = (await request.json().catch(() => null)) as { secret?: unknown; defaultModel?: unknown } | null;
  const secret = typeof body?.secret === 'string' ? body.secret.trim() : '';
  const defaultModel = typeof body?.defaultModel === 'string' ? body.defaultModel.trim() || null : null;

  const authHeader = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
  const governanceResponse = await fetch(`${API_URL}/admin/providers`, {
    cache: 'no-store',
    headers: authHeader,
  });

  if (!governanceResponse.ok) {
    return badRequest('Unable to fetch current provider governance.', governanceResponse.status || 500);
  }

  const governanceEnvelope = (await governanceResponse.json().catch(() => null)) as
    | ApiEnvelope<AdminProviderGovernanceSnapshot>
    | null;
  const governance = governanceEnvelope?.ok ? governanceEnvelope.data : null;

  if (!governance) {
    return badRequest('Unable to parse provider governance response.');
  }

  const activePlatformCreds = governance.items
    .filter((item) => item.provider === 'routerai' && item.ownerType === 'platform' && !item.revokedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const existingCred = activePlatformCreds[0] ?? null;
  let credentialUpdatedAt = existingCred?.updatedAt;

  if (!secret && !existingCred) {
    return badRequest('RouterAI API key is required because no active platform RouterAI credential exists.');
  }

  if (secret) {
    const credResponse = await fetch(
      existingCred ? `${API_URL}/providers/credentials/rotate` : `${API_URL}/providers/credentials`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: authHeader,
        body: JSON.stringify(
          existingCred
            ? { credentialId: existingCred.id, secret }
            : { provider: 'routerai', ownerType: 'platform', secret },
        ),
      },
    );

    const credEnvelope = (await credResponse.json().catch(() => null)) as
      | ApiEnvelope<ProviderCredentialMutationResult>
      | { message?: string | string[] }
      | null;

    if (!credResponse.ok || !credEnvelope || !('ok' in credEnvelope) || !credEnvelope.ok) {
      const msg =
        credEnvelope && 'message' in credEnvelope
          ? Array.isArray(credEnvelope.message)
            ? credEnvelope.message[0]
            : credEnvelope.message
          : 'Unable to save RouterAI credential.';
      return badRequest(msg ?? 'Unable to save RouterAI credential.', credResponse.status || 500);
    }

    credentialUpdatedAt = credEnvelope.data.credential.updatedAt;
  }

  const policyResponse = await fetch(`${API_URL}/admin/providers/policy`, {
    method: 'POST',
    cache: 'no-store',
    headers: authHeader,
    body: JSON.stringify({
      mode: 'platform_only',
      allowPlatformManaged: true,
      allowBringYourOwnKey: false,
      allowDirectProviderMode: false,
      allowWorkspaceSharedCredentials: false,
      requireAdminApproval: false,
      providers: ['routerai'],
      defaultProvider: 'routerai',
      defaultModel,
      reason: 'Platform-managed RouterAI routing. BYOK and direct provider mode disabled.',
    }),
  });

  const policyEnvelope = (await policyResponse.json().catch(() => null)) as
    | ApiEnvelope<AiProviderPolicyUpdateResult>
    | { message?: string | string[] }
    | null;

  if (!policyResponse.ok || !policyEnvelope || !('ok' in policyEnvelope) || !policyEnvelope.ok) {
    const msg =
      policyEnvelope && 'message' in policyEnvelope
        ? Array.isArray(policyEnvelope.message)
          ? policyEnvelope.message[0]
          : policyEnvelope.message
        : 'Credential saved but unable to activate policy.';
    return badRequest(msg ?? 'Credential saved but unable to activate policy.', policyResponse.status || 500);
  }

  return NextResponse.json<{ ok: true; data: ActivateResult }>(
    {
      ok: true,
      data: {
        ...(credentialUpdatedAt ? { credentialUpdatedAt } : {}),
        policyUpdatedAt: policyEnvelope.data.updatedAt,
      },
    },
    { status: 200 },
  );
}
