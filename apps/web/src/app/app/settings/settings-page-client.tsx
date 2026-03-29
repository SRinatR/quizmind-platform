'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';

import {
  type AuthSessionsSnapshot,
  type ProviderCatalogSnapshot,
  type ProviderCredentialInventorySnapshot,
  type SessionSnapshot,
  type UserProfileSnapshot,
  type WorkspaceSubscriptionSnapshot,
} from '../../../lib/api';
import { type DashboardSection } from '../../../features/dashboard/sections';
import { type NavigationAccessMatrixRow } from '../../../features/navigation/access-matrix';
import { formatUtcDateTime } from '../../../lib/datetime';
import { AiAccessClient } from './ai-access-client';

interface SettingsPageClientProps {
  authSessions: AuthSessionsSnapshot | null;
  isConnectedSession: boolean;
  providerCatalog: ProviderCatalogSnapshot | null;
  providerCredentialInventory: ProviderCredentialInventorySnapshot | null;
  session: SessionSnapshot;
  subscription: WorkspaceSubscriptionSnapshot | null;
  userProfile: UserProfileSnapshot | null;
  visibleSections: DashboardSection[];
  accessMatrix: NavigationAccessMatrixRow[];
}

interface LogoutAllRouteResponse {
  ok: boolean;
  data?: { revoked: boolean; revokedCount: number };
  error?: { message?: string };
}

interface UserProfileRouteResponse {
  ok: boolean;
  data?: UserProfileSnapshot;
  error?: { message?: string };
}

