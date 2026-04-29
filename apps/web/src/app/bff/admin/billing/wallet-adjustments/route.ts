import { NextRequest, NextResponse } from 'next/server';
import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';
function badRequest(message: string, status = 400) { return NextResponse.json({ ok: false, error: { message } }, { status }); }
const defaults = { apiUrl: API_URL, readAccessToken: getAccessTokenFromCookies, fetchImpl: fetch };
let deps = { ...defaults };
export function setUserBillingAdjustmentsRouteDependenciesForTests(overrides: Partial<typeof defaults>) { deps = { ...deps, ...overrides }; }
export function resetUserBillingAdjustmentsRouteDependenciesForTests() { deps = { ...defaults }; }
export async function POST(request: NextRequest) { const accessToken = await deps.readAccessToken(); if (!accessToken) return badRequest('Sign in to apply wallet adjustment.', 401); const body = await request.json().catch(() => ({})); const response = await deps.fetchImpl(`${deps.apiUrl}/admin/billing/wallet-adjustments`, { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }); const payload = (await response.json().catch(() => null)) as ApiEnvelope<unknown> | null; if (!response.ok || !payload?.ok) return badRequest('Unable to apply wallet adjustment right now.', response.status || 500); return NextResponse.json({ ok: true, data: payload.data }, { status: response.status }); }
