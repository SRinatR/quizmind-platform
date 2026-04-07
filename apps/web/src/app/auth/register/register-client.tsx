'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';

import type { SessionSnapshot } from '../../../lib/api';
import { usePreferences } from '../../../lib/preferences';

interface RegisterClientProps {
  initialSession: SessionSnapshot | null;
  nextPath: string;
}

interface RegisterRouteResponse {
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

export function RegisterClient({ initialSession, nextPath }: RegisterClientProps) {
  const router = useRouter();
  const { t } = usePreferences();
  const tr = t.auth.register;
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [, startNavigation] = useTransition();

  const isAuthenticated = Boolean(initialSession);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage(tr.passwordMismatch);
      return;
    }

    setStatusMessage(tr.creating);
    setIsSubmitting(true);

    try {
      const response = await fetch('/bff/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as RegisterRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSubmitting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? tr.createError);
        return;
      }

      setStatusMessage(tr.accountCreated);

      startNavigation(() => {
        router.push(nextPath);
        router.refresh();
      });
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage(tr.createError);
    }
  }

  async function handleLogout() {
    setErrorMessage(null);
    setStatusMessage(tr.signingOut);
    setIsSigningOut(true);

    try {
      const response = await fetch('/bff/auth/logout', { method: 'POST' });

      if (!response.ok) {
        setIsSigningOut(false);
        setStatusMessage(null);
        setErrorMessage(tr.signOutError);
        return;
      }

      startNavigation(() => {
        router.refresh();
      });
    } catch {
      setIsSigningOut(false);
      setStatusMessage(null);
      setErrorMessage(tr.signOutError);
    }
  }

  if (isAuthenticated && initialSession) {
    const userName = initialSession.user.displayName || initialSession.user.email;

    return (
      <div className="auth-form-shell">
        <span className="micro-label">{tr.alreadySignedIn}</span>
        <h2>{tr.alreadyHaveAccount}, {userName}.</h2>
        <p className="auth-form-copy">{initialSession.user.email}</p>

        <div className="auth-form-actions">
          <Link className="btn-primary" href={nextPath}>
            {tr.continueDashboard}
          </Link>
          <Link className="btn-ghost" href="/app">
            {tr.goToDashboard}
          </Link>
          <button className="btn-ghost" disabled={isSigningOut} onClick={handleLogout} type="button">
            {isSigningOut ? tr.signingOut : tr.signOut}
          </button>
        </div>

        {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
        {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className="auth-form-shell">
      <span className="micro-label">{tr.eyebrow}</span>
      <h2>{tr.heading}</h2>
      <p className="auth-form-copy">{tr.subheading}</p>

      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="auth-field">
          <span>{tr.nameLabel}</span>
          <input
            autoComplete="name"
            name="displayName"
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={tr.namePlaceholder}
            type="text"
            value={displayName}
          />
        </label>

        <label className="auth-field">
          <span>{tr.emailLabel}</span>
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
          <span>{tr.passwordLabel}</span>
          <input
            autoComplete="new-password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder={tr.passwordPlaceholder}
            required
            type="password"
            value={password}
          />
        </label>

        <label className="auth-field">
          <span>{tr.confirmPasswordLabel}</span>
          <input
            autoComplete="new-password"
            name="confirmPassword"
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder={tr.confirmPasswordPlaceholder}
            required
            type="password"
            value={confirmPassword}
          />
        </label>

        <button className="btn-primary auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? tr.creating : tr.submitButton}
        </button>
      </form>

      {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

      <div className="auth-links">
        <Link href={`/auth/login?next=${encodeURIComponent(nextPath)}`}>{tr.haveAccount}</Link>
        <Link href="/auth/forgot-password">{t.auth.login.forgotPassword}</Link>
      </div>
    </div>
  );
}
