'use client';

import {
  adminWebhookProviderFilters,
  adminWebhookStatusFilters,
  type AdminWebhookFilters,
  type AdminWebhookRetryResult,
} from '@quizmind/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { type AdminWebhooksStateSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

interface Props {
  snapshot: AdminWebhooksStateSnapshot;
  isConnectedSession: boolean;
}

interface RouteResponse {
  ok: boolean;
  data?: AdminWebhookRetryResult;
  error?: {
    message?: string;
  };
}

function buildNextSearchParams(
  current: URLSearchParams,
  next: Partial<AdminWebhookFilters>,
) {
  const params = new URLSearchParams(current.toString());

  if ('provider' in next) {
    const provider = next.provider?.trim();

    if (provider && provider !== 'all') {
      params.set('webhookProvider', provider);
    } else {
      params.delete('webhookProvider');
    }
  }

  if ('status' in next) {
    const status = next.status?.trim();

    if (status && status !== 'all') {
      params.set('webhookStatus', status);
    } else {
      params.delete('webhookStatus');
    }
  }

  if ('search' in next) {
    const search = next.search?.trim();

    if (search) {
      params.set('webhookSearch', search);
    } else {
      params.delete('webhookSearch');
    }
  }

  if ('limit' in next) {
    const limit = typeof next.limit === 'number' ? String(next.limit) : '';

    if (limit && limit !== '12') {
      params.set('webhookLimit', limit);
    } else {
      params.delete('webhookLimit');
    }
  }

  return params;
}

