'use client';

/**
 * Per-user UI preferences system.
 *
 * Storage strategy:
 * - localStorage  — fast, available immediately, survives page reloads
 * - server profile — per-user, survives logout/login, wins over localStorage on load
 *
 * Flow:
 * 1. Provider mounts → reads localStorage for instant non-flashing apply
 * 2. Once user profile loads (settings or dashboard page) → loadFromServer()
 *    is called with the server-stored UiPreferences; server value wins
 * 3. Every change → written to localStorage AND saved to /bff/user/profile
 * 4. Different users get different localStorage keys via user-scoped writes
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { UiPreferences } from '@quizmind/contracts';

import { isSupportedCurrency, type SupportedCurrency } from './money';
import type { Translations } from './i18n/en';
import { DEFAULT_LOCALE, getTranslations, isSupportedLocale, type SupportedLocale } from './i18n/languages';

// ─── Types ──────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark' | 'system';
export type Language = SupportedLocale;
export type Density = 'comfortable' | 'compact';
export type BalanceDisplayCurrency = SupportedCurrency;

export type ResolvedPrefs = Required<UiPreferences>;

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS: ResolvedPrefs = {
  theme: 'system',
  language: DEFAULT_LOCALE,
  density: 'comfortable',
  reducedMotion: false,
  sidebarCollapsed: false,
  balanceDisplayCurrency: 'RUB',
};

const STORAGE_KEY = 'qm_prefs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readLocalPrefs(): Partial<ResolvedPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<ResolvedPrefs>;
  } catch {
    return {};
  }
}

function writeLocalPrefs(prefs: ResolvedPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota exceeded or private mode — ignore */
  }
}

function resolveEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}


function resolveLocaleCode(locale: Language): string {
  return locale.toLowerCase();
}

function applyPrefsToDOM(prefs: ResolvedPrefs): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolveEffectiveTheme(prefs.theme as Theme));
  root.setAttribute('data-density', prefs.density);
  root.setAttribute('data-motion', prefs.reducedMotion ? 'reduced' : 'full');
  root.setAttribute('lang', resolveLocaleCode(prefs.language));
}

function merge(base: ResolvedPrefs, patch: Partial<ResolvedPrefs>): ResolvedPrefs {
  const next = { ...base, ...patch };
  if (!isSupportedCurrency(next.balanceDisplayCurrency)) {
    next.balanceDisplayCurrency = 'RUB';
  }
  if (!isSupportedLocale(next.language)) {
    next.language = DEFAULT_LOCALE;
  }
  return next;
}

// ─── Context ─────────────────────────────────────────────────────────────────

export interface PrefsContextValue {
  prefs: ResolvedPrefs;
  t: Translations;
  /** Call after the signed-in user's profile is available to restore saved prefs */
  loadFromServer: (serverPrefs: UiPreferences | null | undefined) => void;
  setTheme: (v: Theme) => void;
  setLanguage: (v: Language) => void;
  setDensity: (v: Density) => void;
  setReducedMotion: (v: boolean) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setBalanceDisplayCurrency: (v: BalanceDisplayCurrency) => void;
  /** True while a save-to-server request is in flight */
  isSaving: boolean;
  /** True once client-side hydration is complete (avoids SSR mismatch) */
  isHydrated: boolean;
}

