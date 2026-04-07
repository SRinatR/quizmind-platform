'use client';

import Link from 'next/link';

import type { AiAnalyticsSnapshot } from '@quizmind/contracts';
import type { SessionSnapshot, UsageSummarySnapshot } from '../../../lib/api';
import { usePreferences } from '../../../lib/preferences';

interface UsagePageClientProps {
  session: SessionSnapshot | null;
  usage: UsageSummarySnapshot | null;
  analytics: AiAnalyticsSnapshot | null;
  fromDate: string;
  toDate: string;
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

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function statCard(label: string, value: string, sub?: string) {
  return (
    <div className="stat-card" key={label} style={{
      padding: '16px',
      borderRadius: '8px',
      border: '1px solid var(--border, #e5e7eb)',
      background: 'var(--surface, #fff)',
    }}>
      <span className="micro-label">{label}</span>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      {sub ? <span style={{ fontSize: '0.78rem', opacity: 0.6 }}>{sub}</span> : null}
    </div>
  );
}

export function UsagePageClient({ session, usage, analytics, fromDate, toDate }: UsagePageClientProps) {
  const { t } = usePreferences();
  const tu = t.usagePage;

  function formatWindow(start?: string, end?: string) {
    if (!start || !end) return tu.windowUnavailable;
    return `${formatDateTime(start, tu.unavailable)} \u2013 ${formatDateTime(end, tu.unavailable)}`;
  }

  if (session && (usage || analytics)) {
    return (
      <>
        {/* ── AI Analytics ── */}
        {analytics ? (
          <section className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div>
                <span className="micro-label">AI Analytics</span>
                <h2>Usage overview</h2>
              </div>
              <span style={{ fontSize: '0.82rem', opacity: 0.6 }}>
                {formatDate(analytics.from)} &ndash; {formatDate(analytics.to)}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              {statCard('Total requests', String(analytics.totalRequests))}
              {statCard('Successful', String(analytics.successfulRequests), `${analytics.failedRequests} failed`)}
              {statCard('Total tokens', formatTokens(analytics.totalTokens), `${formatTokens(analytics.totalPromptTokens)} prompt · ${formatTokens(analytics.totalCompletionTokens)} completion`)}
              {statCard('Est. cost', `$${analytics.estimatedCostUsd.toFixed(4)}`)}
              {analytics.avgDurationMs !== null ? statCard('Avg latency', `${Math.round(analytics.avgDurationMs)}ms`) : null}
            </div>

            {analytics.byModel.length > 0 ? (
              <>
                <span className="micro-label">By model</span>
                <div className="list-stack" style={{ marginTop: '8px' }}>
                  {analytics.byModel.map((row) => (
                    <div key={`${row.provider}:${row.model}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{row.model}</span>
                        <span style={{ opacity: 0.5, marginLeft: '6px', fontSize: '0.82rem' }}>{row.provider}</span>
                      </div>
                      <div className="tag-row" style={{ gap: '6px' }}>
                        <span className="tag-soft tag-soft--gray">{row.requestCount} req</span>
                        <span className="tag-soft tag-soft--gray">{formatTokens(row.totalTokens)} tok</span>
                        <span className="tag-soft tag-soft--gray">${row.estimatedCostUsd.toFixed(4)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            <div className="filter-actions" style={{ marginTop: '12px' }}>
              {/* Quick period shortcuts */}
              <div className="tag-row" style={{ gap: '6px', marginBottom: '8px' }}>
                {[
                  { label: 'Today',    days: 0 },
                  { label: '7 days',   days: 7 },
                  { label: '30 days',  days: 30 },
                ].map(({ label, days }) => {
                  const to = new Date();
                  const from = new Date(to);
                  from.setDate(from.getDate() - days);
                  const href = `/app/usage?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`;
                  return (
                    <Link key={label} className="tag-soft tag-soft--gray" href={href}>{label}</Link>
                  );
                })}
              </div>
              <form method="get" style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label className="filter-field" style={{ margin: 0 }}>
                  <span className="filter-field__label">From</span>
                  <input type="date" name="from" defaultValue={fromDate} style={{ padding: '4px 8px' }} />
                </label>
                <label className="filter-field" style={{ margin: 0 }}>
                  <span className="filter-field__label">To</span>
                  <input type="date" name="to" defaultValue={toDate} style={{ padding: '4px 8px' }} />
                </label>
                <button className="btn-primary" type="submit">Refresh</button>
              </form>
              <Link className="btn-ghost" href="/app/history?source=ai_requests">View full history</Link>
            </div>
          </section>
        ) : null}

        {/* ── Quotas + Fleet ── */}
        {usage ? (
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
                        {tu.schema} {inst.schemaVersion} &middot; {tu.lastSeen} {formatDateTime(inst.lastSeenAt, tu.unavailable)}
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
        ) : null}

        {/* ── Recent Activity ── */}
        {usage && usage.recentEvents.length > 0 ? (
          <article className="panel">
            <span className="micro-label">{tu.activity}</span>
            <h2>{tu.recentTelemetry}</h2>
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
            <div className="link-row">
              <Link className="btn-ghost" href="/app/history">{tu.fullHistory}</Link>
              <Link className="btn-ghost" href="/app/installations">{tu.installationsLink}</Link>
            </div>
          </article>
        ) : null}
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
