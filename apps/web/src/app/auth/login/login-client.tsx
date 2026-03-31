'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';

import type { SessionSnapshot } from '../../../lib/api';

interface LoginClientProps {
  initialSession: SessionSnapshot | null;
  nextPath: string;
}

interface LoginRouteResponse {
  ok: boolean;
  data?: {
    expiresAt: string;
    user: {
      id: string;
      email: string;
      displayName?: string;
    };
  };
  error?: {
    message?: string;
  };
}

export function LoginClient({ initialSession, nextPath }: LoginClientProps) {
  const router = useRouter();
  const [email, setEmail] = useState<string>(initialSession?.user.email ?? '');
  const [password, setPassword] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [, startNavigation] = useTransition();

  const isAuthenticated = Boolean(initialSession);
  const hasAdminAccess = (initialSession?.principal.systemRoles.length ?? 0) > 0;
  const registerHref = `/auth/register?next=${encodeURIComponent(nextPath)}`;
  const continueLabel =
    nextPath.startsWith('/app/extension/connect') ? 'Return to extension setup' : 'Continue to dashboard';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage('Signing you in\u2026');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json().catch(() => null)) as LoginRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSubmitting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Incorrect email or password. Please try again.');
        return;
      }

      setStatusMessage('Signed in. Redirecting\u2026');

      startNavigation(() => {
        router.push(nextPath);
        router.refresh();
      });
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the server right now. Please try again.');
    }
  }

  async function handleLogout() {
    setErrorMessage(null);
    setStatusMessage('Signing out\u2026');
    setIsSigningOut(true);

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });

      if (!response.ok) {
        setIsSigningOut(false);
        setStatusMessage(null);
        setErrorMessage('Unable to sign out right now. Please try again.');
        return;
      }

      startNavigation(() => {
        router.refresh();
      });
    } catch {
      setIsSigningOut(false);
      setStatusMessage(null);
      setErrorMessage('Unable to sign out right now. Please try again.');
    }
  }

  if (isAuthenticated && initialSession) {
    const userName = initialSession.user.displayName || initialSession.user.email;

    return (
      <div className="auth-form-shell">
        <span className="micro-label">Signed in</span>
        <h2>Welcome back, {userName}.</h2>
        <p className="auth-form-copy">{initialSession.user.email}</p>

        <div className="auth-form-actions">
          <Link className="btn-primary" href={nextPath}>
            {continueLabel}
          </Link>
          <Link className="btn-ghost" href="/app">
            Go to dashboard
          </Link>
          {hasAdminAccess ? (
            <Link className="btn-ghost" href="/admin">
              Admin panel
            </Link>
          ) : null}
          <button className="btn-ghost" disabled={isSigningOut} onClick={handleLogout} type="button">
            {isSigningOut ? 'Signing out\u2026' : 'Sign out'}
          </button>
        </div>

        {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
        {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className="auth-form-shell">
      <span className="micro-label">Sign in</span>
      <h2>Welcome back</h2>
      <p className="auth-form-copy">Sign in to your QuizMind account.</p>

      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="auth-field">
          <span>Email</span>
          <input
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder=""
            required
            type="password"
            value={password}
          />
        </label>

        <button className="btn-primary auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Signing in\u2026' : 'Sign in'}
        </button>
      </form>

      {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

      <div className="auth-links">
        <Link href={registerHref}>Create account</Link>
        <Link href="/auth/forgot-password">Forgot password?</Link>
      </div>
    </div>
  );
}
