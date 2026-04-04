'use client';

import { usePreferences } from '../../../lib/preferences';

export function AppearanceSettingsClient({ isSignedIn }: { isSignedIn: boolean }) {
  const { prefs, t, setTheme, setLanguage, setReducedMotion, setSidebarCollapsed, isSaving } =
    usePreferences();
  const s = t.settings.appearance;

  return (
    <div className="appearance-settings">
      {/* ── Theme ── */}
      <div className="pref-group">
        <div className="pref-group__header">
          <span className="pref-group__title">{s.themeSection}</span>
          <span className="pref-group__desc">{s.themeDesc}</span>
        </div>
        <div className="pref-option-row">
          <label className={`pref-option${prefs.theme === 'light' ? ' pref-option--active' : ''}`}>
            <input
              type="radio"
              name="theme"
              value="light"
              checked={prefs.theme === 'light'}
              onChange={() => setTheme('light')}
            />
            <span className="pref-option__icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="3.2" fill="currentColor"/>
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M11.53 4.47l1.42-1.42M3.05 12.95l1.42-1.42" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </span>
            <span className="pref-option__label">{s.themeLight}</span>
          </label>

          <label className={`pref-option${prefs.theme === 'dark' ? ' pref-option--active' : ''}`}>
            <input
              type="radio"
              name="theme"
              value="dark"
              checked={prefs.theme === 'dark'}
              onChange={() => setTheme('dark')}
            />
            <span className="pref-option__icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" fill="currentColor"/>
              </svg>
            </span>
            <span className="pref-option__label">{s.themeDark}</span>
          </label>

          <label className={`pref-option${prefs.theme === 'system' ? ' pref-option--active' : ''}`}>
            <input
              type="radio"
              name="theme"
              value="system"
              checked={prefs.theme === 'system'}
              onChange={() => setTheme('system')}
            />
            <span className="pref-option__icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M5.5 14.5h5M8 11v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </span>
            <span className="pref-option__label">{s.themeSystem}</span>
          </label>
        </div>
      </div>

      {/* ── Language ── */}
      <div className="pref-group">
        <div className="pref-group__header">
          <span className="pref-group__title">{s.languageSection}</span>
          <span className="pref-group__desc">{s.languageDesc}</span>
        </div>
        <div className="pref-option-row">
          <label className={`pref-option${prefs.language === 'en' ? ' pref-option--active' : ''}`}>
            <input
              type="radio"
              name="language"
              value="en"
              checked={prefs.language === 'en'}
              onChange={() => setLanguage('en')}
            />
            <span className="pref-option__flag" aria-hidden="true">🇬🇧</span>
            <span className="pref-option__label">{s.langEn}</span>
          </label>

          <label className={`pref-option${prefs.language === 'ru' ? ' pref-option--active' : ''}`}>
            <input
              type="radio"
              name="language"
              value="ru"
              checked={prefs.language === 'ru'}
              onChange={() => setLanguage('ru')}
            />
            <span className="pref-option__flag" aria-hidden="true">🇷🇺</span>
            <span className="pref-option__label">{s.langRu}</span>
          </label>
        </div>
      </div>

      {/* ── Motion ── */}
      <div className="pref-group">
        <div className="pref-group__header">
          <span className="pref-group__title">{s.motionSection}</span>
          <span className="pref-group__desc">{s.motionDesc}</span>
        </div>
        <label className="pref-toggle">
          <input
            type="checkbox"
            checked={prefs.reducedMotion}
            onChange={(e) => setReducedMotion(e.target.checked)}
          />
          <span className="pref-toggle__track" aria-hidden="true">
            <span className="pref-toggle__thumb" />
          </span>
          <span className="pref-toggle__label">{s.motionLabel}</span>
        </label>
      </div>

      {/* ── Sidebar default ── */}
      <div className="pref-group">
        <div className="pref-group__header">
          <span className="pref-group__title">{s.sidebarSection}</span>
          <span className="pref-group__desc">{s.sidebarDesc}</span>
        </div>
        <div className="pref-option-row">
          <label className={`pref-option${!prefs.sidebarCollapsed ? ' pref-option--active' : ''}`}>
            <input
              type="radio"
              name="sidebar"
              value="expanded"
              checked={!prefs.sidebarCollapsed}
              onChange={() => setSidebarCollapsed(false)}
            />
            <span className="pref-option__icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="4.5" height="12" rx="1.2" fill="currentColor" opacity=".7"/>
                <rect x="7" y="2" width="8" height="12" rx="1.2" fill="currentColor" opacity=".2"/>
              </svg>
            </span>
            <span className="pref-option__label">{s.sidebarExpanded}</span>
          </label>

          <label className={`pref-option${prefs.sidebarCollapsed ? ' pref-option--active' : ''}`}>
            <input
              type="radio"
              name="sidebar"
              value="collapsed"
              checked={prefs.sidebarCollapsed}
              onChange={() => setSidebarCollapsed(true)}
            />
            <span className="pref-option__icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="2.2" height="12" rx="1.1" fill="currentColor" opacity=".7"/>
                <rect x="5" y="2" width="10" height="12" rx="1.2" fill="currentColor" opacity=".2"/>
              </svg>
            </span>
            <span className="pref-option__label">{s.sidebarCollapsed}</span>
          </label>
        </div>
      </div>

      {/* ── Footer hint ── */}
      <p className="pref-hint">
        {isSaving ? s.saving : isSignedIn ? s.savedHint : s.notSignedInHint}
      </p>
    </div>
  );
}
