'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface VerifyClientProps {
  email?: string;
  initialVerified: boolean;
  initialSent: boolean;
  nextPath: string;
  token?: string;
}

interface VerifyEmailRouteResponse {
  ok: boolean;
  data?: {
    verified: boolean;
    emailVerifiedAt: string;
  };
  error?: {
    message?: string;
  };
}

type VerifyPhase = 'idle' | 'verifying' | 'verified' | 'error';

export function VerifyClient({ email, initialVerified, initialSent, nextPath, token }: VerifyClientProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<VerifyPhase>(initialVerified ? 'verified' : initialSent ? 'idle' : 'idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(
    initialVerified ? 'Email verified. Your account is ready to use.' : null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasAttemptedVerification = useRef(false);

  useEffect(() => {
    if (!token || initialVerified || hasAttemptedVerification.current) {
      return;
    }

    hasAttemptedVerification.current = true;
    setPhase('verifying');
    setStatusMessage('Verifying your email...');
    setErrorMessage(null);

    void (async () => {
      try {
        const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
          method: 'GET',
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => null)) as VerifyEmailRouteResponse | null;

        if (!response.ok || !payload?.ok || !payload.data?.verified) {
          setPhase('error');
          setStatusMessage(null);
          setErrorMessage(payload?.error?.message ?? 'Unable to verify this email link.');
          return;
        }

        setPhase('verified');
        setStatusMessage('Email verified. Redirecting to a clean confirmation URL...');
        const params = new URLSearchParams({
          verified: '1',
          next: nextPath,
        });

        if (email) {
          params.set('email', email);
        }

        router.replace(`/auth/verify?${params.toString()}`);
      } catch {
        setPhase('error');
        setStatusMessage(null);
        setErrorMessage('Unable to reach the email verification route right now.');
      }
    })();
  }, [email, initialVerified, nextPath, router, token]);

  if (phase === 'verifying') {
    return (
      <div className="auth-form-shell">
        <span className="micro-label">Verifying</span>
        <h2>Checking your verification link</h2>
        <p className="auth-form-copy">This usually takes a moment while the API confirms the token and updates your user record.</p>
        {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      </div>
    );
  }

  if (phase === 'verified' || initialVerified) {
    return (
      <div className="auth-form-shell">
        <span className="micro-label">Verified</span>
        <h2>Your email is confirmed.</h2>
        <p className="auth-form-copy">
          {email ? `The inbox for ${email} is now verified.` : 'The verification token has been accepted.'}
        </p>

        <div className="auth-session-card">
          <strong>What changed</strong>
          <p>Your connected account can now use the full auth lifecycle, including recovery and future security checks.</p>
        </div>

        {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}

        <div className="auth-form-actions">
          <Link className="btn-primary" href={nextPath}>
            Continue
          </Link>
          <Link className="btn-ghost" href="/auth/login">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="auth-form-shell">
        <span className="micro-label">Verification error</span>
        <h2>This verification link could not be completed.</h2>
        <p className="auth-form-copy">
          The link may already be used, expired, or malformed. You can still sign in or start again from registration.
        </p>

        {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

        <div className="auth-form-actions">
          <Link className="btn-primary" href="/auth/login">
            Sign in
          </Link>
          <Link className="btn-ghost" href="/auth/register">
            Create account again
          </Link>
        </div>
      </div>
    );
  }

  if (initialSent) {
    return (
      <div className="auth-form-shell">
        <span className="micro-label">Check your inbox</span>
        <h2>Verification email sent</h2>
        <p className="auth-form-copy">
          {email
            ? `We sent a verification link to ${email}. Open it to finish activating the account.`
            : 'We sent a verification link to the account email. Open it to finish activating the account.'}
        </p>

        <div className="auth-session-card">
          <strong>Before you continue</strong>
          <p>Verification unlocks the full recovery flow and keeps account ownership tied to a real inbox.</p>
        </div>

        <div className="auth-form-actions">
          <Link className="btn-primary" href={nextPath}>
            Open app anyway
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
      <span className="micro-label">Verification</span>
      <h2>Open the link from your email</h2>
      <p className="auth-form-copy">
        This page is meant to be opened from a verification email. If you just created an account, return to sign in or register again.
      </p>

      <div className="auth-form-actions">
        <Link className="btn-primary" href="/auth/register">
          Create account
        </Link>
        <Link className="btn-ghost" href="/auth/login">
          Sign in
        </Link>
      </div>
    </div>
  );
}
