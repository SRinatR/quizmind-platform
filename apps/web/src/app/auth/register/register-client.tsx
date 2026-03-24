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
    emailVerification: {
      required: boolean;
      emailVerifiedAt?: string | null;
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
  const sessionRoles = initialSession?.principal.systemRoles ?? [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage('Passwords must match before creating the account.');
      return;
    }

    setStatusMessage('Creating your QuizMind account...');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
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
        setErrorMessage(payload?.error?.message ?? 'Unable to create the account right now.');
        return;
      }

      setStatusMessage('Account created. Redirecting to email verification...');

      startNavigation(() => {
        const params = new URLSearchParams({
          sent: '1',
          email: payload.data?.user.email ?? email,
          next: nextPath,
        });
        router.push(`/auth/verify?${params.toString()}`);
        router.refresh();
      });
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the registration route right now.');
    }
  }

  async function handleLogout() {
    setErrorMessage(null);
    setStatusMessage('Ending your session...');
    setIsSigningOut(true);

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (!response.ok) {
        setIsSigningOut(false);
        setStatusMessage(null);
        setErrorMessage('Unable to clear the current session right now.');
        return;
      }

      startNavigation(() => {
        router.refresh();
      });
    } catch {
      setIsSigningOut(false);
      setStatusMessage(null);
      setErrorMessage('Unable to clear the current session right now.');
    }
  }

  if (isAuthenticated && initialSession) {
    return (
      <div className="auth-form-shell">
        <span className="micro-label">Active session</span>
        <h2>You already have an active account session.</h2>
        <p className="auth-form-copy">
          {initialSession.user.displayName || initialSession.user.email} - {initialSession.user.email}
        </p>

        <div className="auth-session-card">
          <strong>{initialSession.personaLabel}</strong>
          <p>{initialSession.notes[0] ?? 'Connected session is active in this browser.'}</p>
          <div className="tag-row">
            {sessionRoles.map((role) => (
              <span className="tag" key={role}>
                {role}
              </span>
            ))}
            {sessionRoles.length === 0 ? <span className="tag warn">workspace-only session</span> : null}
          </div>
        </div>

        <div className="auth-form-actions">
          <Link className="btn-primary" href={nextPath}>
            Continue
          </Link>
          <Link className="btn-ghost" href="/app">
            Open dashboard
          </Link>
          <button className="btn-ghost" disabled={isSigningOut} onClick={handleLogout} type="button">
            {isSigningOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>

        {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
        {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className="auth-form-shell">
      <span className="micro-label">Register</span>
      <h2>Create your account</h2>
      <p className="auth-form-copy">
        Start with a connected QuizMind session, then verify your inbox to unlock production-safe account recovery.
      </p>

      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="auth-field">
          <span>Display name</span>
          <input
            autoComplete="name"
            name="displayName"
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="QuizMind Owner"
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
            placeholder="owner@quizmind.dev"
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
            placeholder="Repeat the password"
            type="password"
            value={confirmPassword}
          />
        </label>

        <button className="btn-primary auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

      <div className="auth-links">
        <Link href={`/auth/login?next=${encodeURIComponent(nextPath)}`}>Already have an account?</Link>
        <Link href="/auth/forgot-password">Need a reset link?</Link>
      </div>
    </div>
  );
}
