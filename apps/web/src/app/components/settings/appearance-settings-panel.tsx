'use client';

import { SUPPORTED_DISPLAY_CURRENCIES } from '../../../lib/money';
import { SUPPORTED_LOCALES } from '../../../lib/i18n/languages';
import { usePreferences } from '../../../lib/preferences';

export function AppearanceSettingsPanel({ isSignedIn }: { isSignedIn: boolean }) {
  const { prefs, t, setTheme, setLanguage, setBalanceDisplayCurrency, isSaving } =
    usePreferences();
  const s = t.settings.appearance;

  return (
    <div className="appearance-settings">
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
                <circle cx="8" cy="8" r="3.2" fill="currentColor" />
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M11.53 4.47l1.42-1.42M3.05 12.95l1.42-1.42" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
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
                <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" fill="currentColor" />
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
                <rect x="1" y="2" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5.5 14.5h5M8 11v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </span>
            <span className="pref-option__label">{s.themeSystem}</span>
          </label>
        </div>
      </div>

      <div className="pref-group">
        <div className="pref-group__header">
          <span className="pref-group__title">{s.languageTitle}</span>
          <span className="pref-group__desc">{s.languageDescription}</span>
        </div>
        <div className="currency-select-wrap">
          <label className="currency-select-label" htmlFor="languageSelect">{s.languageLabel}</label>
          <select
            id="languageSelect"
            name="language"
            className="currency-select"
            value={prefs.language}
            onChange={(event) => setLanguage(event.currentTarget.value as (typeof SUPPORTED_LOCALES)[number])}
          >
            {SUPPORTED_LOCALES.map((code) => (
              <option key={code} value={code}>{`${code.toUpperCase()} — ${s.languageNames[code] ?? code}`}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="pref-group">
        <div className="pref-group__header">
          <span className="pref-group__title">{s.currencySection}</span>
          <span className="pref-group__desc">{s.currencyDesc}</span>
        </div>
        <div className="currency-select-wrap">
          <label className="currency-select-label" htmlFor="balanceCurrencySelect">{s.currencySection}</label>
          <select
            id="balanceCurrencySelect"
            name="balanceCurrency"
            className="currency-select"
            value={prefs.balanceDisplayCurrency}
            onChange={(event) => setBalanceDisplayCurrency(event.currentTarget.value as (typeof SUPPORTED_DISPLAY_CURRENCIES)[number])}
          >
            {SUPPORTED_DISPLAY_CURRENCIES.map((code) => (
              <option key={code} value={code}>{s.currencyNames[code] ?? code}</option>
            ))}
          </select>
        </div>
        <p className="pref-hint" style={{ marginTop: '8px' }}>{s.currencyApproximateNote}</p>
      </div>

      <p className="pref-hint">
        {isSaving ? s.saving : isSignedIn ? s.savedHint : s.notSignedInHint}
      </p>
    </div>
  );
}
