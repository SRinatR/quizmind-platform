'use client';

import Link from 'next/link';

import type { SessionSnapshot, UsageSummarySnapshot } from '../../lib/api';
import type { DashboardSection } from '../../features/dashboard/sections';
import { usePreferences } from '../../lib/preferences';

interface DashboardContentClientProps {
  session: SessionSnapshot;
  usage: UsageSummarySnapshot | null;
  visibleSections: DashboardSection[];
}

export function DashboardContentClient({
  session,
  usage,
  visibleSections,
}: DashboardContentClientProps) {
  const { t } = usePreferences();
  const td = t.dash;

  return (
    <>
      {/* ── Stats row ── */}
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">{td.account}</span>
          <p className="stat-value stat-value--sm">
            {session.user.displayName ?? session.user.email?.split('@')[0] ?? '\u2014'}
          </p>
          <p className="metric-copy">{session.user.email}</p>
        </article>

        <article className="stat-card">
          <span className="micro-label">{td.features}</span>
          <p className="stat-value">{visibleSections.length}</p>
          <p className="metric-copy">{td.accessibleSections}</p>
        </article>

        <article className="stat-card">
          <span className="micro-label">{td.session}</span>
          <p className="stat-value stat-value--sm stat-value--green">{td.active}</p>
          <p className="metric-copy">
            {session.personaKey === 'connected-user' ? td.connected : session.personaKey}
          </p>
        </article>

        <article className="stat-card">
          <span className="micro-label">{td.billing}</span>
          <p className="stat-value stat-value--sm">
            <Link href="/app/billing" className="link-subtle">{td.viewBalance}</Link>
          </p>
          <p className="metric-copy">{td.walletDesc}</p>
        </article>
      </section>

      {/* ── Usage summary ── */}
      {usage ? (
        <section className="panel">
          <div className="page-section__head">
            <span className="page-section__label">{td.usageSection}</span>
            <Link href="/app/usage" className="page-section__action-link">
              {td.viewDetails}
            </Link>
          </div>
          <div className="dashboard-quota-grid">
            {usage.quotas.slice(0, 4).map((quota) => {
              const pct =
                typeof quota.limit === 'number' && quota.limit > 0
                  ? Math.min(100, Math.round((quota.consumed / quota.limit) * 100))
                  : null;
              const fillClass =
                pct == null
                  ? 'quota-bar__fill--unknown'
                  : pct >= 90
                    ? 'quota-bar__fill--critical'
                    : pct >= 70
                      ? 'quota-bar__fill--warn'
                      : 'quota-bar__fill--ok';

              return (
                <div className="quota-row" key={quota.key}>
                  <div className="quota-row__header">
                    <span className="quota-row__label">{quota.label}</span>
                    <span className="quota-row__value">
                      {quota.consumed}
                      {typeof quota.limit === 'number' ? ` / ${quota.limit}` : ''}
                    </span>
                  </div>
                  <div className="quota-bar">
                    <div
                      className={`quota-bar__fill ${fillClass}`}
                      style={{ width: pct != null ? `${pct}%` : '100%' }}
                    />
                  </div>
                  <span className="quota-row__period">{quota.status}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ── Quick navigation ── */}
      {visibleSections.length > 0 ? (
        <section className="panel">
          <div className="page-section__head">
            <span className="page-section__label">{td.quickAccess}</span>
          </div>
          <div className="section-grid">
            {visibleSections.map((section) => (
              <Link
                key={section.id}
                href={section.href}
                className="section-card section-card--link"
              >
                <h2>{section.title}</h2>
                <p>{section.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Account + extension ── */}
      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">{td.account}</span>
          <h2>{session.user.displayName ?? session.user.email?.split('@')[0] ?? '\u2014'}</h2>
          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-row__key">Email</span>
              <span className="kv-row__value">{session.user.email}</span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">{td.session}</span>
              <span className="kv-row__value kv-row__value--green">{td.active}</span>
            </div>
          </div>
          <div className="link-row">
            <Link className="btn-ghost" href="/app/billing">{td.billing}</Link>
            <Link className="btn-ghost" href="/app/settings">{td.settings}</Link>
          </div>
        </article>

        <article className="panel dash-extension-card">
          <div className="dash-ext-header">
            <span className="micro-label">{td.extensionSection}</span>
            <span className="dash-ext-status-dot" aria-hidden="true" />
          </div>
          <h2>{td.extensionTitle}</h2>
          <p>{td.extensionDesc}</p>
          <div className="link-row">
            <Link className="btn-primary" href="/app/installations">{td.viewInstallations}</Link>
            <Link className="btn-ghost" href="/app/extension">{td.extensionSettings}</Link>
          </div>
        </article>
      </section>
    </>
  );
}

export function DashboardSignInPrompt() {
  const { t } = usePreferences();
  const td = t.dash;
  return (
    <section className="dash-signin-prompt">
      <div className="dash-signin-icon" aria-hidden="true">&#x1F510;</div>
      <div className="dash-signin-copy">
        <span className="micro-label">{td.authRequired}</span>
        <h2>{td.authRequiredHeading}</h2>
        <p>{td.authRequiredDesc}</p>
      </div>
      <div className="link-row dash-signin-actions">
        <Link className="btn-primary" href="/auth/login">{td.signIn}</Link>
        <Link className="btn-ghost" href="/">{td.backToHome}</Link>
      </div>
    </section>
  );
}
