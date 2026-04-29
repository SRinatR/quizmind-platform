'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  fallbackModelDisplayName,
  resolveModelDisplayName,
  type AiAnalyticsSnapshot,
} from '@quizmind/contracts';
import type { SessionSnapshot } from '../../../lib/api';
import type { ExchangeRateSnapshot } from '../../../lib/exchange-rates';
import { formatUsdAmountByPreference } from '../../../lib/money';
import { usePreferences } from '../../../lib/preferences';
import { useAutoRefresh } from '../../../lib/use-auto-refresh';
import { formatHistoryDuration } from '../history/history-duration';

interface UsagePageClientProps {
  session: SessionSnapshot | null;
  analytics: AiAnalyticsSnapshot | null;
  fromDate: string;
  toDate: string;
  exchangeRates: ExchangeRateSnapshot | null;
}

function formatDate(value: string | null | undefined, locale: 'en-US' | 'ru-RU') {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
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

export function UsagePageClient({ session, analytics, fromDate, toDate, exchangeRates }: UsagePageClientProps) {
  const { t, prefs } = usePreferences();
  const tu = t.usagePage;
  const [liveAnalytics, setLiveAnalytics] = useState<AiAnalyticsSnapshot | null>(analytics);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [modelSearchText, setModelSearchText] = useState('');
  const [isModelFilterOpen, setIsModelFilterOpen] = useState(false);
  const modelFilterRef = useRef<HTMLDivElement | null>(null);
  const refreshAnalytics = async (signal: AbortSignal) => {
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    const response = await fetch(`/bff/analytics/ai?${params.toString()}`, {
      cache: 'no-store',
      signal,
    });
    const payload = (await response.json().catch(() => null)) as { ok: boolean; data?: AiAnalyticsSnapshot; error?: { message?: string } } | null;
    if (!response.ok || !payload?.ok || !payload.data) {
      throw new Error(payload?.error?.message ?? tu.refreshFailed);
    }
    setLiveAnalytics(payload.data);
  };

  const { isRefreshing, lastUpdatedAt, error, refreshNow } = useAutoRefresh({
    enabled: Boolean(session),
    intervalMs: 30_000,
    refresh: refreshAnalytics,
    pauseWhenHidden: true,
  });

  useEffect(() => {
    setLiveAnalytics(analytics);
  }, [analytics]);

  const modelRows = useMemo(() => {
    return (liveAnalytics?.byModel ?? []).map((row) => ({
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
  }, [liveAnalytics]);

  const modelOptions = useMemo(() => {
    return [...modelRows].sort((a, b) => b.requestCount - a.requestCount);
  }, [modelRows]);

  const filteredModelOptions = useMemo(() => {
    const query = modelSearchText.trim().toLowerCase();
    if (!query) {
      return modelOptions;
    }

    return modelOptions.filter((row) => row.displayName.toLowerCase().includes(query));
  }, [modelOptions, modelSearchText]);

  useEffect(() => {
    if (!isModelFilterOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (!modelFilterRef.current?.contains(event.target as Node)) {
        setIsModelFilterOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isModelFilterOpen]);

  const modelFilterLabel = selectedModels.length === 0
    ? tu.allModels
    : selectedModels.length === 1
      ? tu.oneModelSelected
      : tu.modelsSelected.replace('{count}', String(selectedModels.length));

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
        acc.chargedCostUsd += row.chargedCostUsd ?? row.estimatedCostUsd;

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
        chargedCostUsd: 0,
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
    ? [...filteredRows].sort((a, b) => (b.chargedCostUsd ?? b.estimatedCostUsd) - (a.chargedCostUsd ?? a.estimatedCostUsd))[0]
    : null;

  const refreshStatus = error
    ? tu.refreshFailed
    : lastUpdatedAt
      ? Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000)) < 5 ? tu.updatedNow : tu.updatedAgo.replace('{seconds}', String(Math.floor((Date.now() - lastUpdatedAt) / 1000)))
      : null;

  if (session && liveAnalytics) {
    const hasModels = liveAnalytics.byModel.length > 0;

    return (
      <>
        <section className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div>
              <span className="micro-label">{tu.analytics}</span>
              <h2>{tu.overview}</h2>
            </div>
            <span style={{ fontSize: '0.82rem', opacity: 0.6 }}>
              {formatDate(liveAnalytics.from, prefs.language === 'ru' ? 'ru-RU' : 'en-US')} &ndash; {formatDate(liveAnalytics.to, prefs.language === 'ru' ? 'ru-RU' : 'en-US')}
            </span>
            <button className="btn-ghost" type="button" onClick={() => void refreshNow()} disabled={isRefreshing} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
              {isRefreshing ? tu.refreshing : tu.refresh}
            </button>
            {refreshStatus ? (
              <span style={{ fontSize: '0.78rem', opacity: 0.65 }}>{refreshStatus}</span>
            ) : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {statCard(tu.totalRequests, String(filteredTotals.totalRequests))}
            {statCard(tu.successful, String(filteredTotals.successfulRequests), `${filteredTotals.failedRequests} ${tu.failed}`)}
            {statCard(tu.totalTokens, formatTokens(filteredTotals.totalTokens), `${formatTokens(filteredTotals.totalPromptTokens)} ${tu.prompt} · ${formatTokens(filteredTotals.totalCompletionTokens)} ${tu.completion}`)}
            {statCard(tu.spend, formatUsdAmountByPreference(filteredTotals.chargedCostUsd, prefs.balanceDisplayCurrency, exchangeRates))}
            {filteredTotals.avgDurationMs !== null ? statCard(tu.avgLatency, formatHistoryDuration(filteredTotals.avgDurationMs) ?? '—') : null}
            {mostUsedModel ? statCard(tu.mostUsedModel, mostUsedModel.displayName, `${mostUsedModel.requestCount} ${tu.requests}`) : null}
            {highestCostModel ? statCard(tu.highestCostModel, highestCostModel.displayName, formatUsdAmountByPreference(highestCostModel.chargedCostUsd ?? highestCostModel.estimatedCostUsd, prefs.balanceDisplayCurrency, exchangeRates)) : null}
          </div>

          {filteredRows.length > 0 ? (
            <>
              <span className="micro-label">{tu.modelAnalytics}</span>
              <div style={{ marginTop: '8px', overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', fontSize: '0.78rem', opacity: 0.75, background: 'var(--surface-muted, #f8fafc)' }}>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{tu.model}</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{tu.requestsHeader}</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{tu.success}</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{tu.failedHeader}</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{tu.successRate}</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{tu.totalTokens}</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{tu.estimatedCost}</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{tu.avgLatency}</th>
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
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                            {formatUsdAmountByPreference(row.chargedCostUsd ?? row.estimatedCostUsd, prefs.balanceDisplayCurrency, exchangeRates)}
                          </td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>{formatHistoryDuration(row.avgDurationMs) ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <section className="empty-state" style={{ marginTop: '8px' }}>
              <span className="micro-label">{tu.noModelActivity}</span>
              <h3 style={{ marginTop: '6px' }}>{tu.noUsageForFilters}</h3>
              <p>{tu.tryDifferentModels}</p>
            </section>
          )}

          <div className="filter-actions" style={{ marginTop: '12px' }}>
            <div className="tag-row" style={{ gap: '6px', marginBottom: '8px' }}>
              {[
                { label: tu.today, days: 0 },
                { label: tu.days7, days: 7 },
                { label: tu.days30, days: 30 },
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
              {hasModels ? (
                <div ref={modelFilterRef} style={{ position: 'relative', minWidth: '210px', overflow: 'visible' }}>
                  <label className="filter-field" style={{ margin: 0 }}>
                    <span className="filter-field__label">{tu.models}</span>
                    <button
                      type="button"
                      onClick={() => setIsModelFilterOpen((open) => !open)}
                      aria-haspopup="dialog"
                      aria-expanded={isModelFilterOpen}
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border, #e5e7eb)',
                        background: 'var(--surface, #fff)',
                        color: 'inherit',
                        font: 'inherit',
                        cursor: 'pointer',
                        minHeight: '34px',
                      }}
                    >
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{modelFilterLabel}</span>
                      <span aria-hidden="true" style={{ opacity: 0.65 }}>{isModelFilterOpen ? '▲' : '▼'}</span>
                    </button>
                  </label>
                  {isModelFilterOpen ? (
                    <div
                      role="dialog"
                      aria-label={tu.modelFilters}
                      style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 6px)',
                        left: 0,
                        right: 0,
                        zIndex: 50,
                        border: '1px solid var(--border, #e5e7eb)',
                        borderRadius: '10px',
                        background: 'var(--surface, #fff)',
                        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.12)',
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <input
                        type="search"
                        value={modelSearchText}
                        onChange={(event) => setModelSearchText(event.target.value)}
                        placeholder={tu.searchModels}
                        style={{
                          width: '100%',
                          border: '1px solid var(--border, #e5e7eb)',
                          borderRadius: '7px',
                          padding: '6px 8px',
                          fontSize: '0.84rem',
                          background: 'var(--surface, #fff)',
                          color: 'inherit',
                        }}
                      />
                      <div style={{ maxHeight: '270px', overflowY: 'auto', display: 'grid', gap: '7px', paddingRight: '2px' }}>
                        {filteredModelOptions.length === 0 ? (
                          <span style={{ fontSize: '0.82rem', opacity: 0.65, padding: '2px 0' }}>{tu.noModelsFound}</span>
                        ) : null}
                        {filteredModelOptions.map((row) => {
                          const checked = selectedModels.includes(row.model);
                          return (
                            <label
                              key={row.model}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.86rem',
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  setSelectedModels((current) => {
                                    if (event.target.checked) {
                                      return [...current, row.model];
                                    }

                                    return current.filter((model) => model !== row.model);
                                  });
                                }}
                              />
                              <span>{row.displayName}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', opacity: 0.68 }}>
                          {selectedModels.length === 0
                            ? tu.allModelsIncluded
                            : selectedModels.length === 1
                              ? tu.oneModelSelected
                              : tu.modelsSelected.replace('{count}', String(selectedModels.length))}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedModels([]);
                            setModelSearchText('');
                          }}
                          disabled={selectedModels.length === 0 && modelSearchText.length === 0}
                          style={{
                            border: '1px solid var(--border, #e5e7eb)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            background: 'var(--surface, #fff)',
                            fontSize: '0.76rem',
                            cursor: selectedModels.length === 0 && modelSearchText.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: selectedModels.length === 0 && modelSearchText.length === 0 ? 0.5 : 1,
                          }}
                        >
                          {tu.clear}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <label className="filter-field" style={{ margin: 0 }}>
                <span className="filter-field__label">{tu.from}</span>
                <input type="date" name="from" defaultValue={fromDate} style={{ padding: '4px 8px' }} />
              </label>
              <label className="filter-field" style={{ margin: 0 }}>
                <span className="filter-field__label">{tu.to}</span>
                <input type="date" name="to" defaultValue={toDate} style={{ padding: '4px 8px' }} />
              </label>
              <button className="btn-primary" type="submit">{tu.refresh}</button>
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
