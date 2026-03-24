import { NextResponse } from 'next/server';
import {
  type BillingAdminPlanEntitlementInput,
  type BillingAdminPlanPriceInput,
  type BillingAdminPlanUpdateRequest,
  type BillingAdminPlanUpdateResult,
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

function normalizePrices(value: unknown): BillingAdminPlanPriceInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value.map((price) => {
      if (!price || typeof price !== 'object' || Array.isArray(price)) {
        return null;
      }

      const candidate = price as Partial<BillingAdminPlanPriceInput>;

      if (
        (candidate.interval !== 'monthly' && candidate.interval !== 'yearly') ||
        typeof candidate.currency !== 'string' ||
        typeof candidate.amount !== 'number' ||
        typeof candidate.isDefault !== 'boolean'
      ) {
        return null;
      }

      return {
        interval: candidate.interval,
        currency: candidate.currency.trim(),
        amount: candidate.amount,
        isDefault: candidate.isDefault,
        stripePriceId:
          candidate.stripePriceId === null
            ? null
            : typeof candidate.stripePriceId === 'string'
              ? candidate.stripePriceId.trim() || null
          : undefined,
      };
    });

  return normalized.every(Boolean) ? (normalized as BillingAdminPlanPriceInput[]) : null;
}

function normalizeEntitlements(value: unknown): BillingAdminPlanEntitlementInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value.map((entitlement) => {
      if (!entitlement || typeof entitlement !== 'object' || Array.isArray(entitlement)) {
        return null;
      }

      const candidate = entitlement as Partial<BillingAdminPlanEntitlementInput>;

      if (typeof candidate.key !== 'string' || typeof candidate.enabled !== 'boolean') {
        return null;
      }

      return {
        key: candidate.key.trim(),
        enabled: candidate.enabled,
        ...(candidate.limit === null
          ? { limit: null }
          : typeof candidate.limit === 'number'
            ? { limit: candidate.limit }
          : {}),
      };
    });

  return normalized.every(Boolean) ? (normalized as BillingAdminPlanEntitlementInput[]) : null;
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return badRequest('Sign in to update plans.', 401);
  }

  const body = (await request.json().catch(() => null)) as Partial<BillingAdminPlanUpdateRequest> | null;
  const planCode = body?.planCode?.trim();
  const name = typeof body?.name === 'string' ? body.name.trim() : undefined;
  const description = typeof body?.description === 'string' ? body.description.trim() : undefined;
  const isActive = typeof body?.isActive === 'boolean' ? body.isActive : undefined;
  const prices = body && 'prices' in body ? normalizePrices(body.prices) : undefined;
  const entitlements = body && 'entitlements' in body ? normalizeEntitlements(body.entitlements) : undefined;

  if (!planCode) {
    return badRequest('planCode is required.');
  }

  if (body && 'prices' in body && prices === null) {
    return badRequest('prices must be an array of valid billing price rows.');
  }

  if (body && 'entitlements' in body && entitlements === null) {
    return badRequest('entitlements must be an array of valid plan entitlement rows.');
  }

  const response = await fetch(`${API_URL}/admin/plans/update`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      planCode,
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(prices !== undefined ? { prices } : {}),
      ...(entitlements !== undefined ? { entitlements } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<BillingAdminPlanUpdateResult>
    | { message?: string | string[] }
    | null;

  if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
    const fallbackMessage =
      payload && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message
        : 'Unable to update the billing plan right now.';

    return badRequest(fallbackMessage ?? 'Unable to update the billing plan right now.', response.status || 500);
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