const PrefsContext = createContext<PrefsContextValue>({
  prefs: DEFAULTS,
  t: getTranslations(DEFAULT_LOCALE),
  loadFromServer: () => undefined,
  setTheme: () => undefined,
  setLanguage: () => undefined,
  setDensity: () => undefined,
  setReducedMotion: () => undefined,
  setSidebarCollapsed: () => undefined,
  setBalanceDisplayCurrency: () => undefined,
  isSaving: false,
  isHydrated: false,
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ResolvedPrefs>(DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Use a ref so saveToServer always sees the latest prefs without stale closures
  const prefsRef = useRef<ResolvedPrefs>(DEFAULTS);
  prefsRef.current = prefs;

  // ── Initial hydration from localStorage ───────────────────────────────────
  useEffect(() => {
    const local = readLocalPrefs();
    const merged = merge(DEFAULTS, local);
    setPrefs(merged);
    applyPrefsToDOM(merged);
    setIsHydrated(true);

    // Reapply theme when the OS setting changes (for theme: 'system')
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function handleOSChange() {
      setPrefs((current) => {
        applyPrefsToDOM(current); // re-resolves system theme
        return current;
      });
    }
    mq.addEventListener('change', handleOSChange);
    return () => mq.removeEventListener('change', handleOSChange);
  }, []);

  // ── Server-side preference restore ──────────────────────────────────────
  const loadFromServer = useCallback((serverPrefs: UiPreferences | null | undefined) => {
    if (!serverPrefs || typeof serverPrefs !== 'object') return;
    setPrefs((current) => {
      const next = merge(current, serverPrefs as Partial<ResolvedPrefs>);
      writeLocalPrefs(next);
      applyPrefsToDOM(next);
      return next;
    });
  }, []);

  // ── Save to server ────────────────────────────────────────────────────────
  const saveToServer = useCallback(async (fullPrefs: ResolvedPrefs) => {
    setIsSaving(true);
    try {
      await fetch('/bff/user/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uiPreferences: fullPrefs }),
      });
    } catch {
      /* Server save failure is non-critical — localStorage is the fallback */
    } finally {
      setIsSaving(false);
    }
  }, []);

  // ── Mutators ────────────────────────────────────────────────────────────────
  // Each setter: (1) updates local state, (2) writes localStorage, (3) applies to DOM,
  // (4) saves to server with the full updated prefs object.

  const applyAndSave = useCallback(
    (patch: Partial<ResolvedPrefs>) => {
      setPrefs((current) => {
        const next = merge(current, patch);
        writeLocalPrefs(next);
        applyPrefsToDOM(next);
        void saveToServer(next);
        return next;
      });
    },
    [saveToServer],
  );

  const setTheme = useCallback((v: Theme) => applyAndSave({ theme: v }), [applyAndSave]);
  const setLanguage = useCallback((v: Language) => applyAndSave({ language: v }), [applyAndSave]);
  const setDensity = useCallback((v: Density) => applyAndSave({ density: v }), [applyAndSave]);
  const setReducedMotion = useCallback(
    (v: boolean) => applyAndSave({ reducedMotion: v }),
    [applyAndSave],
  );
  const setSidebarCollapsed = useCallback(
    (v: boolean) => applyAndSave({ sidebarCollapsed: v }),
    [applyAndSave],
  );
  const setBalanceDisplayCurrency = useCallback(
    (v: BalanceDisplayCurrency) => applyAndSave({ balanceDisplayCurrency: v }),
    [applyAndSave],
  );

  const t: Translations = useMemo(() => getTranslations(prefs.language), [prefs.language]);

  const value = useMemo<PrefsContextValue>(
    () => ({
      prefs,
      t,
      loadFromServer,
      setTheme,
      setLanguage,
      setDensity,
      setReducedMotion,
      setSidebarCollapsed,
      setBalanceDisplayCurrency,
      isSaving,
      isHydrated,
    }),
    [
      prefs,
      t,
      loadFromServer,
      setTheme,
      setLanguage,
      setDensity,
      setReducedMotion,
      setSidebarCollapsed,
      setBalanceDisplayCurrency,
      isSaving,
      isHydrated,
    ],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePreferences(): PrefsContextValue {
  return useContext(PrefsContext);
}

/**
 * Drop-in component that syncs server-saved preferences into the provider.
 * Place on any page that loads the user's profile (dashboard, settings).
 */
export function ServerPrefsSync({
  serverPrefs,
}: {
  serverPrefs: UiPreferences | null | undefined;
}) {
  const { loadFromServer } = usePreferences();
  // Run once when the component mounts — restores account preferences on load
  useEffect(() => {
    loadFromServer(serverPrefs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
