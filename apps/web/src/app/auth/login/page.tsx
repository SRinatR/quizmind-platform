import Link from 'next/link';

import { getSession } from '../../../lib/api';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { LoginClient } from './login-client';

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function resolveNextPath(rawValue: string | string[] | undefined): string {
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;

  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/app';
  }

  return value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPath = resolveNextPath(resolvedSearchParams?.next);
  const accessToken = await getAccessTokenFromCookies();
  const currentSession = accessToken ? await getSession('platform-admin', accessToken) : null;

  return (
    <div className="auth-page">
      <div className="auth-page__backdrop" />
      <div className="auth-page__shell">
        <section className="auth-panel auth-panel--brand">
          <div className="auth-brand">
            <span className="auth-brand__eyebrow">QuizMind Platform</span>
            <h1>Sign in to the control surface.</h1>
            <p>
              The page used to show a development scaffold. It now connects to the real `/auth/login`
              backend flow and creates a cookie-backed session for the web app.
            </p>
          </div>

          <div className="auth-highlights">
            <div className="auth-highlight">
              <span className="micro-label">Connected auth</span>
              <strong>Real Nest + Prisma session</strong>
              <p>The form issues the same access and refresh tokens as the API clients.</p>
            </div>
            <div className="auth-highlight">
              <span className="micro-label">Demo credentials</span>
              <strong>Role matrix accounts</strong>
              <p>Every seeded test account on this page uses password: `demo-password`.</p>
            </div>
            <div className="auth-highlight">
              <span className="micro-label">After login</span>
              <strong>Dashboard uses bearer auth</strong>
              <p>`/app` and `/admin` now read the connected session cookie before falling back to personas.</p>
            </div>
          </div>

          <div className="auth-links">
            <Link href="/">Back to landing</Link>
            <Link href="/app">Open dashboard</Link>
            <Link href="/admin">Open admin</Link>
          </div>
        </section>

        <section className="auth-panel auth-panel--form">
          <LoginClient initialSession={currentSession} nextPath={nextPath} />
        </section>
      </div>
    </div>
  );
}
