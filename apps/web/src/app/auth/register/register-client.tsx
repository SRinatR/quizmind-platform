'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';

import type { SessionSnapshot } from '../../../lib/api';

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
      setErrorMessage('Passwords do not match.');
      return;
    }

    setStatusMessage('Creating your account\u2026');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
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
        setErrorMessage(payload?.error?.message ?? 'Unable to create the account right now. Please try again.');
        return;
      }

      setStatusMessage('Account created. Taking you in\u2026');

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
        <span className="micro-label">Already signed in</span>
        <h2>You already have an account, {userName}.</h2>
        <p className="auth-form-copy">{initialSession.user.email}</p>

        <div className="auth-form-actions">
          <Link className="btn-primary" href={nextPath}>
            Continue to dashboard
          </Link>
          <Link className="btn-ghost" href="/app">
            Go to dashboard
          </Link>
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
      <span className="micro-label">Create account</span>
      <h2>Get started with QuizMind</h2>
      <p className="auth-form-copy">Create your account to connect the extension and start using the platform.</p>

      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="auth-field">
          <span>Name</span>
          <input
            autoComplete="name"
            name="displayName"
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name"
            type="text"
            value={displayName}
          />
        </label>

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
            autoComplete="new-password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            required
            type="password"
            value={password}
          />
        </label>

        <label className="auth-field">
          <span>Confirm password</span>
          <input
            autoComplete="new-password"
            name="confirmPassword"
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat your password"
            required
            type="password"
            value={confirmPassword}
          />
        </label>

        <button className="btn-primary auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Creating account\u2026' : 'Create account'}
        </button>
      </form>

      {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

      <div className="auth-links">
        <Link href={`/auth/login?next=${encodeURIComponent(nextPath)}`}>Already have an account?</Link>
        <Link href="/auth/forgot-password">Forgot password?</Link>
      </div>
    </div>
  );
}
