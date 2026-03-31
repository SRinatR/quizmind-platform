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
} from '../../../lib/api';
import { type DashboardSection } from '../../../features/dashboard/sections';
import { type NavigationAccessMatrixRow } from '../../../features/navigation/access-matrix';
import { formatUtcDateTime } from '../../../lib/datetime';
import { AiAccessClient } from './ai-access-client';

interface SettingsPageClientProps {
  authSessions: AuthSessionsSnapshot | null;
  isAdmin: boolean;
  isConnectedSession: boolean;
  providerCatalog: ProviderCatalogSnapshot | null;
  providerCredentialInventory: ProviderCredentialInventorySnapshot | null;
  session: SessionSnapshot;
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
  isAdmin,
  isConnectedSession,
  providerCatalog,
  providerCredentialInventory,
  session,
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
  const currentSessionCount = sessionItems.length;
  const currentSession = sessionItems.find((item) => item.current) ?? null;
  const currentDisplayName = profileState?.displayName || session.user.displayName || 'Your account';
  const currentEmail = profileState?.email ?? session.user.email;

  const blockedAccessRows = accessMatrix.filter((row) => !row.allowed);
  const allowedDashboardRows = accessMatrix.filter((row) => row.scope === 'dashboard' && row.allowed);
  const allowedAdminRows = accessMatrix.filter((row) => row.scope === 'admin' && row.allowed);

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!isConnectedSession) {
      setErrorMessage('Sign in with a connected account to update profile settings.');
      return;
    }

    setStatusMessage('Saving profile\u2026');
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
      setStatusMessage('Profile updated.');
      setIsSavingProfile(false);
    } catch {
      setStatusMessage(null);
      setErrorMessage('Unable to save profile right now. Please try again.');
      setIsSavingProfile(false);
    }
  }

  async function handleLogoutAll() {
    setErrorMessage(null);
    setStatusMessage('Signing out everywhere\u2026');
    setIsRevokingEverywhere(true);

    try {
      const response = await fetch('/api/auth/logout-all', { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as LogoutAllRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data?.revoked) {
        setIsRevokingEverywhere(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to sign out of all sessions right now.');
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
      setErrorMessage('Unable to sign out everywhere right now. Please try again.');
    }
  }

  return (
    <>
      {/* ── Global status banners ── */}
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
          <p className="stat-value stat-value--sm">Active</p>
          <p className="metric-copy">{session.user.email}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Sessions</span>
          <p className="stat-value">{currentSessionCount}</p>
          <p className="metric-copy">
            {isConnectedSession ? 'Active browser sessions' : 'Sign in to view sessions'}
          </p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Workspaces</span>
          <p className="stat-value">{session.workspaces.length}</p>
          <p className="metric-copy">{primaryWorkspace?.name ?? 'No workspace yet'}</p>
        </article>
        {isAdmin ? (
          <article className="stat-card">
            <span className="micro-label">Permissions</span>
            <p className="stat-value">{session.permissions.length}</p>
            <p className="metric-copy">Resolved capabilities</p>
          </article>
        ) : (
          <article className="stat-card">
            <span className="micro-label">Role</span>
            <p className="stat-value stat-value--sm">{primaryWorkspace?.role ?? '\u2014'}</p>
            <p className="metric-copy">{primaryWorkspace?.name ?? 'No workspace'}</p>
          </article>
        )}
      </section>

      {/* ══════════════════════════════════════════
          SECTION: Account
      ══════════════════════════════════════════ */}
      <div className="settings-section">
        <div className="settings-section__header">
          <h3 className="settings-section__title">Account</h3>
          <p className="settings-section__desc">Your profile, display name, and preferences.</p>
        </div>

        <article className="panel settings-card">
          <div className="settings-card-copy">
            <span className="micro-label">Profile</span>
            <h2>{currentDisplayName}</h2>
            <p>{currentEmail}</p>
          </div>

          <div className="tag-row">
            {isAdmin
              ? session.principal.systemRoles.map((role) => (
                  <span className="tag-soft" key={role}>{role}</span>
                ))
              : null}
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
                {isSavingProfile ? 'Saving\u2026' : 'Save profile'}
              </button>
              {!isConnectedSession ? (
                <span className="list-muted">Sign in to update your profile.</span>
              ) : (
                <span className="list-muted">Leave optional fields blank to clear.</span>
              )}
            </div>
          </form>
        </article>
      </div>

      {/* ══════════════════════════════════════════
          SECTION: Security
      ══════════════════════════════════════════ */}
      <div className="settings-section">
        <div className="settings-section__header">
          <h3 className="settings-section__title">Security</h3>
          <p className="settings-section__desc">Session management and password controls.</p>
        </div>

        <section className="settings-layout">
          <article className="panel settings-card">
            <div className="settings-card-copy">
              <span className="micro-label">Session controls</span>
              <h2>Sign out everywhere</h2>
              <p>
                Revoke all active sessions at once if a device was lost, shared, or compromised.
              </p>
            </div>

            <div className="settings-inline-actions">
              <button
                className="btn-danger"
                disabled={!isConnectedSession || isRevokingEverywhere}
                onClick={() => void handleLogoutAll()}
                type="button"
              >
                {isRevokingEverywhere ? 'Signing out\u2026' : 'Sign out everywhere'}
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
                  <span className="kv-row__key">Session expires</span>
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

          <article className="panel settings-card">
            <span className="micro-label">Active sessions</span>
            <h2>Browser sessions</h2>
            {sessionItems.length > 0 ? (
              <div className="session-list">
                {sessionItems.map((item) => (
                  <div className="session-row" key={item.id}>
                    <div className="session-row__info">
                      <span className="session-row__name">
                        {item.deviceName || item.browser || 'Unnamed session'}
                      </span>
                      <span className="session-row__detail">
                        {item.ipAddress ?? 'Unknown IP'} &middot; Expires {formatUtcDateTime(item.expiresAt)}
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
              <div className="empty-state" style={{ padding: '20px 0 0' }}>
                <p>
                  {isConnectedSession
                    ? 'No active sessions found.'
                    : 'Sign in to view your active sessions.'}
                </p>
              </div>
            )}
          </article>
        </section>
      </div>

      {/* ══════════════════════════════════════════
          SECTION: Workspace
      ══════════════════════════════════════════ */}
      <div className="settings-section">
        <div className="settings-section__header">
          <h3 className="settings-section__title">Workspace</h3>
          <p className="settings-section__desc">Your workspace membership, role, and quick links.</p>
        </div>

        <article className="panel settings-card">
          <span className="micro-label">Workspace</span>
          <h2>{primaryWorkspace?.name ?? 'No workspace'}</h2>
          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-row__key">Your role</span>
              <span className="kv-row__value">{primaryWorkspace?.role ?? '\u2014'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Accessible sections</span>
              <span className="kv-row__value">{visibleSections.length}</span>
            </div>
          </div>
          <div className="settings-inline-actions">
            <Link className="btn-ghost" href="/app/billing">Billing</Link>
            <Link className="btn-ghost" href="/app/usage">Usage</Link>
          </div>
        </article>
      </div>

      {/* ══════════════════════════════════════════
          SECTION: Access matrix — admin only
      ══════════════════════════════════════════ */}
      {isAdmin ? (
        <div className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">Access matrix</h3>
            <p className="settings-section__desc">Route-level permissions resolved for this session.</p>
          </div>

          <section className="panel settings-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <span className="micro-label">Section permissions</span>
              <div className="tag-row">
                <span className="tag-soft tag-soft--green">
                  {allowedDashboardRows.length + allowedAdminRows.length} allowed
                </span>
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
                Click &ldquo;Show all&rdquo; to inspect route-level permissions for this session.
              </p>
            )}
          </section>
        </div>
      ) : null}

      {/* ══════════════════════════════════════════
          SECTION: AI Access
      ══════════════════════════════════════════ */}
      <div className="settings-section">
        <div className="settings-section__header">
          <h3 className="settings-section__title">AI Access</h3>
          <p className="settings-section__desc">Bring-your-own-key credentials and provider policy.</p>
        </div>

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
      </div>
    </>
  );
}
