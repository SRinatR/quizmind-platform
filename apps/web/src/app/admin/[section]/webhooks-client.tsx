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
  const [statusMessage, setStatusMessage] = useState<string | null>(
    'Billing webhook delivery state is now visible from the admin control plane.',
  );
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

    if (!window.confirm('Requeue this failed billing webhook delivery?')) {
      return;
    }

    setRetryingId(webhookEventId);
    setErrorMessage(null);
    setStatusMessage('Requeueing webhook delivery...');

    try {
      const response = await fetch('/api/admin/webhooks/retry', {
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
    <div className="admin-feature-flags-shell">
      {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Filters</span>
          <h2>Inspect billing webhook deliveries</h2>
          <div className="admin-ticket-editor">
            <label className="admin-ticket-field">
              <span className="micro-label">Provider</span>
              <select
                onChange={(event) => pushFilters({ provider: event.target.value as AdminWebhookFilters['provider'] })}
                value={snapshot.filters.provider}
              >
                {adminWebhookProviderFilters.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Status</span>
              <select
                onChange={(event) => pushFilters({ status: event.target.value as AdminWebhookFilters['status'] })}
                value={snapshot.filters.status}
              >
                {adminWebhookStatusFilters.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Limit</span>
              <select
                onChange={(event) => pushFilters({ limit: Number(event.target.value) })}
                value={String(snapshot.filters.limit)}
              >
                {[8, 12, 20, 40].map((limit) => (
                  <option key={limit} value={limit}>
                    {limit}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Search</span>
              <input
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    pushFilters({ search: searchDraft });
                  }
                }}
                placeholder="invoice.payment_failed, evt_123, failed"
                value={searchDraft}
              />
            </label>
          </div>
          <div className="admin-user-actions">
            <button className="btn-primary" onClick={() => pushFilters({ search: searchDraft })} type="button">
              Apply filters
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setSearchDraft('');
                pushFilters({
                  provider: 'all',
                  status: 'all',
                  search: '',
                  limit: 12,
                });
              }}
              type="button"
            >
              Reset
            </button>
          </div>
          <p className="admin-ticket-note">
            Failed Stripe deliveries can be requeued here without exposing raw provider payloads to the web client.
          </p>
        </article>

        <article className="panel">
          <span className="micro-label">Status</span>
          <h2>Delivery distribution</h2>
          <div className="tag-row">
            <span className="tag">received {snapshot.statusCounts.received}</span>
            <span className="tag">processed {snapshot.statusCounts.processed}</span>
            <span className="tag warn">failed {snapshot.statusCounts.failed}</span>
          </div>
          <div className="mini-list">
            <div className="list-item">
              <strong>Visible deliveries</strong>
              <p>{snapshot.items.length} item{snapshot.items.length === 1 ? '' : 's'} returned</p>
            </div>
            <div className="list-item">
              <strong>Retry access</strong>
              <p>{snapshot.retryDecision.allowed ? 'Allowed for this operator.' : 'Read-only inspection mode.'}</p>
            </div>
            <div className="list-item">
              <strong>Queue catalog</strong>
              <p>{snapshot.queues.length} declared queue{snapshot.queues.length === 1 ? '' : 's'} in the platform.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Queues</span>
          <h2>Worker queue catalog</h2>
          <div className="list-stack">
            {snapshot.queues.map((queue) => (
              <div className="list-item" key={queue.name}>
                <strong>{queue.name}</strong>
                <p>
                  {queue.description} | attempts {queue.attempts}
                </p>
                <p className="list-muted">
                  {queue.processorState}
                  {queue.handler ? ` | ${queue.handler}` : ''}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <span className="micro-label">Retry model</span>
          <h2>Current operator safety rails</h2>
          <div className="mini-list">
            <div className="list-item">
              <strong>Eligible deliveries</strong>
              <p>Only failed Stripe deliveries can be requeued from this admin surface.</p>
            </div>
            <div className="list-item">
              <strong>Job routing</strong>
              <p>Retries are sent back onto the shared billing-webhooks queue with a fresh job id.</p>
            </div>
            <div className="list-item">
              <strong>State reset</strong>
              <p>Retry clears the previous error and returns the webhook event to received state before requeue.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Deliveries</span>
        <h2>Recent billing webhook events</h2>
        {snapshot.items.length > 0 ? (
          <div className="settings-session-list">
            {snapshot.items.map((item) => (
              <div className="settings-session-row" key={item.id}>
                <div>
                  <strong>
                    {item.provider} | {item.eventType}
                  </strong>
                  <p className="list-muted">
                    {item.externalEventId} | {formatUtcDateTime(item.receivedAt)}
                  </p>
                  <p className="list-muted">
                    {item.status} | queue {item.queue}
                    {item.processedAt ? ` | processed ${formatUtcDateTime(item.processedAt)}` : ''}
                  </p>
                  {item.lastError ? <p className="list-muted">{item.lastError}</p> : null}
                </div>
                <div className="billing-history-meta">
                  <span className={item.status === 'failed' ? 'tag warn' : 'tag'}>{item.status}</span>
                  {item.retryable ? (
                    <button
                      className="btn-ghost"
                      disabled={retryingId === item.id || !isConnectedSession || !snapshot.retryDecision.allowed}
                      onClick={() => void retryWebhook(item.id)}
                      type="button"
                    >
                      {retryingId === item.id ? 'Retrying...' : 'Retry'}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No webhook deliveries matched the current filter set.</p>
        )}
      </section>
    </div>
  );
}
