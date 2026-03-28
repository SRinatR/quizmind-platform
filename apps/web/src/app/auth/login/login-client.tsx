'use client';

import { buildAccessContext } from '@quizmind/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';

import { demoAccounts } from '../../../features/auth/demo-accounts';
import { buildAccessMatrixRows } from '../../../features/navigation/access-matrix';
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
    emailVerification: {
      required: boolean;
      emailVerifiedAt?: string | null;
    };
  };
  error?: {
    message?: string;
  };
}

export function LoginClient({ initialSession, nextPath }: LoginClientProps) {
  const router = useRouter();
  const [email, setEmail] = useState<string>(initialSession?.user.email ?? demoAccounts[0].email);
  const [password, setPassword] = useState<string>(demoAccounts[0].password);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [, startNavigation] = useTransition();

  const isAuthenticated = Boolean(initialSession);
  const sessionSystemRoles = initialSession?.principal.systemRoles ?? [];
  const registerHref = `/auth/register?next=${encodeURIComponent(nextPath)}`;
  const continueLabel = nextPath.startsWith('/app/extension/connect') ? 'Return to extension bridge' : 'Continue';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage('Signing you in...');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const payload = (await response.json().catch(() => null)) as LoginRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSubmitting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Sign-in failed. Please check the email and password.');
        return;
      }

      setStatusMessage('Session created. Redirecting to the dashboard...');

      startNavigation(() => {
        router.push(nextPath);
        router.refresh();
      });
    } catch {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the login route right now.');
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

  function applyDemoAccount(emailValue: string, passwordValue: string) {
    setEmail(emailValue);
    setPassword(passwordValue);
    setErrorMessage(null);
    setStatusMessage(null);
  }

  if (isAuthenticated && initialSession) {
    const workspaceId = initialSession.workspaces[0]?.id;
    const context = buildAccessContext(initialSession.principal);
    const sectionAccessRows = buildAccessMatrixRows({
      context,
      workspaceId,
    });
    const dashboardAccessRows = sectionAccessRows.filter((row) => row.scope === 'dashboard');
    const adminAccessRows = sectionAccessRows.filter((row) => row.scope === 'admin');
    const visibleDashboardSections = dashboardAccessRows.filter((row) => row.allowed);
    const visibleAdminSections = adminAccessRows.filter((row) => row.allowed);
    const blockedSections = sectionAccessRows.filter((row) => !row.allowed);
    const canOpenAdmin = visibleAdminSections.length > 0;
    const workspaceRoleForCurrentWorkspace = workspaceId
      ? initialSession.principal.workspaceMemberships
          .filter((membership) => membership.workspaceId === workspaceId)
          .map((membership) => membership.role)
      : [];
    const activeDemoAccount =
      demoAccounts.find((account) => account.email === initialSession.user.email.toLowerCase()) ?? null;

    return (
      <div className="auth-form-shell">
        <span className="micro-label">Active session</span>
        <h2>You are already signed in.</h2>
        <p className="auth-form-copy">
          {initialSession.user.displayName ?? initialSession.user.email} | {initialSession.user.email}
        </p>

        <div className="auth-session-card">
          <strong>{initialSession.personaLabel}</strong>
          <p>{initialSession.notes[0] ?? 'Connected session is active in this browser.'}</p>
          <div className="tag-row">
            {sessionSystemRoles.map((role) => (
              <span className="tag" key={role}>
                {role}
              </span>
            ))}
            {workspaceRoleForCurrentWorkspace.map((role) => (
              <span className="tag" key={role}>
                {role}
              </span>
            ))}
            {sessionSystemRoles.length === 0 ? <span className="tag warn">workspace-only session</span> : null}
          </div>
          {activeDemoAccount ? <p>{activeDemoAccount.highlights[0]}</p> : null}
        </div>

        <div className="auth-session-card">
          <strong>Resolved access snapshot</strong>
          <p>
            {initialSession.permissions.length} permissions | {visibleDashboardSections.length} dashboard sections |
            {' '}
            {visibleAdminSections.length} admin sections | {blockedSections.length} blocked
          </p>
          <div className="link-row">
            {visibleDashboardSections.map((section) => (
              <Link className="btn-ghost" href={section.href} key={`dashboard:${section.id}:${section.href}`}>
                {section.title}
              </Link>
            ))}
          </div>
          <div className="link-row">
            {visibleAdminSections.map((section) => (
              <Link className="btn-ghost" href={section.href} key={`admin:${section.id}:${section.href}`}>
                {section.title}
              </Link>
            ))}
          </div>
        </div>

        <div className="auth-session-card">
          <strong>Route access matrix</strong>
          <p>
            Every dashboard/admin section is listed below with its requirement and resolved access result for this
            current session.
          </p>
          <div className="list-stack">
            {sectionAccessRows.map((row) => (
              <div className="list-item" key={`${row.scope}:${row.id}`}>
                <strong>
                  {row.scope.toUpperCase()} | {row.title}
                </strong>
                <p>{row.href}</p>
                <p className="list-muted">{row.requirementSummary}</p>
                <div className="tag-row">
                  <span className={row.allowed ? 'tag' : 'tag warn'}>{row.allowed ? 'allowed' : 'blocked'}</span>
                  {!row.allowed && row.reason ? <span className="tag warn">{row.reason}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-form-actions">
          <Link className="btn-primary" href={nextPath}>
            {continueLabel}
          </Link>
          <Link className="btn-ghost" href="/app">
            Open dashboard
          </Link>
          {canOpenAdmin ? (
            <Link className="btn-ghost" href="/admin">
              Open admin
            </Link>
          ) : null}
          <button className="btn-ghost" onClick={handleLogout} type="button" disabled={isSigningOut}>
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
      <span className="micro-label">Sign in</span>
      <h2>Welcome back</h2>
      <p className="auth-form-copy">Use your QuizMind account to open the connected dashboard and admin views.</p>

      <form
        className="auth-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label className="auth-field">
          <span>Email</span>
          <input
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@quizmind.dev"
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
            placeholder="demo-password"
            type="password"
            value={password}
          />
        </label>

        <button className="btn-primary auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}
      <div className="auth-links">
        <Link href={registerHref}>Create account</Link>
        <Link href="/auth/forgot-password">Forgot password?</Link>
      </div>

      <div className="auth-demo-grid">
        {demoAccounts.map((account) => (
          <button
            className="auth-demo-card"
            key={account.email}
            onClick={() => applyDemoAccount(account.email, account.password)}
            type="button"
          >
            <span className="micro-label">{account.label}</span>
            <strong>{account.email}</strong>
            <p>Click to prefill the real login form.</p>
            <div className="tag-row">
              {account.systemRoles.map((role) => (
                <span className="tag" key={`${account.email}:system:${role}`}>
                  {role}
                </span>
              ))}
              {account.workspaceRoles.map((role) => (
                <span className="tag" key={`${account.email}:workspace:${role}`}>
                  {role}
                </span>
              ))}
              {account.systemRoles.length === 0 && account.workspaceRoles.length === 0 ? (
                <span className="tag warn">no seeded roles</span>
              ) : null}
            </div>
            <p>{account.highlights[0]}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
