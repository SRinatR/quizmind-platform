'use client';

import Link from 'next/link';
import { useState } from 'react';

import { usePreferences } from '../../../lib/preferences';
import { AppearanceSettingsClient } from './appearance-settings-client';

type SettingsTab = 'security' | 'appearance';

interface SettingsPageClientProps {
  isConnectedSession: boolean;
}

export function SettingsPageClient({
  isConnectedSession,
}: SettingsPageClientProps) {
  const { t } = usePreferences();
  const s = t.settings;
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'appearance', label: s.tabs.appearance },
    { key: 'security',   label: s.tabs.security },
  ];

  return (
    <>
      {/* ── Tab bar ── */}
      <nav className="settings-tabs" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`settings-tab${activeTab === tab.key ? ' settings-tab--active' : ''}`}
            onClick={() => {
              setActiveTab(tab.key);
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
