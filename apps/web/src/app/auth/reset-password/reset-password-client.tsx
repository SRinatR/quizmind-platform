'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';

interface ResetPasswordClientProps {
  nextPath: string;
  token?: string;
}

interface ResetPasswordRouteResponse {
  ok: boolean;
  data?: {
    expiresAt: string;
    resetAt: string;
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

export function ResetPasswordClient({ nextPath, token }: ResetPasswordClientProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, startNavigation] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage('Password reset token is missing from this link.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords must match before continuing.');
      return;
    }

    setStatusMessage('Updating your password and rotating sessions...');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const payload = (await response.json().catch(() => null)) as ResetPasswordRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSubmitting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to reset the password right now.');
        return;
      }

      setStatusMessage('Password updated. Redirecting into the connected app...');

      startNavigation(() => {
        router.push(nextPath);
        router.refresh();
      });
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the password reset route right now.');
    }
  }

  if (!token) {
    return (
      <div className="auth-form-shell">
        <span className="micro-label">Reset link</span>
        <h2>This reset link is incomplete.</h2>
        <p className="auth-form-copy">
          The password reset page needs a token from the email link. Request a new reset email to continue.
        </p>

        <div className="auth-form-actions">
          <Link className="btn-primary" href="/auth/forgot-password">
            Request new link
          </Link>
          <Link className="btn-ghost" href="/auth/login">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-form-shell">
      <span className="micro-label">Reset password</span>
      <h2>Choose a new password</h2>
      <p className="auth-form-copy">
        This will revoke active sessions tied to the account and create a fresh connected session in this browser.
      </p>

      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="auth-field">
          <span>New password</span>
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
          <span>Confirm new password</span>
          <input
            autoComplete="new-password"
            name="confirmPassword"
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat the new password"
            type="password"
            value={confirmPassword}
          />
        </label>

        <button className="btn-primary auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Updating password...' : 'Reset password'}
        </button>
      </form>

      {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

      <div className="auth-links">
        <Link href="/auth/login">Back to sign in</Link>
        <Link href="/auth/forgot-password">Request another link</Link>
      </div>
    </div>
  );
}