function normalizeProfileInput(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function SettingsPageClient({
  authSessions,
  isConnectedSession,
  providerCatalog,
  providerCredentialInventory,
  session,
  subscription,
  userProfile,
  visibleSections,
  accessMatrix,
}: SettingsPageClientProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [profileState, setProfileState] = useState<UserProfileSnapshot | null>(userProfile);
  const [profileDraft, setProfileDraft] = useState({
    displayName: userProfile?.displayName ?? session.user.displayName ?? '',
    avatarUrl: userProfile?.avatarUrl ?? '',
    locale: userProfile?.locale ?? '',
    timezone: userProfile?.timezone ?? '',
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [sessionItems, setSessionItems] = useState(authSessions?.items ?? []);
  const [isRevokingEverywhere, setIsRevokingEverywhere] = useState(false);
  const [showAccessMatrix, setShowAccessMatrix] = useState(false);
  const [, startNavigation] = useTransition();

  const primaryWorkspace = session.workspaces[0] ?? null;
  const currentSubscription = subscription?.summary ?? null;
  const currentSessionCount = sessionItems.length;
  const currentSession = sessionItems.find((item) => item.current) ?? null;
  const isVerified = Boolean(session.user.emailVerifiedAt);
  const currentDisplayName = profileState?.displayName || session.user.displayName || 'Connected account';
  const currentEmail = profileState?.email ?? session.user.email;
  const blockedAccessRows = accessMatrix.filter((row) => !row.allowed);
  const allowedDashboardRows = accessMatrix.filter((row) => row.scope === 'dashboard' && row.allowed);
  const allowedAdminRows = accessMatrix.filter((row) => row.scope === 'admin' && row.allowed);

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!isConnectedSession) {
      setErrorMessage('Connected session required to update profile settings.');
      return;
    }

    setStatusMessage('Saving profile...');
    setIsSavingProfile(true);

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: normalizeProfileInput(profileDraft.displayName),
          avatarUrl: normalizeProfileInput(profileDraft.avatarUrl),
          locale: normalizeProfileInput(profileDraft.locale),
          timezone: normalizeProfileInput(profileDraft.timezone),
        }),
      });
      const payload = (await response.json().catch(() => null)) as UserProfileRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to update profile settings right now.');
        setIsSavingProfile(false);
        return;
      }

      setProfileState(payload.data);
      setProfileDraft({
        displayName: payload.data.displayName ?? '',
        avatarUrl: payload.data.avatarUrl ?? '',
        locale: payload.data.locale ?? '',
        timezone: payload.data.timezone ?? '',
      });
      setStatusMessage('Profile updated successfully.');
      setIsSavingProfile(false);
    } catch {
      setStatusMessage(null);
      setErrorMessage('Unable to reach the profile settings route right now.');
      setIsSavingProfile(false);
    }
  }

  async function handleLogoutAll() {
    setErrorMessage(null);
    setStatusMessage('Ending all sessions...');
    setIsRevokingEverywhere(true);

    try {
      const response = await fetch('/api/auth/logout-all', { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as LogoutAllRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data?.revoked) {
        setIsRevokingEverywhere(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to revoke active sessions right now.');
        return;
      }

      setSessionItems([]);
      startNavigation(() => {
        router.push('/auth/login?next=/app/settings');
        router.refresh();
      });
    } catch {
      setIsRevokingEverywhere(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the logout-all route right now.');
    }
  }

  return (
    <>
      {/* ── Banners ── */}
      {statusMessage ? (
        <div className="banner banner-info">{statusMessage}</div>
      ) : null}
      {errorMessage ? (
        <div className="banner banner-error">{errorMessage}</div>
      ) : null}

      {/* ── Stats row ── */}
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">Email</span>
          <p className="stat-value">{isVerified ? 'Verified' : 'Pending'}</p>
          <p className="metric-copy">
            {isVerified
              ? formatUtcDateTime(session.user.emailVerifiedAt)
              : 'Check your inbox to verify.'}
          </p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Sessions</span>
          <p className="stat-value">{currentSessionCount}</p>
          <p className="metric-copy">
            {isConnectedSession ? 'Active browser sessions' : 'Persona preview only'}
          </p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Workspaces</span>
          <p className="stat-value">{session.workspaces.length}</p>
          <p className="metric-copy">{primaryWorkspace?.name ?? 'No workspace yet'}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Permissions</span>
          <p className="stat-value">{session.permissions.length}</p>
          <p className="metric-copy">Resolved from backend policy</p>
        </article>
      </section>

      {/* ── Account + Security ── */}
      <section className="settings-layout">
        {/* Profile card */}
        <article className="panel settings-card">
          <div className="settings-card-copy">
            <span className="micro-label">Account</span>
            <h2>{currentDisplayName}</h2>
            <p>{currentEmail}</p>
          </div>

          <div className="tag-row">
            <span className={isVerified ? 'tag-soft tag-soft--green' : 'tag-soft tag-soft--orange'}>
              {isVerified ? 'Email verified' : 'Verification pending'}
            </span>
            {session.principal.systemRoles.map((role) => (
              <span className="tag-soft" key={role}>{role}</span>
            ))}
            {session.principal.systemRoles.length === 0 ? (
              <span className="tag-soft tag-soft--gray">Workspace-only account</span>
            ) : null}
          </div>

          <form className="settings-profile-form" onSubmit={(event) => void handleProfileSave(event)}>
            <div className="form-grid">
              <label className="form-field">
                <span className="form-field__label">Display name</span>
                <input
                  name="displayName"
                  onChange={(e) => setProfileDraft((c) => ({ ...c, displayName: e.target.value }))}
                  placeholder="Your name"
                  type="text"
                  value={profileDraft.displayName}
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">Avatar URL</span>
                <input
                  name="avatarUrl"
                  onChange={(e) => setProfileDraft((c) => ({ ...c, avatarUrl: e.target.value }))}
                  placeholder="https://cdn.example.com/avatar.png"
                  type="url"
                  value={profileDraft.avatarUrl}
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">Locale</span>
                <input
                  name="locale"
                  onChange={(e) => setProfileDraft((c) => ({ ...c, locale: e.target.value }))}
                  placeholder="en-US"
                  type="text"
                  value={profileDraft.locale}
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">Timezone</span>
                <input
                  name="timezone"
                  onChange={(e) => setProfileDraft((c) => ({ ...c, timezone: e.target.value }))}
                  placeholder="UTC"
                  type="text"
                  value={profileDraft.timezone}
                />
              </label>
            </div>
            <div className="settings-inline-actions">
              <button
                className="btn-primary"
                disabled={!isConnectedSession || isSavingProfile}
                type="submit"
              >
                {isSavingProfile ? 'Saving...' : 'Save profile'}
              </button>
              {!isConnectedSession ? (
                <span className="list-muted">Connected session required.</span>
              ) : (
                <span className="list-muted">Leave optional fields blank to clear.</span>
              )}
            </div>
          </form>
        </article>

        {/* Security card */}
        <article className="panel settings-card">
          <div className="settings-card-copy">
            <span className="micro-label">Security</span>
            <h2>Session controls</h2>
            <p>
              Sign out of all browsers at once if a device was lost, shared, or compromised.
            </p>
          </div>

          <div className="settings-inline-actions">
            <button
              className="btn-danger"
              disabled={!isConnectedSession || isRevokingEverywhere}
              onClick={() => void handleLogoutAll()}
              type="button"
            >
              {isRevokingEverywhere ? 'Signing out...' : 'Sign out everywhere'}
            </button>
            <Link className="btn-ghost" href="/auth/forgot-password">
              Reset password
            </Link>
          </div>

          {currentSession ? (
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-row__key">Current browser</span>
                <span className="kv-row__value">
                  {currentSession.deviceName || currentSession.browser || 'Unnamed'}
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-row__key">Expires</span>
                <span className="kv-row__value">{formatUtcDateTime(currentSession.expiresAt)}</span>
              </div>
              <div className="kv-row">
                <span className="kv-row__key">IP address</span>
                <span className="kv-row__value">{currentSession.ipAddress ?? 'Unknown'}</span>
              </div>
            </div>
          ) : (
            <p className="list-muted">
              {isConnectedSession
                ? 'Current session details unavailable.'
                : 'Sign in with a connected account to manage live sessions.'}
            </p>
          )}
        </article>
      </section>

      {/* ── Active sessions ── */}
      <section className="split-grid">
        <article className="panel settings-card">
          <span className="micro-label">Active sessions</span>
          <h2>Browser inventory</h2>
          {sessionItems.length > 0 ? (
            <div className="session-list">
              {sessionItems.map((item) => (
                <div className="session-row" key={item.id}>
                  <div className="session-row__info">
                    <span className="session-row__name">
                      {item.deviceName || item.browser || 'Unnamed session'}
                    </span>
                    <span className="session-row__detail">
                      {item.ipAddress ?? 'Unknown IP'} · Expires {formatUtcDateTime(item.expiresAt)}
                    </span>
                  </div>
                  <div className="session-row__right">
                    {item.current ? (
                      <span className="tag-soft tag-soft--green">current</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>
                {isConnectedSession
                  ? 'No active sessions found.'
                  : 'Session inventory requires a connected account.'}
              </p>
            </div>
          )}
        </article>

        {/* Workspace snapshot */}
        <article className="panel settings-card">
          <span className="micro-label">Workspace</span>
          <h2>{primaryWorkspace?.name ?? 'No workspace'}</h2>
          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-row__key">Role</span>
              <span className="kv-row__value">{primaryWorkspace?.role ?? '—'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Plan</span>
              <span className="kv-row__value">
                {currentSubscription
                  ? `${currentSubscription.planCode} · ${currentSubscription.status}`
                  : 'Unavailable'}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Billing interval</span>
              <span className="kv-row__value">
                {currentSubscription?.billingInterval ?? '—'}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Visible sections</span>
              <span className="kv-row__value">{visibleSections.length}</span>
            </div>
          </div>
          <div className="settings-inline-actions">
            <Link className="btn-ghost" href="/app/billing">Billing</Link>
            <Link className="btn-ghost" href="/app/usage">Usage</Link>
          </div>
        </article>
      </section>

      {/* ── Access matrix (collapsible) ── */}
      <section className="panel settings-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <span className="micro-label">Access matrix</span>
            <h2>Section permissions</h2>
          </div>
          <div className="tag-row">
            <span className="tag-soft tag-soft--green">{allowedDashboardRows.length + allowedAdminRows.length} allowed</span>
            {blockedAccessRows.length > 0 ? (
              <span className="tag-soft tag-soft--orange">{blockedAccessRows.length} blocked</span>
            ) : null}
            <button
              className="btn-ghost"
              onClick={() => setShowAccessMatrix((v) => !v)}
              style={{ padding: '5px 14px', fontSize: '0.82rem' }}
              type="button"
            >
              {showAccessMatrix ? 'Hide' : 'Show all'}
            </button>
          </div>
        </div>

        {showAccessMatrix ? (
          <div className="access-matrix">
            {accessMatrix.map((row) => (
              <div className="access-row" key={`settings-matrix:${row.scope}:${row.id}`}>
                <span className={row.allowed ? 'access-row__dot access-row__dot--allowed' : 'access-row__dot access-row__dot--blocked'} />
                <span className="access-row__title">{row.title}</span>
                <span className="access-row__scope">{row.scope}</span>
                {!row.allowed && row.reason ? (
                  <span className="access-row__reason">{row.reason}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="list-muted" style={{ fontSize: '0.88rem' }}>
            Click &ldquo;Show all&rdquo; to inspect route-level allow/deny decisions for this session.
          </p>
        )}
      </section>

      {/* ── AI provider credentials ── */}
      <AiAccessClient
        currentWorkspaceId={primaryWorkspace?.id}
        isConnectedSession={isConnectedSession}
        providerCatalog={providerCatalog}
        providerCredentialInventory={providerCredentialInventory}
        workspaceOptions={session.workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          role: workspace.role,
        }))}
      />
    </>
  );
}
