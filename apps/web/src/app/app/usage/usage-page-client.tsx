'use client';

import Link from 'next/link';

import type { SessionSnapshot, UsageSummarySnapshot } from '../../../lib/api';
import { usePreferences } from '../../../lib/preferences';

interface UsagePageClientProps {
  session: SessionSnapshot | null;
  usage: UsageSummarySnapshot | null;
}

function formatDateTime(value?: string | null, unavailableLabel = 'Unavailable') {
  if (!value) return unavailableLabel;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function quotaTone(pct: number): 'ok' | 'warn' | 'critical' {
  if (pct >= 90) return 'critical';
  if (pct >= 70) return 'warn';
  return 'ok';
}

function eventDotClass(source: string): string {
  if (source === 'ai') return 'event-dot event-dot--ai';
  if (source === 'activity') return 'event-dot event-dot--activity';
  return 'event-dot event-dot--info';
}

export function UsagePageClient({ session, usage }: UsagePageClientProps) {
  const { t } = usePreferences();
  const tu = t.usagePage;

  function formatWindow(start?: string, end?: string) {
    if (!start || !end) return tu.windowUnavailable;
    return `${formatDateTime(start, tu.unavailable)} \u2013 ${formatDateTime(end, tu.unavailable)}`;
  }

  const highlightedQuota = usage?.quotas[0] ?? null;

  if (session && usage) {
    return (
      <>
        {/* ── Metrics ── */}
        <section className="metrics-grid">
          <article className="stat-card">
            <span className="micro-label">{tu.account}</span>
            <p className="stat-value stat-value--sm">
              {session.user.displayName ?? session.user.email?.split('@')[0] ?? '\u2014'}
            </p>
            <p className="metric-copy">{tu.usagePeriodActive}</p>
          </article>
          <article className="stat-card">
            <span className="micro-label">{tu.installations}</span>
            <p className="stat-value">{usage.installations.length}</p>
            <p className="metric-copy">{tu.extensionFleet}</p>
          </article>
          <article className="stat-card">
            <span className="micro-label">{tu.primaryQuota}</span>
            <p className="stat-value">
              {highlightedQuota
                ? `${highlightedQuota.consumed}${highlightedQuota.limit ? `/${highlightedQuota.limit}` : ''}`
                : '\u2014'}
            </p>
            <p className="metric-copy">{highlightedQuota?.label ?? tu.noQuotaTracked}</p>
          </article>
          <article className="stat-card">
            <span className="micro-label">{tu.recentEvents}</span>
            <p className="stat-value">{usage.recentEvents.length}</p>
            <p className="metric-copy">{formatWindow(usage.currentPeriodStart, usage.currentPeriodEnd)}</p>
          </article>
        </section>

        {/* ── Quotas + Fleet ── */}
        <section className="split-grid">
          <article className="panel">
            <span className="micro-label">{tu.quotas}</span>
            <h2>{tu.consumptionWindow}</h2>
            {usage.quotas.length > 0 ? (
              <div className="list-stack">
                {usage.quotas.map((quota) => {
                  const pct =
                    quota.limit && quota.limit > 0
                      ? Math.min(100, Math.round((quota.consumed / quota.limit) * 100))
                      : -1;
                  const tone = pct >= 0 ? quotaTone(pct) : 'unknown';
                  return (
                    <div className="quota-row" key={quota.key}>
                      <div className="quota-row__header">
                        <span className="quota-row__label">{quota.label}</span>
                        <span className="quota-row__value">
                          {quota.consumed}
                          {typeof quota.limit === 'number' ? ` / ${quota.limit}` : ''}
                          {pct >= 0 ? ` \u00B7 ${pct}%` : ''}
                        </span>
                      </div>
                      <div className="quota-bar">
                        <div
                          className={`quota-bar__fill quota-bar__fill--${tone}`}
                          style={{ width: pct >= 0 ? `${pct}%` : '0%' }}
                        />
                      </div>
                      <span className="quota-row__period">
                        {formatWindow(quota.periodStart, quota.periodEnd)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state"><p>{tu.noQuotaData}</p></div>
            )}
          </article>

          <article className="panel">
            <span className="micro-label">{tu.installations}</span>
            <h2>{tu.extensionFleet}</h2>
            {usage.installations.length > 0 ? (
              <div className="installation-list">
                {usage.installations.map((inst) => (
                  <div className="installation-row" key={inst.installationId}>
                    <div className="installation-row__header">
                      <span className="installation-row__id">{inst.installationId}</span>
                      <div className="installation-row__badges">
                        <span className="tag-soft">{inst.browser}</span>
                        <span className="tag-soft tag-soft--gray">v{inst.extensionVersion}</span>
                      </div>
                    </div>
                    {inst.capabilities.length > 0 ? (
                      <div className="tag-row">
                        {inst.capabilities.map((cap) => (
                          <span className="tag" key={cap}>{cap}</span>
                        ))}
                      </div>
                    ) : null}
                    <span className="installation-row__detail">
                      {tu.schema} {inst.schemaVersion} \u00B7 {tu.lastSeen} {formatDateTime(inst.lastSeenAt, tu.unavailable)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>{tu.noInstallationsYet}</p>
                <Link className="btn-ghost" href="/app/extension/connect">{tu.connectExtension}</Link>
              </div>
            )}
          </article>
        </section>

        {/* ── Activity ── */}
        <article className="panel">
          <span className="micro-label">{tu.activity}</span>
          <h2>{tu.recentTelemetry}</h2>
          {usage.recentEvents.length > 0 ? (
            <div className="event-list">
              {usage.recentEvents.map((event) => (
                <div className="event-row" key={event.id}>
                  <span className={eventDotClass(event.source)} />
                  <div className="event-row__body">
                    <span className="event-row__type">{event.eventType}</span>
                    {event.summary ? <p className="event-row__summary">{event.summary}</p> : null}
                  </div>
                  <span className="event-row__meta">
                    {formatDateTime(event.occurredAt, tu.unavailable)}
                    {event.severity ? <><br />{event.severity}</> : null}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state"><p>{tu.noEventsYet}</p></div>
          )}
          <div className="link-row">
            <Link className="btn-ghost" href="/app/history">{tu.fullHistory}</Link>
            <Link className="btn-ghost" href="/app/installations">{tu.installationsLink}</Link>
          </div>
        </article>
      </>
    );
  }

  if (session) {
    return (
      <section className="empty-state">
        <span className="micro-label">{tu.noData}</span>
        <h2>{tu.noDataHeading}</h2>
        <p>{tu.noDataDesc}</p>
      </section>
    );
  }

  return (
    <section className="empty-state">
      <span className="micro-label">{tu.signInRequired}</span>
      <h2>{tu.signInRequiredHeading}</h2>
      <p>{tu.signInRequiredDesc}</p>
      <Link className="btn-primary" href="/auth/login">{t.common.signIn}</Link>
    </section>
  );
}
