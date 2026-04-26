'use client';

import { useState } from 'react';
import Link from 'next/link';

import { type AiHistoryListResponse } from '@quizmind/contracts';
import type { ExchangeRateSnapshot } from '../../../lib/exchange-rates';
import { formatUtcDateTime } from '../../../lib/datetime';
import { AiRequestDetailModal } from './ai-request-detail-modal';

export interface HistoryPageClientProps {
  aiHistory: AiHistoryListResponse | null;
  effectivePage: number;
  pageSize: number;
  requestType?: string;
  requestStatus?: string;
  modelFilter?: string;
  providerFilter?: string;
  fromFilter?: string;
  toFilter?: string;
  hasSession: boolean;
  clearHref: string;
  exchangeRates: ExchangeRateSnapshot | null;
}

function statusBadgeClass(status: string): string {
  if (status === 'success') return 'tag-soft tag-soft--green';
  if (status === 'error') return 'tag-soft tag-soft--orange';
  if (status === 'quota_exceeded') return 'tag-soft tag-soft--orange';
  return 'tag-soft tag-soft--gray';
}

function requestTypeDot(requestType: string): string {
  if (requestType === 'image') return 'event-dot event-dot--ai';
  if (requestType === 'file') return 'event-dot event-dot--activity';
  return 'event-dot event-dot--info';
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function HistoryPageClient(props: HistoryPageClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    aiHistory, effectivePage, pageSize,
    requestType, requestStatus, modelFilter, providerFilter,
    fromFilter, toFilter,
    hasSession, clearHref, exchangeRates,
  } = props;

  if (!hasSession) {
    return (
      <section className="empty-state">
        <span className="micro-label">Sign in required</span>
        <h2>Sign in to view history</h2>
        <p>Your AI request history is available after signing in.</p>
      </section>
    );
  }

  const items = aiHistory?.items ?? [];
  const total = aiHistory?.total ?? 0;
  const hasNext = aiHistory ? (effectivePage - 1) * pageSize + items.length < total : false;
  const hasPrev = effectivePage > 1;

  function buildUrl(overrides: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    params.set('source', 'ai_requests');
    if (overrides.page !== undefined) params.set('page', String(overrides.page));
    else params.set('page', String(effectivePage));
    if (overrides.limit !== undefined) params.set('limit', String(overrides.limit));
    else if (pageSize !== 25) params.set('limit', String(pageSize));
    const rt = overrides.requestType !== undefined ? overrides.requestType : requestType;
    if (rt) params.set('requestType', String(rt));
    const st = overrides.status !== undefined ? overrides.status : requestStatus;
    if (st) params.set('status', String(st));
    const m = overrides.model !== undefined ? overrides.model : modelFilter;
    if (m) params.set('model', String(m));
    const pr = overrides.provider !== undefined ? overrides.provider : providerFilter;
    if (pr) params.set('provider', String(pr));
    const fr = overrides.from !== undefined ? overrides.from : fromFilter;
    if (fr) params.set('from', String(fr));
    const to = overrides.to !== undefined ? overrides.to : toFilter;
    if (to) params.set('to', String(to));
    return `/app/history?${params.toString()}`;
  }

  return (
    <>
      <section className="filter-panel">
        <div className="filter-panel__header">
          <span className="micro-label">Filters</span>
          <h2>AI Request History</h2>
        </div>
        <form method="get">
          <input type="hidden" name="source" value="ai_requests" />
          <div className="filter-grid">
            <label className="filter-field">
              <span className="filter-field__label">Type</span>
              <select defaultValue={requestType ?? ''} name="requestType">
                <option value="">all types</option>
                <option value="text">text</option>
                <option value="image">image</option>
                <option value="file">file</option>
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Status</span>
              <select defaultValue={requestStatus ?? ''} name="status">
                <option value="">all statuses</option>
                <option value="success">success</option>
                <option value="error">error</option>
                <option value="quota_exceeded">quota exceeded</option>
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Model</span>
              <input defaultValue={modelFilter ?? ''} name="model" placeholder="e.g. gpt-4o" type="text" />
            </label>
            <label className="filter-field">
              <span className="filter-field__label">From</span>
              <input defaultValue={fromFilter ?? ''} name="from" placeholder="2024-01-01" type="text" />
            </label>
            <label className="filter-field">
              <span className="filter-field__label">To</span>
              <input defaultValue={toFilter ?? ''} name="to" placeholder="2024-12-31" type="text" />
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Per page</span>
              <select defaultValue={String(pageSize)} name="limit">
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <input name="page" type="hidden" value="1" />
          <div className="filter-actions">
            <button className="btn-primary" type="submit">Apply</button>
            <Link className="btn-ghost" href={clearHref}>Reset</Link>
          </div>
        </form>
      </section>

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <div>
            <span className="micro-label">Timeline</span>
            <h2>AI Requests</h2>
          </div>
          <span className="list-muted" style={{ fontSize: '0.82rem' }}>
            {total} total &middot; page {effectivePage}
          </span>
        </div>
        {items.length > 0 ? (
          <div className="event-list">
            {items.map((item) => (
              <div
                className="event-row"
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                role="button"
                style={{ cursor: 'pointer' }}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(item.id); }}
              >
                <span className={requestTypeDot(item.requestType)} />
                <div className="event-row__body">
                  <span className="event-row__type">{item.model}</span>
                  {item.promptExcerpt ? (
                    <p className="event-row__summary" style={{ fontFamily: 'monospace', fontSize: '0.82rem', opacity: 0.8 }}>
                      {item.promptExcerpt}
                    </p>
                  ) : null}
                  {item.fileMetadata ? (
                    <span className="event-row__context">
                      {item.fileMetadata.originalName} &middot; {(item.fileMetadata.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  ) : null}
                </div>
                <div className="event-row__meta">
                  <div className="tag-row" style={{ justifyContent: 'flex-end', gap: '4px', marginBottom: '4px' }}>
                    <span className={statusBadgeClass(item.status)}>{item.status}</span>
                    <span className="tag-soft tag-soft--gray">{item.requestType}</span>
                    {item.totalTokens > 0 ? (
                      <span className="tag-soft tag-soft--gray">{formatTokens(item.totalTokens)} tok</span>
                    ) : null}
                  </div>
                  {formatUtcDateTime(item.occurredAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="micro-label">No results</span>
            <h2>No AI requests found</h2>
            <p>Adjust the filters or start using the AI extension to record history.</p>
          </div>
        )}
        <div className="filter-actions" style={{ marginTop: '16px' }}>
          {hasPrev ? (
            <Link className="btn-ghost" href={buildUrl({ page: effectivePage - 1 })}>Previous</Link>
          ) : null}
          {hasNext ? (
            <Link className="btn-ghost" href={buildUrl({ page: effectivePage + 1 })}>Next</Link>
          ) : null}
        </div>
      </section>

      {selectedId && (
        <AiRequestDetailModal id={selectedId} onClose={() => setSelectedId(null)} exchangeRates={exchangeRates} />
      )}
    </>
  );
}
