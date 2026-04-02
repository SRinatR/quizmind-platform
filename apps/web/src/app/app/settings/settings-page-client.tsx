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
import { usePreferences } from '../../../lib/preferences';
import { AiAccessClient } from './ai-access-client';
import { AppearanceSettingsClient } from './appearance-settings-client';

type SettingsTab = 'account' | 'security' | 'workspace' | 'aiAccess' | 'appearance' | 'accessMatrix';

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
  const { t } = usePreferences();
  const s = t.settings;
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
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
      setErrorMessage(s.errors.notConnected);
      return;
    }

    setStatusMessage(s.account.saving);
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
        setErrorMessage(payload?.error?.message ?? s.errors.unableToUpdate);
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
      setStatusMessage(s.account.savedMessage);
      setIsSavingProfile(false);
    } catch {
      setStatusMessage(null);
      setErrorMessage(s.errors.unableToSave);
      setIsSavingProfile(false);
    }
  }

  async function handleLogoutAll() {
    setErrorMessage(null);
    setStatusMessage(s.security.signingOut);
    setIsRevokingEverywhere(true);

    try {
      const response = await fetch('/api/auth/logout-all', { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as LogoutAllRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data?.revoked) {
        setIsRevokingEverywhere(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? s.errors.unableToSignOut);
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
      setErrorMessage(s.errors.unableToSignOutAll);
    }
  }

  const tabs: { key: SettingsTab; label: string; adminOnly?: boolean }[] = [
    { key: 'account',      label: s.tabs.account },
    { key: 'security',     label: s.tabs.security },
    { key: 'workspace',    label: s.tabs.workspace },
    { key: 'aiAccess',     label: s.tabs.aiAccess },
    { key: 'appearance',   label: s.tabs.appearance },
    { key: 'accessMatrix', label: s.tabs.accessMatrix, adminOnly: true },
  ];

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
          <span className="micro-label">{s.stats.email}</span>
          <p className="stat-value stat-value--sm">{s.stats.active}</p>
          <p className="metric-copy">{session.user.email}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{s.stats.sessions}</span>
          <p className="stat-value">{currentSessionCount}</p>
          <p className="metric-copy">
            {isConnectedSession ? s.stats.activeSessions : s.stats.signInToView}
          </p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{s.stats.workspaces}</span>
          <p className="stat-value">{session.workspaces.length}</p>
          <p className="metric-copy">{primaryWorkspace?.name ?? s.stats.noWorkspaceYet}</p>
        </article>
        {isAdmin ? (
          <article className="stat-card">
            <span className="micro-label">{s.stats.permissions}</span>
            <p className="stat-value">{session.permissions.length}</p>
            <p className="metric-copy">{s.stats.resolvedCapabilities}</p>
          </article>
        ) : (
          <article className="stat-card">
            <span className="micro-label">{s.stats.role}</span>
            <p className="stat-value stat-value--sm">{primaryWorkspace?.role ?? '\u2014'}</p>
            <p className="metric-copy">{primaryWorkspace?.name ?? s.stats.noWorkspace}</p>
          </article>
        )}
      </section>

      {/* ── Tab bar ── */}
      <nav className="settings-tabs" aria-label="Settings sections">
        {tabs
          .filter((tab) => !tab.adminOnly || isAdmin)
          .map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`settings-tab${activeTab === tab.key ? ' settings-tab--active' : ''}`}
              onClick={() => {
                setActiveTab(tab.key);
                setErrorMessage(null);
                setStatusMessage(null);
              }}
            >
              {tab.label}
            </button>
          ))}
      </nav>

      {/* ══════════════════════════════════════════
          TAB: Account
      ══════════════════════════════════════════ */}
      {activeTab === 'account' ? (
        <div className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">{s.account.title}</h3>
            <p className="settings-section__desc">{s.account.desc}</p>
          </div>

          <article className="panel settings-card">
            <div className="settings-card-copy">
              <span className="micro-label">{s.account.profileLabel}</span>
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
                  <span className="form-field__label">{s.account.displayNameLabel}</span>
                  <input
                    name="displayName"
                    onChange={(e) => setProfileDraft((c) => ({ ...c, displayName: e.target.value }))}
                    placeholder={s.account.displayNamePlaceholder}
                    type="text"
                    value={profileDraft.displayName}
                  />
                </label>
                <label className="form-field">
                  <span className="form-field__label">{s.account.avatarUrlLabel}</span>
                  <input
                    name="avatarUrl"
                    onChange={(e) => setProfileDraft((c) => ({ ...c, avatarUrl: e.target.value }))}
                    placeholder="https://cdn.example.com/avatar.png"
                    type="url"
                    value={profileDraft.avatarUrl}
                  />
                </label>
                <label className="form-field">
                  <span className="form-field__label">{s.account.localeLabel}</span>
                  <input
                    name="locale"
                    onChange={(e) => setProfileDraft((c) => ({ ...c, locale: e.target.value }))}
                    placeholder={s.account.localePlaceholder}
                    type="text"
                    value={profileDraft.locale}
                  />
                </label>
                <label className="form-field">
                  <span className="form-field__label">{s.account.timezoneLabel}</span>
                  <input
                    name="timezone"
                    onChange={(e) => setProfileDraft((c) => ({ ...c, timezone: e.target.value }))}
                    placeholder={s.account.timezonePlaceholder}
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
                  {isSavingProfile ? s.account.saving : s.account.saveButton}
                </button>
                {!isConnectedSession ? (
                  <span className="list-muted">{s.account.notSignedInHint}</span>
                ) : (
                  <span className="list-muted">{s.account.optionalFieldsHint}</span>
                )}
              </div>
            </form>
          </article>
        </div>
      ) : null}

      {/* ══════════════════════════════════════════
          TAB: Security
      ══════════════════════════════════════════ */}
      {activeTab === 'security' ? (
        <div className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">{s.security.title}</h3>
            <p className="settings-section__desc">{s.security.desc}</p>
          </div>

          <section className="settings-layout">
            <article className="panel settings-card">
              <div className="settings-card-copy">
                <span className="micro-label">{s.security.sessionControls}</span>
                <h2>{s.security.signOutEverywhere}</h2>
                <p>{s.security.signOutDesc}</p>
              </div>

              <div className="settings-inline-actions">
                <button
                  className="btn-danger"
                  disabled={!isConnectedSession || isRevokingEverywhere}
                  onClick={() => void handleLogoutAll()}
                  type="button"
                >
                  {isRevokingEverywhere ? s.security.signingOut : s.security.signOutEverywhere}
                </button>
                <Link className="btn-ghost" href="/auth/forgot-password">
                  {s.security.resetPassword}
                </Link>
              </div>

              {currentSession ? (
                <div className="kv-list">
                  <div className="kv-row">
                    <span className="kv-row__key">{s.security.currentBrowser}</span>
                    <span className="kv-row__value">
                      {currentSession.deviceName || currentSession.browser || s.security.unnamed}
                    </span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-row__key">{s.security.sessionExpires}</span>
                    <span className="kv-row__value">{formatUtcDateTime(currentSession.expiresAt)}</span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-row__key">{s.security.ipAddress}</span>
                    <span className="kv-row__value">{currentSession.ipAddress ?? s.security.unknown}</span>
                  </div>
                </div>
              ) : (
                <p className="list-muted">
                  {isConnectedSession
                    ? s.security.sessionUnavailable
                    : s.security.signInToManageSessions}
                </p>
              )}
            </article>

            <article className="panel settings-card">
              <span className="micro-label">{s.security.activeSessions}</span>
              <h2>{s.security.browserSessions}</h2>
              {sessionItems.length > 0 ? (
                <div className="session-list">
                  {sessionItems.map((item) => (
                    <div className="session-row" key={item.id}>
                      <div className="session-row__info">
                        <span className="session-row__name">
                          {item.deviceName || item.browser || s.security.unnamedSession}
                        </span>
                        <span className="session-row__detail">
                          {item.ipAddress ?? s.security.unknownIP} &middot; {s.security.expires}{' '}
                          {formatUtcDateTime(item.expiresAt)}
                        </span>
                      </div>
                      <div className="session-row__right">
                        {item.current ? (
                          <span className="tag-soft tag-soft--green">{s.security.current}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: '20px 0 0' }}>
                  <p>
                    {isConnectedSession
                      ? s.security.noSessions
                      : s.security.signInToViewSessions}
                  </p>
                </div>
              )}
            </article>
          </section>
        </div>
      ) : null}

      {/* ══════════════════════════════════════════
          TAB: Workspace
      ══════════════════════════════════════════ */}
      {activeTab === 'workspace' ? (
        <div className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">{s.workspace.title}</h3>
            <p className="settings-section__desc">{s.workspace.desc}</p>
          </div>

          <article className="panel settings-card">
            <span className="micro-label">{s.workspace.title}</span>
            <h2>{primaryWorkspace?.name ?? s.workspace.noWorkspace}</h2>
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-row__key">{s.workspace.yourRole}</span>
                <span className="kv-row__value">{primaryWorkspace?.role ?? '\u2014'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-row__key">{s.workspace.accessibleSections}</span>
                <span className="kv-row__value">{visibleSections.length}</span>
              </div>
            </div>
            <div className="settings-inline-actions">
              <Link className="btn-ghost" href="/app/billing">{s.workspace.billing}</Link>
              <Link className="btn-ghost" href="/app/usage">{s.workspace.usage}</Link>
            </div>
          </article>
        </div>
      ) : null}

      {/* ══════════════════════════════════════════
          TAB: AI Access
      ══════════════════════════════════════════ */}
      {activeTab === 'aiAccess' ? (
        <div className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">{s.aiAccess.title}</h3>
            <p className="settings-section__desc">{s.aiAccess.desc}</p>
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
      ) : null}

      {/* ══════════════════════════════════════════
          TAB: Appearance
      ══════════════════════════════════════════ */}
      {activeTab === 'appearance' ? (
        <div className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">{s.appearance.title}</h3>
            <p className="settings-section__desc">{s.appearance.desc}</p>
          </div>

          <article className="panel settings-card">
            <AppearanceSettingsClient isSignedIn={isConnectedSession} />
          </article>
        </div>
      ) : null}

      {/* ══════════════════════════════════════════
          TAB: Access Matrix (admin only)
      ══════════════════════════════════════════ */}
      {activeTab === 'accessMatrix' && isAdmin ? (
        <div className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">{s.accessMatrix.title}</h3>
            <p className="settings-section__desc">{s.accessMatrix.desc}</p>
          </div>

          <section className="panel settings-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <span className="micro-label">{s.accessMatrix.sectionPermissions}</span>
              <div className="tag-row">
                <span className="tag-soft tag-soft--green">
                  {allowedDashboardRows.length + allowedAdminRows.length} {s.accessMatrix.allowed}
                </span>
                {blockedAccessRows.length > 0 ? (
                  <span className="tag-soft tag-soft--orange">
                    {blockedAccessRows.length} {s.accessMatrix.blocked}
                  </span>
                ) : null}
                <button
                  className="btn-ghost"
                  onClick={() => setShowAccessMatrix((v) => !v)}
                  style={{ padding: '5px 14px', fontSize: '0.82rem' }}
                  type="button"
                >
                  {showAccessMatrix ? s.accessMatrix.hide : s.accessMatrix.showAll}
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
                {s.accessMatrix.inspectHint}
              </p>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