export function WebhooksClient({ snapshot, isConnectedSession }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(snapshot.filters.search ?? '');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  function pushFilters(next: Partial<AdminWebhookFilters>) {
    const params = buildNextSearchParams(searchParams, next);
    const query = params.toString();

    router.push(query ? `${pathname}?${query}` : pathname);
  }

  async function retryWebhook(webhookEventId: string) {
    if (!isConnectedSession || !snapshot.retryDecision.allowed) {
      setStatusMessage(null);
      setErrorMessage('Connected ops authentication with retry permission is required.');
      return;
    }

    if (!window.confirm('Requeue this failed webhook delivery?')) {
      return;
    }

    setRetryingId(webhookEventId);
    setErrorMessage(null);
    setStatusMessage('Requeueing webhook delivery...');

    try {
      const response = await fetch('/bff/admin/webhooks/retry', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          webhookEventId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as RouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setRetryingId(null);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to requeue the webhook delivery.');
        return;
      }

      setRetryingId(null);
      setStatusMessage(
        `Requeued ${payload.data.eventType} at ${formatUtcDateTime(payload.data.retriedAt)} on ${payload.data.queue}.`,
      );
      router.refresh();
    } catch {
      setRetryingId(null);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the webhook retry route right now.');
    }
  }

  return (
    <>
      {statusMessage ? <div className="banner banner-info">{statusMessage}</div> : null}
      {errorMessage ? <div className="banner banner-error">{errorMessage}</div> : null}

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Filters</span>
          <h2>Inspect webhook deliveries</h2>
          <div className="filter-grid">
            <label className="filter-field">
              <span className="filter-field__label">Provider</span>
              <select
                onChange={(event) => pushFilters({ provider: event.target.value as AdminWebhookFilters['provider'] })}
                value={snapshot.filters.provider}
              >
                {adminWebhookProviderFilters.map((provider) => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Status</span>
              <select
                onChange={(event) => pushFilters({ status: event.target.value as AdminWebhookFilters['status'] })}
                value={snapshot.filters.status}
              >
                {adminWebhookStatusFilters.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Limit</span>
              <select
                onChange={(event) => pushFilters({ limit: Number(event.target.value) })}
                value={String(snapshot.filters.limit)}
              >
                {[8, 12, 20, 40].map((limit) => (
                  <option key={limit} value={limit}>{limit}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Search</span>
              <input
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); pushFilters({ search: searchDraft }); } }}
                placeholder="invoice.payment_failed, evt_123"
                value={searchDraft}
              />
            </label>
          </div>
          <div className="filter-actions">
            <button className="btn-primary" onClick={() => pushFilters({ search: searchDraft })} type="button">Apply filters</button>
            <button className="btn-ghost" onClick={() => { setSearchDraft(''); pushFilters({ provider: 'all', status: 'all', search: '', limit: 12 }); }} type="button">Reset</button>
          </div>
        </article>

        <article className="panel">
          <span className="micro-label">Status</span>
          <h2>Delivery health</h2>
          <div className="tag-row" style={{ marginBottom: '12px' }}>
            <span className="tag-soft tag-soft--gray">received {snapshot.statusCounts.received}</span>
            <span className="tag-soft tag-soft--green">processed {snapshot.statusCounts.processed}</span>
            <span className={snapshot.statusCounts.failed > 0 ? 'tag-soft tag-soft--orange' : 'tag-soft tag-soft--gray'}>
              failed {snapshot.statusCounts.failed}
            </span>
          </div>
          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-row__key">Visible deliveries</span>
              <span className="kv-row__value">{snapshot.items.length} item{snapshot.items.length === 1 ? '' : 's'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Retry access</span>
              <span className="kv-row__value">{snapshot.retryDecision.allowed ? 'Allowed for this operator' : 'Read-only mode'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Queue catalog</span>
              <span className="kv-row__value">{snapshot.queues.length} declared queue{snapshot.queues.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Queues</span>
          <h2>Job queue catalog</h2>
          <div className="kv-list">
            {snapshot.queues.map((queue) => (
              <div className="kv-row" key={queue.name} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '2px' }}>
                <span className="kv-row__key">{queue.name}</span>
                <span className="kv-row__value" style={{ fontSize: '0.83rem' }}>
                  {queue.description} · {queue.attempts} attempt{queue.attempts === 1 ? '' : 's'} · {queue.processorState}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <span className="micro-label">Retry model</span>
          <h2>Operator safety rails</h2>
          <div className="kv-list">
            <div className="kv-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '2px' }}>
              <span className="kv-row__key">Eligible deliveries</span>
              <span className="kv-row__value" style={{ fontSize: '0.83rem' }}>Only failed webhook deliveries can be requeued from this surface.</span>
            </div>
            <div className="kv-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '2px' }}>
              <span className="kv-row__key">Job routing</span>
              <span className="kv-row__value" style={{ fontSize: '0.83rem' }}>Retries are requeued with a fresh job id on the appropriate delivery queue.</span>
            </div>
            <div className="kv-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '2px' }}>
              <span className="kv-row__key">State reset</span>
              <span className="kv-row__value" style={{ fontSize: '0.83rem' }}>Retry clears the previous error and resets the event to received state.</span>
            </div>
          </div>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Deliveries</span>
        <h2>Recent webhook events</h2>
        {snapshot.items.length > 0 ? (
          <div className="event-list">
            {snapshot.items.map((item) => (
              <div className="event-row" key={item.id}>
                <span className={item.status === 'failed' ? 'event-dot event-dot--warn' : 'event-dot event-dot--info'} />
                <div className="event-row__body">
                  <span className="event-row__type">{item.provider} · {item.eventType}</span>
                  <span className="event-row__context">
                    {item.externalEventId} · queue {item.queue}
                    {item.processedAt ? ` · processed ${formatUtcDateTime(item.processedAt)}` : ''}
                  </span>
                  {item.lastError ? <p className="event-row__summary" style={{ color: 'var(--error, #c0392b)' }}>{item.lastError}</p> : null}
                </div>
                <div className="event-row__meta">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                    <span className={item.status === 'failed' ? 'tag-soft tag-soft--orange' : 'tag-soft tag-soft--gray'}>{item.status}</span>
                    {item.retryable ? (
                      <button
                        className="btn-ghost"
                        disabled={retryingId === item.id || !isConnectedSession || !snapshot.retryDecision.allowed}
                        onClick={() => void retryWebhook(item.id)}
                        style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                        type="button"
                      >
                        {retryingId === item.id ? 'Retrying…' : 'Retry'}
                      </button>
                    ) : null}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '0.74rem', opacity: 0.7 }}>{formatUtcDateTime(item.receivedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '28px 0' }}>
            <span className="micro-label">No deliveries</span>
            <h2>No webhook deliveries matched the current filter set</h2>
          </div>
        )}
      </section>
    </>
  );
}
