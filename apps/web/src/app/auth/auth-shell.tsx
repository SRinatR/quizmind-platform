import Link from 'next/link';
import { type ReactNode } from 'react';

interface AuthShellHighlight {
  eyebrow: string;
  title: string;
  description: string;
}

interface AuthShellLink {
  href: string;
  label: string;
}

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  highlights: AuthShellHighlight[];
  links: AuthShellLink[];
  children: ReactNode;
}

export function AuthShell({ eyebrow, title, description, highlights, links, children }: AuthShellProps) {
  return (
    <div className="auth-page">
      <div className="auth-page__backdrop" />
      <div className="auth-page__shell">
        <section className="auth-panel auth-panel--brand">
          <div className="auth-brand">
            <span className="auth-brand__eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>

          <div className="auth-highlights">
            {highlights.map((highlight) => (
              <div className="auth-highlight" key={`${highlight.eyebrow}:${highlight.title}`}>
                <span className="micro-label">{highlight.eyebrow}</span>
                <strong>{highlight.title}</strong>
                <p>{highlight.description}</p>
              </div>
            ))}
          </div>

          <div className="auth-links">
            {links.map((link) => (
              <Link href={link.href} key={`${link.href}:${link.label}`}>
                {link.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="auth-panel auth-panel--form">{children}</section>
      </div>
    </div>
  );
}
