'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';

import { usePreferences } from '../../../lib/preferences';

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
  const { t } = usePreferences();
  const tr = t.auth.resetPassword;
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
      setErrorMessage(tr.missingToken);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(tr.passwordMismatch);
      return;
    }

    setStatusMessage(tr.resetting);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const payload = (await response.json().catch(() => null)) as ResetPasswordRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSubmitting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? tr.resetError);
        return;
      }

      setStatusMessage(tr.passwordUpdated);

      startNavigation(() => {
        router.push(nextPath);
        router.refresh();
      });
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage(tr.serverError);
    }
  }

  if (!token) {
    return (
      <div className="auth-form-shell">
        <span className="micro-label">{tr.noTokenEyebrow}</span>
        <h2>{tr.noTokenHeading}</h2>
        <p className="auth-form-copy">{tr.noTokenDesc}</p>

        <div className="auth-form-actions">
          <Link className="btn-primary" href="/auth/forgot-password">
            {tr.requestNewLink}
          </Link>
          <Link className="btn-ghost" href="/auth/login">
            {tr.backToSignIn}
          </Link>
        </div>
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
          <span>{tr.newPasswordLabel}</span>
          <input
            autoComplete="new-password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder={tr.passwordPlaceholder}
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
            placeholder={tr.confirmPlaceholder}
            type="password"
            value={confirmPassword}
          />
        </label>

        <button className="btn-primary auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? tr.resetting : tr.submitButton}
        </button>
      </form>

      {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

      <div className="auth-links">
        <Link href="/auth/login">{tr.backToSignIn}</Link>
        <Link href="/auth/forgot-password">{tr.requestAnother}</Link>
      </div>
    </div>
  );
}
