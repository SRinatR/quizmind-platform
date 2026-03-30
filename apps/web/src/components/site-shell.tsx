import type { ReactNode } from 'react';
import Link from 'next/link';
import { adminNavigation, dashboardNavigation, publicNavigation } from '@quizmind/ui';

interface SiteShellProps {
  apiState: string;
  children: ReactNode;
  currentPersona: string;
  description: string;
  eyebrow: string;
  isAdmin?: boolean;
  pathname: string;
  showPersonaSwitcher?: boolean;
  title: string;
}

function isActiveRoute(itemHref: string, pathname: string): boolean {
  // Exact match for root dashboard to avoid matching everything under /app
  if (itemHref === '/app') {
    return pathname === '/app';
  }
  return pathname === itemHref || pathname.startsWith(itemHref + '/');
}

export function SiteShell({
  apiState,
  children,
  currentPersona: _currentPersona,
  description,
  eyebrow,
  isAdmin = false,
  pathname,
  showPersonaSwitcher: _showPersonaSwitcher = true,
  title,
}: SiteShellProps) {
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

      {/* ── Left Sidebar ───────────────────────────────────── */}
      <aside className="app-sidebar" aria-label="Main navigation">
        <div className="app-sidebar__header">
          <Link href="/" className="app-brand" aria-label="QuizMind home">
            QuizMind
          </Link>
          {/* Close button — only visible on mobile */}
          <label
            className="app-sidebar__close-btn"
            htmlFor="app-nav-toggle"
            aria-label="Close navigation"
          >
            ✕
          </label>
        </div>

        <nav className="app-sidebar__nav">
          {/* ── Dashboard section ── */}
          <div className="app-nav-group">
            <span className="app-nav-group__label">Dashboard</span>
            {dashboardNavigation.map((item) => (
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

          {/* ── Admin section — only rendered for admin users ── */}
          {isAdmin ? (
            <div className="app-nav-group">
              <span className="app-nav-group__label">Admin</span>
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

        {/* ── Sidebar footer ── */}
        <div className="app-sidebar__footer">
          <p className="app-session-status" title={apiState}>
            {apiState}
          </p>
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

      {/* ── Main Area ──────────────────────────────────────── */}
      <div className="app-main">
        {/* Top bar */}
        <header className="app-topbar">
          <div className="app-topbar__left">
            {/* Hamburger — only visible on mobile */}
            <label
              className="app-topbar__menu-btn"
              htmlFor="app-nav-toggle"
              aria-label="Open navigation"
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
