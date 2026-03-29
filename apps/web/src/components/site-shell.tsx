import type { ReactNode } from 'react';
import Link from 'next/link';
import { adminNavigation, dashboardNavigation, publicNavigation } from '@quizmind/ui';

interface SiteShellProps {
  apiState: string;
  children: ReactNode;
  currentPersona: string;
  description: string;
  eyebrow: string;
  pathname: string;
  showPersonaSwitcher?: boolean;
  title: string;
}

function renderNavGroup(input: {
  title: string;
  items: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="nav-group">
      <span className="micro-label">{input.title}</span>
      <div className="nav-links">
        {input.items.map((item) => (
          <Link href={item.href} key={`${input.title}:${item.href}`}>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SiteShell({
  apiState,
  children,
  currentPersona: _currentPersona,
  description,
  eyebrow,
  pathname: _pathname,
  showPersonaSwitcher: _showPersonaSwitcher = true,
  title,
}: SiteShellProps) {
  return (
    <div className="page-shell">
      <header className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="hero-actions">
          <div className="status-pill">{apiState}</div>
        </div>
        <div className="nav-cluster">
          {renderNavGroup({
            title: 'Public',
            items: publicNavigation,
          })}
          {renderNavGroup({
            title: 'Dashboard',
            items: dashboardNavigation,
          })}
          {renderNavGroup({
            title: 'Admin',
            items: adminNavigation,
          })}
        </div>
      </header>
      <main className="content-grid">{children}</main>
    </div>
  );
}
