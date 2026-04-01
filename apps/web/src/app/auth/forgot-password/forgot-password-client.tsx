'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { usePreferences } from '../../../lib/preferences';

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
  const { t } = usePreferences();
  const tf = t.auth.forgotPassword;
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(tf.sending);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json().catch(() => null)) as ForgotPasswordRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data?.accepted) {
        setIsSubmitting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? tf.requestError);
        return;
      }

      setSubmitted(true);
      setExpiresInMinutes(payload.data.expiresInMinutes);
      setIsSubmitting(false);
      setStatusMessage(
        `${tf.successIntro} ${email}, ${tf.successSuffix} ${payload.data.expiresInMinutes ?? 60} ${tf.expiresMinutes}`,
      );
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage(tf.serverError);
    }
  }

  if (submitted) {
    return (
      <div className="auth-form-shell">
        <span className="micro-label">{tf.successEyebrow}</span>
        <h2>{tf.successHeading}</h2>
        <p className="auth-form-copy">
          {tf.successIntro} <strong>{email}</strong>, {tf.successSuffix}{' '}
          {expiresInMinutes ?? 60} {tf.expiresMinutes}
        </p>

        <div className="auth-session-card">
          <strong>{tf.whatNext}</strong>
          <p>{tf.whatNextDesc}</p>
        </div>

        {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
        {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

        <div className="auth-form-actions">
          <Link className="btn-primary" href="/auth/login">
            {tf.backToSignIn}
          </Link>
          <Link className="btn-ghost" href="/auth/register">
            {tf.createAccount}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-form-shell">
      <span className="micro-label">{tf.eyebrow}</span>
      <h2>{tf.heading}</h2>
      <p className="auth-form-copy">{tf.subheading}</p>

      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="auth-field">
          <span>{tf.emailLabel}</span>
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
          {isSubmitting ? tf.sending : tf.submitButton}
        </button>
      </form>

      {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

      <div className="auth-links">
        <Link href="/auth/login">{tf.backToSignIn}</Link>
        <Link href="/auth/register">{tf.createAccount}</Link>
      </div>
    </div>
  );
}
