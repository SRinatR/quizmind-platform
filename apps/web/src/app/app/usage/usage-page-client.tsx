'use client';

import Link from 'next/link';

import type { AiAnalyticsSnapshot } from '@quizmind/contracts';
import type { SessionSnapshot } from '../../../lib/api';
import { usePreferences } from '../../../lib/preferences';

interface UsagePageClientProps {
  session: SessionSnapshot | null;
  analytics: AiAnalyticsSnapshot | null;
  fromDate: string;
  toDate: string;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
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

export function UsagePageClient({ session, analytics, fromDate, toDate }: UsagePageClientProps) {
  const { t } = usePreferences();
  const tu = t.usagePage;

  if (session && analytics) {
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
            </div>
          </section>
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
