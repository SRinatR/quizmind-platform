'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useState } from 'react';

interface ForgotPasswordRouteResponse {
  ok: boolean;
  data?: {
    accepted: boolean;
    expiresInMinutes: number;
  };
  error?: {
    message?: string;
  };
}

export function ForgotPasswordClient() {
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage('Submitting your reset request...');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email,
        }),
      });

      const payload = (await response.json().catch(() => null)) as ForgotPasswordRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data?.accepted) {
        setIsSubmitting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to submit a reset request right now.');
        return;
      }

      setSubmitted(true);
      setExpiresInMinutes(payload.data.expiresInMinutes);
      setIsSubmitting(false);
      setStatusMessage(
        'If an account exists for that email, a secure password reset link is on the way.',
      );
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the password reset route right now.');
    }
  }

  if (submitted) {
    return (
      <div className="auth-form-shell">
        <span className="micro-label">Check your inbox</span>
        <h2>Password reset request received</h2>
        <p className="auth-form-copy">
          If an account exists for <strong>{email}</strong>, a reset link will arrive shortly and expire in{' '}
          {expiresInMinutes ?? 60} minutes.
        </p>

        <div className="auth-session-card">
          <strong>What happens next</strong>
          <p>Open the email, follow the secure link, and choose a new password to rotate every active session.</p>
        </div>

        {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
        {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

        <div className="auth-form-actions">
          <Link className="btn-primary" href="/auth/login">
            Back to sign in
          </Link>
          <Link className="btn-ghost" href="/auth/register">
            Create account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-form-shell">
      <span className="micro-label">Forgot password</span>
      <h2>Request a reset link</h2>
      <p className="auth-form-copy">
        Enter the email used for your QuizMind account. We will send a recovery link if the account exists.
      </p>

      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
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

        <button className="btn-primary auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Sending link...' : 'Send reset link'}
        </button>
      </form>

      {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

      <div className="auth-links">
        <Link href="/auth/login">Back to sign in</Link>
        <Link href="/auth/register">Create a new account</Link>
      </div>
    </div>
  );
}
