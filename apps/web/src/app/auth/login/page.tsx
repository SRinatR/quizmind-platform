import Link from 'next/link';

import { resolveNextPath, withNextPath } from '../search-params';
import { getSession } from '../../../lib/api';
import { getAccessTokenFromCookies } from '../../../lib/auth-session';
import { LoginClient } from './login-client';

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPath = resolveNextPath(resolvedSearchParams?.next);
  const accessToken = await getAccessTokenFromCookies();
  const currentSession = accessToken ? await getSession('connected-user', accessToken) : null;

  return (
    <div className="auth-page">
      <div className="auth-page__backdrop" />
      <div className="auth-page__shell">
        <section className="auth-panel auth-panel--brand">
          <div className="auth-brand">
            <span className="auth-brand__eyebrow">QuizMind</span>
            <h1>Your quiz platform, powered by AI.</h1>
            <p>
              Sign in to manage your extension, track usage, and access your workspace.
            </p>
          </div>

          <div className="auth-links">
            <Link href="/">Back to home</Link>
            <Link href={withNextPath('/auth/register', nextPath)}>Create account</Link>
          </div>
        </section>

        <section className="auth-panel auth-panel--form">
          <LoginClient initialSession={currentSession} nextPath={nextPath} />
        </section>
      </div>
    </div>
  );
}
