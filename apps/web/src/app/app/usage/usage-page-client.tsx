'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  fallbackModelDisplayName,
  resolveModelDisplayName,
  type AiAnalyticsSnapshot,
} from '@quizmind/contracts';
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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function sanitizeUserModelName(value: string, modelId: string): string {
  const sanitized = value.replace(/\b(openrouter|routerai|provider)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  if (sanitized) {
    return sanitized;
  }

  return fallbackModelDisplayName(modelId);
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
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  const modelRows = useMemo(() => {
    return (analytics?.byModel ?? []).map((row) => ({
      ...row,
      displayName: sanitizeUserModelName(
        row.displayName?.trim() || resolveModelDisplayName(row.model),
        row.model,
      ),
      successCount: row.successCount ?? 0,
      failedCount: row.failedCount ?? Math.max(row.requestCount - (row.successCount ?? 0), 0),
      totalPromptTokens: row.totalPromptTokens ?? 0,
      totalCompletionTokens: row.totalCompletionTokens ?? 0,
      avgDurationMs: row.avgDurationMs ?? null,
    }));
  }, [analytics]);

  const modelOptions = useMemo(() => {
    return [...modelRows].sort((a, b) => b.requestCount - a.requestCount);
  }, [modelRows]);

  const filteredRows = useMemo(() => {
    if (selectedModels.length === 0) {
      return modelRows;
    }

    const allowed = new Set(selectedModels);
    return modelRows.filter((row) => allowed.has(row.model));
  }, [modelRows, selectedModels]);

  const filteredTotals = useMemo(() => {
    const totals = filteredRows.reduce(
      (acc, row) => {
        acc.totalRequests += row.requestCount;
        acc.successfulRequests += row.successCount;
        acc.failedRequests += row.failedCount;
        acc.totalPromptTokens += row.totalPromptTokens;
        acc.totalCompletionTokens += row.totalCompletionTokens;
        acc.totalTokens += row.totalTokens;
        acc.estimatedCostUsd += row.estimatedCostUsd;

        if (typeof row.avgDurationMs === 'number' && Number.isFinite(row.avgDurationMs)) {
          acc.durationWeightedSum += row.avgDurationMs * row.requestCount;
          acc.durationWeight += row.requestCount;
        }

        return acc;
      },
      {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        durationWeightedSum: 0,
        durationWeight: 0,
      },
    );

    return {
      ...totals,
      avgDurationMs: totals.durationWeight > 0 ? totals.durationWeightedSum / totals.durationWeight : null,
    };
  }, [filteredRows]);

  const mostUsedModel = filteredRows.length > 0
    ? [...filteredRows].sort((a, b) => b.requestCount - a.requestCount)[0]
    : null;

  const highestCostModel = filteredRows.length > 0
    ? [...filteredRows].sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)[0]
    : null;

  if (session && analytics) {
    const hasModels = analytics.byModel.length > 0;

    return (
      <>
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

          {hasModels ? (
            <label className="filter-field" style={{ marginBottom: '14px', maxWidth: '460px' }}>
              <span className="filter-field__label">Models</span>
              <select
                multiple
                value={selectedModels}
                onChange={(event) => {
                  const values = Array.from(event.target.selectedOptions, (option) => option.value);
                  setSelectedModels(values);
                }}
                style={{ minHeight: '108px', padding: '8px', border: '1px solid var(--border, #e5e7eb)', borderRadius: '8px', background: 'var(--surface, #fff)' }}
              >
                {modelOptions.map((row) => (
                  <option key={row.model} value={row.model}>
                    {row.displayName}
                  </option>
                ))}
              </select>
              <span style={{ marginTop: '6px', fontSize: '0.75rem', opacity: 0.68, display: 'block' }}>
                {selectedModels.length === 0
                  ? 'All models selected by default.'
                  : `${selectedModels.length} model${selectedModels.length === 1 ? '' : 's'} selected.`}
              </span>
            </label>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {statCard('Total requests', String(filteredTotals.totalRequests))}
            {statCard('Successful', String(filteredTotals.successfulRequests), `${filteredTotals.failedRequests} failed`)}
            {statCard('Total tokens', formatTokens(filteredTotals.totalTokens), `${formatTokens(filteredTotals.totalPromptTokens)} prompt · ${formatTokens(filteredTotals.totalCompletionTokens)} completion`)}
            {statCard('Est. cost', `$${filteredTotals.estimatedCostUsd.toFixed(4)}`)}
            {filteredTotals.avgDurationMs !== null ? statCard('Avg latency', `${Math.round(filteredTotals.avgDurationMs)}ms`) : null}
            {mostUsedModel ? statCard('Most used model', mostUsedModel.displayName, `${mostUsedModel.requestCount} requests`) : null}
            {highestCostModel ? statCard('Highest cost model', highestCostModel.displayName, `$${highestCostModel.estimatedCostUsd.toFixed(4)}`) : null}
          </div>

          {filteredRows.length > 0 ? (
            <>
              <span className="micro-label">Model analytics</span>
              <div style={{ marginTop: '8px', overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', fontSize: '0.78rem', opacity: 0.75, background: 'var(--surface-muted, #f8fafc)' }}>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>Model</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>Requests</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>Success</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>Failed</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>Success rate</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>Total tokens</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>Estimated cost</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>Avg latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const successRate = row.requestCount > 0 ? row.successCount / row.requestCount : 0;
                      return (
                        <tr key={row.model}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', fontWeight: 600 }}>{row.displayName}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{row.requestCount}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{row.successCount}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{row.failedCount}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{formatPercent(successRate)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{formatTokens(row.totalTokens)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>${row.estimatedCostUsd.toFixed(4)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{row.avgDurationMs !== null ? `${Math.round(row.avgDurationMs)}ms` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <section className="empty-state" style={{ marginTop: '8px' }}>
              <span className="micro-label">No model activity</span>
              <h3 style={{ marginTop: '6px' }}>No usage data for selected model filters</h3>
              <p>Try selecting different models or widening your date range.</p>
            </section>
          )}

          <div className="filter-actions" style={{ marginTop: '12px' }}>
            <div className="tag-row" style={{ gap: '6px', marginBottom: '8px' }}>
              {[
                { label: 'Today', days: 0 },
                { label: '7 days', days: 7 },
                { label: '30 days', days: 30 },
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
