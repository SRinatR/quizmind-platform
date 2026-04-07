'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';

import type { SessionSnapshot } from '../../../lib/api';
import { usePreferences } from '../../../lib/preferences';

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
  const { t } = usePreferences();
  const tl = t.auth.login;
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
    nextPath.startsWith('/app/extension/connect') ? tl.continueExtension : tl.continueDashboard;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(tl.signingIn);
    setIsSubmitting(true);

    try {
      const response = await fetch('/bff/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json().catch(() => null)) as LoginRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSubmitting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? tl.invalidCredentials);
        return;
      }

      setStatusMessage(tl.signedInRedirecting);

      startNavigation(() => {
        router.push(nextPath);
        router.refresh();
      });
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage(tl.serverError);
    }
  }

  async function handleLogout() {
    setErrorMessage(null);
    setStatusMessage(tl.signingOut);
    setIsSigningOut(true);

    try {
      const response = await fetch('/bff/auth/logout', { method: 'POST' });

      if (!response.ok) {
        setIsSigningOut(false);
        setStatusMessage(null);
        setErrorMessage(tl.signOutError);
        return;
      }

      startNavigation(() => {
        router.refresh();
      });
    } catch {
      setIsSigningOut(false);
      setStatusMessage(null);
      setErrorMessage(tl.signOutError);
    }
  }

  if (isAuthenticated && initialSession) {
    const userName = initialSession.user.displayName || initialSession.user.email;

    return (
      <div className="auth-form-shell">
        <span className="micro-label">{tl.alreadySignedIn}</span>
        <h2>{tl.welcomeBack}, {userName}.</h2>
        <p className="auth-form-copy">{initialSession.user.email}</p>

        <div className="auth-form-actions">
          <Link className="btn-primary" href={nextPath}>
            {continueLabel}
          </Link>
          <Link className="btn-ghost" href="/app">
            {tl.goToDashboard}
          </Link>
          {hasAdminAccess ? (
            <Link className="btn-ghost" href="/admin">
              {tl.adminPanel}
            </Link>
          ) : null}
          <button className="btn-ghost" disabled={isSigningOut} onClick={handleLogout} type="button">
            {isSigningOut ? tl.signingOut : tl.signOut}
          </button>
        </div>

        {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
        {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className="auth-form-shell">
      <span className="micro-label">{tl.eyebrow}</span>
      <h2>{tl.heading}</h2>
      <p className="auth-form-copy">{tl.subheading}</p>

      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="auth-field">
          <span>{tl.emailLabel}</span>
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
          <span>{tl.passwordLabel}</span>
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
          {isSubmitting ? tl.signingIn : tl.submitButton}
        </button>
      </form>

      {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

      <div className="auth-links">
        <Link href={registerHref}>{tl.createAccount}</Link>
        <Link href="/auth/forgot-password">{tl.forgotPassword}</Link>
      </div>
    </div>
  );
}
