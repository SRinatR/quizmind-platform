'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { adminNavigation, dashboardNavigation, publicNavigation } from '@quizmind/ui';
import { LogoutButton } from './logout-button';
import { usePreferences } from '../lib/preferences';

// Inline SVG icons for nav items — zero runtime dependency
const NAV_ICONS: Record<string, ReactNode> = {
  '/app': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="5" height="5" rx="1.5" fill="currentColor" opacity=".9"/>
      <rect x="8" y="1" width="5" height="5" rx="1.5" fill="currentColor" opacity=".5"/>
      <rect x="1" y="8" width="5" height="5" rx="1.5" fill="currentColor" opacity=".5"/>
      <rect x="8" y="8" width="5" height="5" rx="1.5" fill="currentColor" opacity=".9"/>
    </svg>
  ),
  '/app/billing': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="3.5" width="12" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M1 6.5h12" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="3" y="8.5" width="2.5" height="1.2" rx=".6" fill="currentColor" opacity=".65"/>
    </svg>
  ),
  '/app/usage': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 11L5 7.5l2.5 2L10 5.5l2 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  '/app/history': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.3" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M7 4.5V7l1.8 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  '/app/installations': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 12h4M7 9v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  '/app/settings': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="2.1" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M7 1.5V3M7 11v1.5M1.5 7H3M11 7h1.5M3.4 3.4l1.1 1.1M9.5 9.5l1.1 1.1M10.6 3.4 9.5 4.5M4.5 9.5l-1.1 1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
};

// Maps nav item hrefs to translation keys
const NAV_LABEL_KEYS: Record<string, 'overview' | 'billing' | 'usage' | 'history' | 'installations' | 'settings'> = {
  '/app':               'overview',
  '/app/billing':       'billing',
  '/app/usage':         'usage',
  '/app/history':       'history',
  '/app/installations': 'installations',
  '/app/settings':      'settings',
};

interface SiteShellProps {
  apiState: string;
  children: ReactNode;
  currentPersona: string;
  description: string;
  eyebrow: string;
  isAdmin?: boolean;
  isSignedIn?: boolean;
  pathname: string;
  showPersonaSwitcher?: boolean;
  title: string;
  /** Workspace display name shown in the topbar right cluster */
  workspaceName?: string;
  /** User display name used for avatar initials in topbar */
  userDisplayName?: string;
}

function isActiveRoute(itemHref: string, pathname: string): boolean {
  if (itemHref === '/app') {
    return pathname === '/app';
  }
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

export function SiteShell({
  apiState,
  children,
  currentPersona: _currentPersona,
  description,
  eyebrow,
  isAdmin = false,
  isSignedIn = false,
  pathname,
  showPersonaSwitcher: _showPersonaSwitcher = true,
  title,
  workspaceName,
  userDisplayName,
}: SiteShellProps) {
  const { t } = usePreferences();
  const isConnected = apiState.startsWith('Connected');
  const initials = userDisplayName ? getInitials(userDisplayName) : null;

  return (
    <div className="app-shell">
      {/* CSS-only mobile sidebar toggle — must come before siblings that use ~ selector */}
      <input
        type="checkbox"
        id="app-nav-toggle"
        className="app-nav-toggle-input"
        aria-hidden="true"
        readOnly
      />

      {/* Backdrop — clicking it closes the sidebar on mobile */}
      <label
        className="app-sidebar-backdrop"
        htmlFor="app-nav-toggle"
        aria-hidden="true"
      />

      {/* ── Left Sidebar ── */}
      <aside className="app-sidebar" aria-label="Main navigation">
        <div className="app-sidebar__header">
          <Link href="/" className="app-brand" aria-label="QuizMind home">
            QuizMind
          </Link>
          <label
            className="app-sidebar__close-btn"
            htmlFor="app-nav-toggle"
            aria-label={t.shell.closeNav}
          >
            ✕
          </label>
        </div>

        <nav className="app-sidebar__nav">
          {/* Dashboard nav group */}
          <div className="app-nav-group">
            <span className="app-nav-group__label">{t.nav.dashboardGroup}</span>
            {dashboardNavigation.map((item) => {
              const active = isActiveRoute(item.href, pathname);
              const labelKey = NAV_LABEL_KEYS[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? 'app-nav-item app-nav-item--active' : 'app-nav-item'}
                >
                  {NAV_ICONS[item.href] != null ? (
                    <span className="app-nav-item__icon" aria-hidden="true">
                      {NAV_ICONS[item.href]}
                    </span>
                  ) : null}
                  {labelKey != null ? t.nav[labelKey] : item.label}
                </Link>
              );
            })}
          </div>

          {/* Admin nav group — only rendered for admins */}
          {isAdmin ? (
            <div className="app-nav-group">
              <span className="app-nav-group__label">{t.nav.adminGroup}</span>
              {adminNavigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    isActiveRoute(item.href, pathname)
                      ? 'app-nav-item app-nav-item--active'
                      : 'app-nav-item'
                  }
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </nav>

        {/* Sidebar footer */}
        <div className="app-sidebar__footer">
          <div className="app-sidebar__footer-user">
            {initials ? (
              <span className="app-sidebar__avatar" aria-hidden="true">
                {initials}
              </span>
            ) : null}
            <p className="app-session-status" title={apiState}>
              {isConnected
                ? (userDisplayName ?? apiState.replace('Connected \u2014 ', ''))
                : t.shell.notSignedIn}
            </p>
          </div>
          {isSignedIn ? <LogoutButton /> : null}
          <div className="app-sidebar__public-links">
            {publicNavigation.slice(0, 5).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="app-sidebar__public-link"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div className="app-main">
        {/* Topbar */}
        <header className="app-topbar">
          <div className="app-topbar__left">
            {/* Hamburger — mobile only */}
            <label
              className="app-topbar__menu-btn"
              htmlFor="app-nav-toggle"
              aria-label={t.shell.openNav}
            >
              <span className="app-hamburger" aria-hidden="true" />
            </label>

            <div className="app-topbar__page-info">
              {eyebrow ? (
                <span className="app-topbar__eyebrow">{eyebrow}</span>
              ) : null}
              {eyebrow ? (
                <span className="app-topbar__sep" aria-hidden="true">/</span>
              ) : null}
              <span className="app-topbar__title">{title}</span>
            </div>
          </div>

          {/* Topbar right cluster */}
          <div className="app-topbar__right">
            {workspaceName ? (
              <span className="app-topbar__workspace-chip" title={`Workspace: ${workspaceName}`}>
                <span className="app-topbar__ws-dot" aria-hidden="true" />
                {workspaceName}
              </span>
            ) : null}
            {isConnected ? (
              <div
                className="app-topbar__avatar-btn"
                title={userDisplayName ?? 'Account'}
                aria-label="Account"
              >
                {initials ?? '?'}
              </div>
            ) : (
              <Link href="/auth/login" className="btn-ghost" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>
                {t.shell.signIn}
              </Link>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="app-content">
          {description ? (
            <p className="app-page-description">{description}</p>
          ) : null}
          <div className="content-grid">{children}</div>
        </main>
      </div>
    </div>
  );
}
