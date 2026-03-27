'use client';

import { buildAccessContext } from '@quizmind/auth';
import { type AccessRequirement } from '@quizmind/contracts';
import { evaluateAccess } from '@quizmind/permissions';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';

import { adminSections } from '../../../features/admin/sections';
import { dashboardSections } from '../../../features/dashboard/sections';
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

const demoAccounts = [
  {
    label: 'Personal super admin',
    email: 'admin@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Platform admin',
    email: 'platform@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Support admin',
    email: 'support@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Billing admin',
    email: 'billing@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Security admin',
    email: 'security@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Ops admin',
    email: 'ops@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Content admin',
    email: 'content@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Workspace owner',
    email: 'owner@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Workspace admin',
    email: 'workspace-admin@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Billing manager',
    email: 'billing-manager@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Security manager',
    email: 'security-manager@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Workspace manager',
    email: 'manager@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Workspace analyst',
    email: 'analyst@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Workspace member',
    email: 'member@quizmind.dev',
    password: 'demo-password',
  },
  {
    label: 'Workspace viewer',
    email: 'viewer@quizmind.dev',
    password: 'demo-password',
  },
] as const;

function isRequirementAllowed(input: {
  context: ReturnType<typeof buildAccessContext>;
  workspaceId?: string;
  requirement?: AccessRequirement;
}): boolean {
  if (!input.requirement) {
    return true;
  }

  return evaluateAccess(input.context, {
    ...input.requirement,
    workspaceId: input.requirement.workspaceId ?? input.workspaceId,
  }).allowed;
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
  const sessionRoles = initialSession?.principal.systemRoles ?? [];

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
    const visibleDashboardSections = dashboardSections.filter((section) =>
      isRequirementAllowed({
        context,
        workspaceId,
        requirement: section.requirement,
      }),
    );
    const visibleAdminSections = adminSections.filter((section) =>
      isRequirementAllowed({
        context,
        workspaceId,
        requirement: section.requirement,
      }),
    );
    const canOpenAdmin = visibleAdminSections.length > 0;

    return (
      <div className="auth-form-shell">
        <span className="micro-label">Active session</span>
        <h2>You are already signed in.</h2>
        <p className="auth-form-copy">
          {initialSession.user.displayName} · {initialSession.user.email}
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

        <div className="auth-session-card">
          <strong>Resolved access snapshot</strong>
          <p>
            {initialSession.permissions.length} permissions · {visibleDashboardSections.length} dashboard sections ·{' '}
            {visibleAdminSections.length} admin sections
          </p>
          <div className="link-row">
            {visibleDashboardSections.map((section) => (
              <Link className="btn-ghost" href={section.href} key={`dashboard:${section.id}`}>
                {section.title}
              </Link>
            ))}
          </div>
          <div className="link-row">
            {visibleAdminSections.map((section) => (
              <Link className="btn-ghost" href={section.href} key={`admin:${section.id}`}>
                {section.title}
              </Link>
            ))}
          </div>
        </div>

        <div className="auth-form-actions">
          <Link className="btn-primary" href="/app">
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
        <Link href="/auth/register">Create account</Link>
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
          </button>
        ))}
      </div>
    </div>
  );
}
