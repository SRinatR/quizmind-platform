'use client';

import { useState } from 'react';
import Link from 'next/link';

import { type AiHistoryListResponse } from '@quizmind/contracts';
import type { ExchangeRateSnapshot } from '../../../lib/exchange-rates';
import { usePreferences } from '../../../lib/preferences';
import { formatUtcDateTime } from '../../../lib/datetime';
import { AiRequestDetailModal } from './ai-request-detail-modal';

interface LegacyHistoryItem {
  id: string;
  source: string;
  eventType: string;
  severity?: string;
  occurredAt: string;
  installationId?: string;
  actorId?: string;
  summary: string;
}

interface LegacyHistory {
  items: LegacyHistoryItem[];
  exportDecision: { allowed: boolean };
}

export interface HistoryPageClientProps {
  source: string;
  aiHistory: AiHistoryListResponse | null;
  legacyHistory: LegacyHistory | null;
  effectivePage: number;
  pageSize: number;
  requestType?: string;
  requestStatus?: string;
  modelFilter?: string;
  providerFilter?: string;
  fromFilter?: string;
  toFilter?: string;
  eventType?: string;
  installationId?: string;
  actorId?: string;
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
  const { t } = usePreferences();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    source, aiHistory, legacyHistory, effectivePage, pageSize,
    requestType, requestStatus, modelFilter, providerFilter,
    fromFilter, toFilter, eventType, installationId, actorId,
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

  // ── Source tab bar ────────────────────────────────────────────────────────
  function tabHref(s: string) {
    return `/app/history?source=${s}&page=1`;
  }

  const sourceTab = (
    <div className="tag-row" style={{ marginBottom: '16px' }}>
      {(['ai_requests', 'ai', 'telemetry', 'activity', 'all'] as const).map((s) => (
        <Link
          key={s}
          href={tabHref(s)}
          className={source === s ? 'tag' : 'tag-soft tag-soft--gray'}
        >
          {s === 'ai_requests' ? 'AI Requests' : s}
        </Link>
      ))}
    </div>
  );

