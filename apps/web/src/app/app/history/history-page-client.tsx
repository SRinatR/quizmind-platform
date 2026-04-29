'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { type AiHistoryAttachment, type AiHistoryListResponse } from '@quizmind/contracts';
import type { ExchangeRateSnapshot } from '../../../lib/exchange-rates';
import { formatUtcDateTime } from '../../../lib/datetime';
import { AiRequestDetailModal } from './ai-request-detail-modal';
import { getReadableModelName } from './history-model-display';
import { buildHistoryPromptDisplay, getHistoryTimelineSummary } from './history-prompt-display';
import { useAutoRefresh } from '../../../lib/use-auto-refresh';
import { usePreferences } from '../../../lib/preferences';

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


function listImageAttachments(item: AiHistoryListResponse['items'][number]): AiHistoryAttachment[] {
  return (item.attachments ?? []).filter((attachment) => attachment.kind === 'image' && attachment.role === 'prompt' && !attachment.expired && !attachment.deleted);
}

function hasUnavailablePromptImage(item: AiHistoryListResponse['items'][number]): boolean {
  return (item.attachments ?? []).some((attachment) => attachment.kind === 'image' && attachment.role === 'prompt' && (attachment.expired || attachment.deleted));
}

function toAttachmentViewUrl(itemId: string, attachmentId: string): string {
  return `/bff/history/${encodeURIComponent(itemId)}/attachments/${encodeURIComponent(attachmentId)}/view`;
}
function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function HistoryPageClient(props: HistoryPageClientProps) {
  const { t } = usePreferences();
  const th = t.historyPage;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveHistory, setLiveHistory] = useState<AiHistoryListResponse | null>(props.aiHistory);

  useEffect(() => {
    setLiveHistory(props.aiHistory);
  }, [props.aiHistory]);

  const {
    effectivePage, pageSize,
    requestType, requestStatus, modelFilter, providerFilter,
    fromFilter, toFilter,
    hasSession, clearHref, exchangeRates,
  } = props;

  const refreshHistory = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((effectivePage - 1) * pageSize),
    });
    if (requestType) params.set('requestType', requestType);
    if (requestStatus) params.set('status', requestStatus);
    if (modelFilter) params.set('model', modelFilter);
    if (providerFilter) params.set('provider', providerFilter);
    if (fromFilter) params.set('from', fromFilter);
    if (toFilter) params.set('to', toFilter);

    const res = await fetch(`/bff/history?${params.toString()}`, {
      cache: 'no-store',
      signal,
    });
    const payload = (await res.json().catch(() => null)) as { ok: boolean; data?: AiHistoryListResponse; error?: { message?: string } } | null;
    if (!res.ok || !payload?.ok || !payload.data) {
      throw new Error(payload?.error?.message ?? th.refreshFailed);
    }
    setLiveHistory(payload.data);
  }, [effectivePage, fromFilter, modelFilter, pageSize, providerFilter, requestStatus, requestType, toFilter]);

  const { isRefreshing, lastUpdatedAt, error, refreshNow } = useAutoRefresh({
    enabled: hasSession,
    intervalMs: 15_000,
    refresh: refreshHistory,
    pauseWhenHidden: true,
  });

  const refreshStatusText = useMemo(() => {
    if (error) return th.refreshFailed;
    if (!lastUpdatedAt) return null;
    const seconds = Math.floor((Date.now() - lastUpdatedAt) / 1000);
    return seconds < 5 ? th.updatedNow : th.updatedAgo.replace('{seconds}', String(seconds));
  }, [error, lastUpdatedAt, th]);

  if (!hasSession) {
    return (
      <section className="empty-state">
        <span className="micro-label">Sign in required</span>
        <h2>Sign in to view history</h2>
        <p>Your AI request history is available after signing in.</p>
      </section>
    );
  }

  const items = liveHistory?.items ?? [];
  const total = liveHistory?.total ?? 0;
  const hasNext = liveHistory ? (effectivePage - 1) * pageSize + items.length < total : false;
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
          <span className="micro-label">{th.filtersLabel}</span>
          <h2>{th.aiRequestHistory}</h2>
        </div>
        <form method="get">
          <input type="hidden" name="source" value="ai_requests" />
          <div className="filter-grid">
            <label className="filter-field">
              <span className="filter-field__label">{th.type}</span>
              <select defaultValue={requestType ?? ''} name="requestType">
                <option value="">{th.allTypes}</option>
                <option value="text">{th.textType}</option>
                <option value="image">{th.imageType}</option>
                <option value="file">{th.fileType}</option>
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.status}</span>
              <select defaultValue={requestStatus ?? ''} name="status">
                <option value="">{th.allStatuses}</option>
                <option value="success">{th.successStatus}</option>
                <option value="error">{th.errorStatus}</option>
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.model}</span>
              <input defaultValue={modelFilter ?? ''} name="model" placeholder="e.g. gpt-4o" type="text" />
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.from}</span>
              <input defaultValue={fromFilter ?? ''} name="from" placeholder="2024-01-01" type="text" />
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.to}</span>
              <input defaultValue={toFilter ?? ''} name="to" placeholder="2024-12-31" type="text" />
            </label>
            <label className="filter-field">
              <span className="filter-field__label">{th.perPage}</span>
              <select defaultValue={String(pageSize)} name="limit">
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <input name="page" type="hidden" value="1" />
          <div className="filter-actions">
            <button className="btn-primary" type="submit">{th.apply}</button>
            <Link className="btn-ghost" href={clearHref}>{th.reset}</Link>
          </div>
        </form>
      </section>

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <div>
            <span className="micro-label">{th.timeline}</span>
            <h2>{th.aiRequests}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="list-muted" style={{ fontSize: '0.82rem' }}>
              {total} {th.total} &middot; {th.page} {effectivePage}
            </span>
            <button className="btn-ghost" type="button" onClick={() => void refreshNow()} disabled={isRefreshing} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
              {isRefreshing ? th.refreshing : th.refresh}
            </button>
            {refreshStatusText ? (
              <span className="list-muted" style={{ fontSize: '0.78rem' }}>{refreshStatusText}</span>
            ) : null}
          </div>
        </div>
        {items.length > 0 ? (
          <div className="event-list">
            {items.map((item) => {
              const promptDisplay = buildHistoryPromptDisplay({
                promptContentJson: item.promptContentJson,
                promptExcerpt: item.promptExcerpt,
                requestType: item.requestType,
                attachments: item.attachments,
              });
              const summaryText = getHistoryTimelineSummary({
                cleanQuestionText: promptDisplay.cleanQuestionText,
                promptExcerpt: item.promptExcerpt,
                requestType: item.requestType,
                hasImages: promptDisplay.hasImages,
                fileMetadata: item.fileMetadata,
              });
              const imageAttachments = listImageAttachments(item);
              const hasUnavailableImage = hasUnavailablePromptImage(item);

              return (
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
                  <span className="event-row__type">{getReadableModelName(item.model)}</span>
                  {summaryText ? (
                    <p className="event-row__summary" style={{ fontSize: '0.9rem', opacity: 0.86 }}>
                      {summaryText}
                    </p>
                  ) : null}
                  {imageAttachments.length > 0 ? (
                    <img
                      alt={imageAttachments[0]?.originalName ?? th.promptImageAlt}
                      src={toAttachmentViewUrl(item.id, imageAttachments[0]!.id)}
                      style={{ marginTop: 8, width: 'min(100%, 720px)', maxHeight: 340, borderRadius: 6, objectFit: 'contain', border: '1px solid var(--color-border, #ddd)', display: 'block', background: 'var(--color-surface-alt, #f4f4f5)' }}
                    />
                  ) : null}
                  {imageAttachments.length === 0 && hasUnavailableImage ? (
                    <span className="event-row__context">{th.imageUnavailable}</span>
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
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span className="micro-label">{th.noResults}</span>
            <h2>{th.noRequestsFound}</h2>
            <p>{th.adjustFilters}</p>
          </div>
        )}
        <div className="filter-actions" style={{ marginTop: '16px' }}>
          {hasPrev ? (
            <Link className="btn-ghost" href={buildUrl({ page: effectivePage - 1 })}>{th.previous}</Link>
          ) : null}
          {hasNext ? (
            <Link className="btn-ghost" href={buildUrl({ page: effectivePage + 1 })}>{th.next}</Link>
          ) : null}
        </div>
      </section>

      {selectedId && (
        <AiRequestDetailModal id={selectedId} onClose={() => setSelectedId(null)} exchangeRates={exchangeRates} />
      )}
    </>
  );
}
