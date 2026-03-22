import type { ReactNode } from 'react';
import Link from 'next/link';
import { adminNavigation, dashboardNavigation, publicNavigation } from '@quizmind/ui';

import { personaHref } from '../lib/api';
import { PersonaSwitcher } from './persona-switcher';

interface SiteShellProps {
  apiState: string;
  children: ReactNode;
  currentPersona: string;
  description: string;
  eyebrow: string;
  pathname: string;
  title: string;
}

function renderNavGroup(input: {
  title: string;
  items: Array<{ href: string; label: string }>;
  persona: string;
}) {
  return (
    <div className="nav-group">
      <span className="micro-label">{input.title}</span>
      <div className="nav-links">
        {input.items.map((item) => (
          <Link href={personaHref(item.href, input.persona)} key={`${input.title}:${item.href}`}>
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
  currentPersona,
  description,
  eyebrow,
  pathname,
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
          <PersonaSwitcher currentPersona={currentPersona} pathname={pathname} />
        </div>
        <div className="nav-cluster">
          {renderNavGroup({
            title: 'Public',
            items: publicNavigation,
            persona: currentPersona,
          })}
          {renderNavGroup({
            title: 'Dashboard',
            items: dashboardNavigation,
            persona: currentPersona,
          })}
          {renderNavGroup({
            title: 'Admin',
            items: adminNavigation,
            persona: currentPersona,
          })}
        </div>
      </header>
      <main className="content-grid">{children}</main>
    </div>
  );
}
