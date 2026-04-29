import { NextRequest, NextResponse } from 'next/server';
import { API_URL, type ApiEnvelope } from '../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../lib/auth-session';
function badRequest(message: string, status = 400) { return NextResponse.json({ ok: false, error: { message } }, { status }); }
const defaults = { apiUrl: API_URL, readAccessToken: getAccessTokenFromCookies, fetchImpl: fetch };
let deps = { ...defaults };
export function setUserBillingUsersRouteDependenciesForTests(overrides: Partial<typeof defaults>) { deps = { ...deps, ...overrides }; }
export function resetUserBillingUsersRouteDependenciesForTests() { deps = { ...defaults }; }
export async function GET(request: NextRequest) { const accessToken = await deps.readAccessToken(); if (!accessToken) return badRequest('Sign in to access user billing.', 401); const qs = request.nextUrl.searchParams.toString(); const response = await deps.fetchImpl(`${deps.apiUrl}/admin/billing/users${qs ? `?${qs}` : ''}`, { method: 'GET', cache: 'no-store', headers: { authorization: `Bearer ${accessToken}` } }); const payload = (await response.json().catch(() => null)) as ApiEnvelope<unknown> | null; if (!response.ok || !payload?.ok) return badRequest('Unable to load user billing right now.', response.status || 500); return NextResponse.json({ ok: true, data: payload.data }, { status: response.status }); }
