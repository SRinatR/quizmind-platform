'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  type AuthSessionsSnapshot,
  type SessionSnapshot,
} from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';
import { usePreferences } from '../../../lib/preferences';
import { AppearanceSettingsClient } from './appearance-settings-client';

type SettingsTab = 'security' | 'appearance';

interface SettingsPageClientProps {
  authSessions: AuthSessionsSnapshot | null;
  isConnectedSession: boolean;
  session: SessionSnapshot;
}

interface LogoutAllRouteResponse {
  ok: boolean;
  data?: { revoked: boolean; revokedCount: number };
  error?: { message?: string };
}

export function SettingsPageClient({
  authSessions,
  isConnectedSession,
  session,
}: SettingsPageClientProps) {
  const router = useRouter();
  const { t } = usePreferences();
  const s = t.settings;
  const [activeTab, setActiveTab] = useState<SettingsTab>('security');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sessionItems, setSessionItems] = useState(authSessions?.items ?? []);
  const [isRevokingEverywhere, setIsRevokingEverywhere] = useState(false);
  const [, startNavigation] = useTransition();

  const currentSession = sessionItems.find((item) => item.current) ?? null;

  async function handleLogoutAll() {
    setErrorMessage(null);
    setStatusMessage(s.security.signingOut);
    setIsRevokingEverywhere(true);

    try {
      const response = await fetch('/bff/auth/logout-all', { method: 'POST' });
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

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'security',   label: s.tabs.security },
    { key: 'appearance', label: s.tabs.appearance },
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
        {tabs.map((tab) => (
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

    </>
  );
}