  // ── AI Requests source ────────────────────────────────────────────────────
  if (source === 'ai_requests') {
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
        {sourceTab}

        {/* ── Filters ── */}
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

        {/* ── List ── */}
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

  // ── Legacy event log source ───────────────────────────────────────────────
  const th = t.historyPage;

  if (!legacyHistory) {
    return (
      <>
        {sourceTab}
        <section className="empty-state">
          <span className="micro-label">{th.historyAccess}</span>
          <h2>{th.noHistoryHeading}</h2>
          <p>{th.noHistoryDesc}</p>
        </section>
      </>
    );
  }

  const legacyItems = legacyHistory.items;
  const telemetryCount = legacyItems.filter((item) => item.source === 'telemetry').length;
  const activityCount = legacyItems.filter((item) => item.source === 'activity').length;
  const aiCount = legacyItems.filter((item) => item.source === 'ai').length;
  const sliceStart = (effectivePage - 1) * pageSize;
  const sliceEnd = sliceStart + pageSize;
  const visibleItems = legacyItems.slice(sliceStart, sliceEnd);
  const hasNext = legacyItems.length > sliceEnd;
  const hasPrev = effectivePage > 1;

  function legacyPageUrl(page: number) {
    const p = new URLSearchParams();
    p.set('source', source);
    p.set('page', String(page));
    if (pageSize !== 25) p.set('limit', String(pageSize));
    if (eventType) p.set('eventType', eventType);
    if (installationId && source !== 'activity') p.set('installationId', installationId);
    if (actorId && source !== 'telemetry') p.set('actorId', actorId);
    return `/app/history?${p.toString()}`;
  }

  return (
    <>
      {sourceTab}

      <section className="filter-panel">
        <div className="filter-panel__header">
          <span className="micro-label">{th.filtersLabel}</span>
          <h2>{th.queryHistory}</h2>
        </div>
        <form method="get">
          <div className="filter-grid">
            <label className="filter-field">
              <span className="filter-field__label">{th.sourceFilter}</span>
              <select defaultValue={source} name="source">
                <option value="all">all</option>
                <option value="telemetry">telemetry</option>
                <option value="activity">activity</option>
                <option value="ai">ai</option>
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.rowsPerPage}</span>
              <select defaultValue={String(pageSize)} name="limit">
                {[10, 25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.eventTypeFilter}</span>
              <input defaultValue={eventType ?? ''} name="eventType" placeholder="extension.quiz_answer_requested" type="text" />
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.installationIdFilter}</span>
              <input
                defaultValue={source === 'activity' ? '' : (installationId ?? '')}
                disabled={source === 'activity'}
                name="installationId"
                placeholder="inst_chrome_1"
                type="text"
              />
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.actorIdFilter}</span>
              <input
                defaultValue={source === 'telemetry' ? '' : (actorId ?? '')}
                disabled={source === 'telemetry'}
                name="actorId"
                placeholder="user_1"
                type="text"
              />
            </label>
          </div>
          <input name="page" type="hidden" value="1" />
          <div className="filter-actions">
            <button className="btn-primary" type="submit">{th.applyFilters}</button>
            <Link className="btn-ghost" href={clearHref}>{th.reset}</Link>
          </div>
        </form>
      </section>

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <span className="micro-label">{th.timeline}</span>
            <h2>{th.timelineTitle}</h2>
          </div>
          <div className="tag-row">
            {telemetryCount > 0 ? <span className="tag-soft tag-soft--gray">{telemetryCount} telemetry</span> : null}
            {activityCount > 0 ? <span className="tag-soft tag-soft--gray">{activityCount} activity</span> : null}
            {aiCount > 0 ? <span className="tag-soft tag-soft--gray">{aiCount} ai</span> : null}
          </div>
        </div>
        {visibleItems.length > 0 ? (
          <div className="event-list">
            {visibleItems.map((event) => (
              <div className="event-row" key={event.id}>
                <span className={
                  event.source === 'ai' ? 'event-dot event-dot--ai'
                  : event.source === 'activity' ? 'event-dot event-dot--activity'
                  : event.severity === 'warn' || event.severity === 'error' ? 'event-dot event-dot--warn'
                  : 'event-dot event-dot--info'
                } />
                <div className="event-row__body">
                  <span className="event-row__type">{event.eventType}</span>
                  {event.summary ? <p className="event-row__summary">{event.summary}</p> : null}
                  <span className="event-row__context">
                    {event.installationId ? event.installationId : th.noInstallation}
                    {event.actorId ? ` \u00B7 ${event.actorId}` : ''}
                  </span>
                </div>
                <div className="event-row__meta">
                  <div className="tag-row" style={{ justifyContent: 'flex-end', gap: '4px', marginBottom: '4px' }}>
                    <span className="tag-soft tag-soft--gray">{event.source}</span>
                    {event.severity ? (
                      <span className={
                        event.severity === 'warn' || event.severity === 'error'
                          ? 'tag-soft tag-soft--orange'
                          : 'tag-soft tag-soft--gray'
                      }>{event.severity}</span>
                    ) : null}
                  </div>
                  {formatUtcDateTime(event.occurredAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="micro-label">{th.noMatchingEvents}</span>
            <h2>{th.noMatchingEventsHeading}</h2>
            <p>{th.noMatchingEventsDesc}</p>
          </div>
        )}
        <div className="filter-actions" style={{ marginTop: '16px' }}>
          {hasPrev ? <Link className="btn-ghost" href={legacyPageUrl(effectivePage - 1)}>{th.previous}</Link> : null}
          {hasNext ? <Link className="btn-ghost" href={legacyPageUrl(effectivePage + 1)}>{th.next}</Link> : null}
        </div>
        <div className="link-row" style={{ marginTop: '8px' }}>
          <Link className="btn-ghost" href="/app/billing">{th.billing}</Link>
        </div>
      </section>
    </>
  );
}
