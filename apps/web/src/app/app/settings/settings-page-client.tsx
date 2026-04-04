'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  type AuthSessionsSnapshot,
  type SessionSnapshot,
} from '../../../lib/api';
import { type NavigationAccessMatrixRow } from '../../../features/navigation/access-matrix';
import { formatUtcDateTime } from '../../../lib/datetime';
import { usePreferences } from '../../../lib/preferences';
import { AppearanceSettingsClient } from './appearance-settings-client';

type SettingsTab = 'security' | 'appearance' | 'accessMatrix';

interface SettingsPageClientProps {
  authSessions: AuthSessionsSnapshot | null;
  isAdmin: boolean;
  isConnectedSession: boolean;
  session: SessionSnapshot;
  accessMatrix: NavigationAccessMatrixRow[];
}

interface LogoutAllRouteResponse {
  ok: boolean;
  data?: { revoked: boolean; revokedCount: number };
  error?: { message?: string };
}

export function SettingsPageClient({
  authSessions,
  isAdmin,
  isConnectedSession,
  session,
  accessMatrix,
}: SettingsPageClientProps) {
  const router = useRouter();
  const { t } = usePreferences();
  const s = t.settings;
  const [activeTab, setActiveTab] = useState<SettingsTab>('security');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sessionItems, setSessionItems] = useState(authSessions?.items ?? []);
  const [isRevokingEverywhere, setIsRevokingEverywhere] = useState(false);
  const [showAccessMatrix, setShowAccessMatrix] = useState(false);
  const [, startNavigation] = useTransition();

  const currentSession = sessionItems.find((item) => item.current) ?? null;

  const blockedAccessRows = accessMatrix.filter((row) => !row.allowed);
  const allowedDashboardRows = accessMatrix.filter((row) => row.scope === 'dashboard' && row.allowed);
  const allowedAdminRows = accessMatrix.filter((row) => row.scope === 'admin' && row.allowed);

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
    { key: 'security',     label: s.tabs.security },
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
          TAB: Security
      ══════════════════════════════════════════ */}
      {activeTab === 'security' ? (
        <div className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">{s.security.title}</h3>
            <p className="settings-section__desc">{s.security.desc}</p>
          </div>

          <section className="settings-layout">
            {/* Left column: session controls + change password */}
            <div style={{ display: 'grid', gap: '16px' }}>
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
                <div className="settings-card-copy">
                  <span className="micro-label">{s.security.changePassword}</span>
                  <h2>{s.security.changePassword}</h2>
                  <p>{s.security.changePasswordDesc}</p>
                </div>
                <div className="settings-inline-actions">
                  <Link className="btn-ghost" href="/auth/forgot-password">
                    {s.security.sendResetLink}
                  </Link>
                </div>
              </article>
            </div>

            {/* Right column: active sessions list */}
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
