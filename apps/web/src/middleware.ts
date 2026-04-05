import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_TOKEN_COOKIE = 'quizmind_access_token';
const REFRESH_TOKEN_COOKIE = 'quizmind_refresh_token';
const REFRESHED_TOKEN_HEADER = 'x-refreshed-access-token';

// Matches the REFRESH_TOKEN_LIFETIME_DAYS constant from @quizmind/auth
const REFRESH_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

function resolveApiUrl(): string {
  const internal = process.env.API_INTERNAL_URL?.trim();
  if (internal) {
    try {
      return new URL(internal).origin;
    } catch {
      // fall through
    }
  }
  return (
    process.env.API_URL?.trim() ??
    process.env.NEXT_PUBLIC_API_URL?.trim() ??
    'http://localhost:4000'
  );
}

interface RefreshedSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

async function attemptTokenRefresh(refreshToken: string): Promise<RefreshedSession | null> {
  try {
    const apiUrl = resolveApiUrl();
    const response = await fetch(`${apiUrl}/auth/refresh`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { ok: boolean; data: RefreshedSession };

    if (!payload.ok || !payload.data?.accessToken) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  // Access token is present — no refresh needed.
  if (accessToken) {
    return NextResponse.next();
  }

  // No tokens at all — let the page handle the unauthenticated state.
  if (!refreshToken) {
    return NextResponse.next();
  }

  // Access token expired but refresh token still valid — attempt silent refresh.
  const session = await attemptTokenRefresh(refreshToken);

  if (!session) {
    // Refresh failed (token revoked or expired). Clear the stale refresh cookie.
    const res = NextResponse.next();
    res.cookies.set(REFRESH_TOKEN_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    return res;
  }

  // Forward the new access token to the page handler via a custom request header
  // so Server Components can read it without waiting for the browser to re-send cookies.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REFRESHED_TOKEN_HEADER, session.accessToken);

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const baseCookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
  };

  // Set new cookies in the response so the browser stores them.
  res.cookies.set(ACCESS_TOKEN_COOKIE, session.accessToken, {
    ...baseCookieOptions,
    expires: new Date(session.expiresAt),
  });
  res.cookies.set(REFRESH_TOKEN_COOKIE, session.refreshToken, {
    ...baseCookieOptions,
    maxAge: REFRESH_TOKEN_LIFETIME_SECONDS,
  });

  return res;
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals, static assets, and auth API routes
    // (auth API routes handle their own cookie logic).
    '/((?!_next/static|_next/image|favicon\\.ico|api/auth/).*)',
  ],
};
