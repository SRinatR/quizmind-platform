'use client';

import {
  adminExtensionCompatibilityFilters,
  adminExtensionConnectionFilters,
  type ExtensionInstallationDisconnectResult,
  type ExtensionInstallationRotateSessionResult,
  type AdminExtensionFleetFilters,
} from '@quizmind/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import { type AdminExtensionFleetStateSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

interface ExtensionFleetClientProps {
  snapshot: AdminExtensionFleetStateSnapshot;
}

interface DisconnectRouteResponse {
  ok: boolean;
  data?: ExtensionInstallationDisconnectResult;
  error?: {
    message?: string;
  };
}

interface RotateSessionRouteResponse {
  ok: boolean;
  data?: ExtensionInstallationRotateSessionResult;
  error?: {
    message?: string;
  };
}

function buildNextSearchParams(
  current: URLSearchParams,
  next: Partial<AdminExtensionFleetFilters>,
) {
  const params = new URLSearchParams(current.toString());

  if ('compatibility' in next) {
    const compatibility = next.compatibility?.trim();

    if (compatibility && compatibility !== 'all') {
      params.set('installationCompatibility', compatibility);
    } else {
      params.delete('installationCompatibility');
    }
  }

  if ('connection' in next) {
    const connection = next.connection?.trim();

    if (connection && connection !== 'all') {
      params.set('installationConnection', connection);
    } else {
      params.delete('installationConnection');
    }
  }

  if ('installationId' in next) {
    const installationId = next.installationId?.trim();

    if (installationId) {
      params.set('fleetInstallationId', installationId);
    } else {
      params.delete('fleetInstallationId');
    }
  }

  if ('search' in next) {
    const search = next.search?.trim();

    if (search) {
      params.set('installationSearch', search);
    } else {
      params.delete('installationSearch');
    }
  }

  if ('limit' in next) {
    const limit = typeof next.limit === 'number' ? String(next.limit) : '';

    if (limit && limit !== '12') {
      params.set('installationLimit', limit);
    } else {
      params.delete('installationLimit');
    }
  }

  return params;
}

export function ExtensionFleetClient({
  snapshot,
}: ExtensionFleetClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(snapshot.filters.search ?? '');
  const [actionReason, setActionReason] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDisconnectInstallationId, setPendingDisconnectInstallationId] = useState<string | null>(null);
  const [pendingRotateInstallationId, setPendingRotateInstallationId] = useState<string | null>(null);
  const canManageInstallations = snapshot.manageDecision.allowed;
  const manageBlockedReason = snapshot.manageDecision.reasons[0] ?? 'Missing permission: installations:write';
  const selectedInstallation = snapshot.selectedInstallation;
  const normalizedActionReason = actionReason.trim();

  function pushFilters(next: Partial<AdminExtensionFleetFilters>) {
    const params = buildNextSearchParams(searchParams, next);
    const query = params.toString();

    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function applySearch() {
    pushFilters({
      search: searchDraft,
    });
  }

  function toggleInstallationDetail(installationId: string) {
    pushFilters({
      installationId: snapshot.selectedInstallationId === installationId ? '' : installationId,
    });
  }

  async function handleDisconnect(installationId: string) {
    if (!normalizedActionReason) {
      setErrorMessage('Provide an operator reason before disconnecting or rotating installation sessions.');
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    setPendingDisconnectInstallationId(installationId);

    try {
      const response = await fetch('/bff/extension/installations/disconnect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          installationId,
          reason: normalizedActionReason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as DisconnectRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setPendingDisconnectInstallationId(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to disconnect the installation right now.');
        return;
      }

      setPendingDisconnectInstallationId(null);
      setStatusMessage(
        `${payload.data.installationId} disconnected. Revoked ${payload.data.revokedSessionCount} active installation session${payload.data.revokedSessionCount === 1 ? '' : 's'}.`,
      );
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setPendingDisconnectInstallationId(null);
      setErrorMessage('Unable to disconnect the installation right now.');
    }
  }

  async function handleRotateSession(installationId: string) {
    if (!normalizedActionReason) {
      setErrorMessage('Provide an operator reason before disconnecting or rotating installation sessions.');
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    setPendingRotateInstallationId(installationId);

    try {
      const response = await fetch('/bff/extension/installations/rotate-session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          installationId,
          reason: normalizedActionReason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as RotateSessionRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setPendingRotateInstallationId(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to rotate the installation session right now.');
        return;
      }

      setPendingRotateInstallationId(null);
      setStatusMessage(
        `${payload.data.installationId} rotated. Revoked ${payload.data.revokedSessionCount} active installation session${payload.data.revokedSessionCount === 1 ? '' : 's'}.`,
      );
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setPendingRotateInstallationId(null);
      setErrorMessage('Unable to rotate the installation session right now.');
    }
  }

  return (
    <>
      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Filters</span>
          <h2>Explore managed installations</h2>
          <div className="filter-grid">
            <label className="filter-field">
              <span className="filter-field__label">Compatibility</span>
              <select
                onChange={(event) => pushFilters({ compatibility: event.target.value as AdminExtensionFleetFilters['compatibility'] })}
                value={snapshot.filters.compatibility}
              >
                {adminExtensionCompatibilityFilters.map((filter) => (
                  <option key={filter} value={filter}>{filter}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Connection</span>
              <select
                onChange={(event) => pushFilters({ connection: event.target.value as AdminExtensionFleetFilters['connection'] })}
                value={snapshot.filters.connection}
              >
                {adminExtensionConnectionFilters.map((filter) => (
                  <option key={filter} value={filter}>{filter}</option>
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
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); applySearch(); }
                }}
                placeholder="installation id, user id, chrome, deprecated"
                value={searchDraft}
              />
            </label>
          </div>
          <div className="filter-actions">
            <button className="btn-primary" onClick={applySearch} type="button">Apply filters</button>
            <button
              className="btn-ghost"
              onClick={() => {
                setSearchDraft('');
                pushFilters({ installationId: '', compatibility: 'all', connection: 'all', search: '', limit: 12 });
              }}
              type="button"
            >
              Reset
            </button>
          </div>
        </article>

        <article className="panel">
          <span className="micro-label">Fleet health</span>
          <h2>Extension fleet</h2>
          <div className="tag-row" style={{ marginBottom: '12px' }}>
            <span className="tag-soft tag-soft--green">connected {snapshot.counts.connected}</span>
            <span className={snapshot.counts.reconnectRequired > 0 ? 'tag-soft tag-soft--orange' : 'tag-soft tag-soft--gray'}>
              reconnect {snapshot.counts.reconnectRequired}
            </span>
            <span className={snapshot.counts.unsupported > 0 ? 'tag-soft tag-soft--orange' : 'tag-soft tag-soft--gray'}>
              unsupported {snapshot.counts.unsupported}
            </span>
            <span className={snapshot.counts.deprecated > 0 ? 'tag-soft tag-soft--orange' : 'tag-soft tag-soft--gray'}>
              deprecated {snapshot.counts.deprecated}
            </span>
            <span className={canManageInstallations ? 'tag-soft tag-soft--green' : 'tag-soft tag-soft--orange'}>
              {canManageInstallations ? 'write enabled' : 'read only'}
            </span>
          </div>
          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-row__key">Filter scope</span>
              <span className="kv-row__value">
                {snapshot.filters.compatibility} · {snapshot.filters.connection}
                {snapshot.filters.search ? ` · "${snapshot.filters.search}"` : ''}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Visible items</span>
              <span className="kv-row__value">{snapshot.items.length} installation{snapshot.items.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Installations</span>
        <h2>Managed installation fleet</h2>
        {statusMessage ? <div className="banner banner-info">{statusMessage}</div> : null}
        {errorMessage ? <div className="banner banner-error">{errorMessage}</div> : null}
        {!canManageInstallations ? (
          <div className="banner banner-info">Read-only: {manageBlockedReason}</div>
        ) : null}
        <label className="form-field" style={{ marginTop: '12px', marginBottom: '4px' }}>
          <span className="form-field__label">Operator reason <span className="list-muted">(required for rotate / disconnect)</span></span>
          <textarea
            maxLength={500}
            onChange={(event) => setActionReason(event.target.value)}
            placeholder="Example: Rotating tokens after suspicious extension session activity."
            rows={3}
            value={actionReason}
          />
        </label>
        {snapshot.items.length > 0 ? (
          <div className="installation-list" style={{ marginTop: '12px' }}>
            {snapshot.items.map((item) => (
              <div className="installation-row" key={item.installationId}>
                <div className="installation-row__header">
                  <span className="installation-row__id">{item.installationId}</span>
                  <div className="installation-row__badges">
                    <span className="tag-soft">{item.browser}</span>
                    <span className="tag-soft tag-soft--gray">v{item.extensionVersion}</span>
                    <span className={item.compatibility.status === 'supported' ? 'tag-soft tag-soft--green' : 'tag-soft tag-soft--orange'}>
                      {item.compatibility.status}
                    </span>
                    <span className={item.requiresReconnect ? 'tag-soft tag-soft--orange' : 'tag-soft tag-soft--green'}>
                      {item.requiresReconnect ? 'reconnect required' : `${item.activeSessionCount} session${item.activeSessionCount === 1 ? '' : 's'}`}
                    </span>
                  </div>
                </div>
                <p className="list-muted" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
                  {item.userId}
                  {' · bound '}{formatUtcDateTime(item.boundAt)}
                  {item.lastSeenAt ? <>{' · last seen '}{formatUtcDateTime(item.lastSeenAt)}</> : null}
                  {item.compatibility.reason ? <>{' · '}{item.compatibility.reason}</> : null}
                </p>
                <div className="link-row" style={{ marginTop: '8px' }}>
                  <button
                    className="btn-ghost"
                    disabled={!canManageInstallations || normalizedActionReason.length === 0 || pendingRotateInstallationId === item.installationId}
                    onClick={() => void handleRotateSession(item.installationId)}
                    type="button"
                  >
                    {pendingRotateInstallationId === item.installationId ? 'Rotating...' : 'Rotate token'}
                  </button>
                  <button
                    className={!canManageInstallations || normalizedActionReason.length === 0 || item.activeSessionCount === 0 ? 'btn-ghost' : 'btn-danger'}
                    disabled={!canManageInstallations || normalizedActionReason.length === 0 || item.activeSessionCount === 0 || pendingDisconnectInstallationId === item.installationId}
                    onClick={() => void handleDisconnect(item.installationId)}
                    type="button"
                  >
                    {pendingDisconnectInstallationId === item.installationId ? 'Disconnecting...' : item.activeSessionCount === 0 ? 'No active sessions' : 'Disconnect'}
                  </button>
                  <button className="btn-ghost" onClick={() => toggleInstallationDetail(item.installationId)} type="button">
                    {snapshot.selectedInstallationId === item.installationId ? 'Hide sessions' : 'View sessions'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '32px 0' }}>
            <span className="micro-label">No installations</span>
            <h2>No installations matched the current filter set</h2>
          </div>
        )}
      </section>

      {selectedInstallation ? (
        <section className="split-grid">
          <article className="panel">
            <span className="micro-label">Session detail</span>
            <h2>Installation token lifecycle</h2>
            <div className="tag-row" style={{ marginBottom: '12px' }}>
              <span className="tag-soft tag-soft--gray">total {selectedInstallation.counts.total}</span>
              <span className="tag-soft tag-soft--green">active {selectedInstallation.counts.active}</span>
              <span className={selectedInstallation.counts.expired > 0 ? 'tag-soft tag-soft--orange' : 'tag-soft tag-soft--gray'}>
                expired {selectedInstallation.counts.expired}
              </span>
              <span className={selectedInstallation.counts.revoked > 0 ? 'tag-soft tag-soft--orange' : 'tag-soft tag-soft--gray'}>
                revoked {selectedInstallation.counts.revoked}
              </span>
            </div>
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-row__key">Installation</span>
                <span className="kv-row__value">{selectedInstallation.installation.installationId}</span>
              </div>
              <div className="kv-row">
                <span className="kv-row__key">Browser</span>
                <span className="kv-row__value">
                  {selectedInstallation.installation.browser} · v{selectedInstallation.installation.extensionVersion} · schema {selectedInstallation.installation.schemaVersion}
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-row__key">Status</span>
                <span className="kv-row__value">
                  {selectedInstallation.installation.requiresReconnect ? 'Reconnect required' : 'Active token exists'}
                </span>
              </div>
            </div>
            <div className="link-row" style={{ marginTop: '12px' }}>
              <button
                className="btn-ghost"
                disabled={!canManageInstallations || normalizedActionReason.length === 0 || pendingRotateInstallationId === selectedInstallation.installation.installationId}
                onClick={() => void handleRotateSession(selectedInstallation.installation.installationId)}
                type="button"
              >
                {pendingRotateInstallationId === selectedInstallation.installation.installationId ? 'Rotating...' : 'Rotate selected token'}
              </button>
              <button
                className={selectedInstallation.installation.activeSessionCount === 0 ? 'btn-ghost' : 'btn-danger'}
                disabled={!canManageInstallations || normalizedActionReason.length === 0 || selectedInstallation.installation.activeSessionCount === 0 || pendingDisconnectInstallationId === selectedInstallation.installation.installationId}
                onClick={() => void handleDisconnect(selectedInstallation.installation.installationId)}
                type="button"
              >
                {pendingDisconnectInstallationId === selectedInstallation.installation.installationId ? 'Disconnecting...' : selectedInstallation.installation.activeSessionCount === 0 ? 'No active sessions' : 'Disconnect selected'}
              </button>
            </div>
          </article>

          <article className="panel">
            <span className="micro-label">History</span>
            <h2>Recent installation sessions</h2>
            {selectedInstallation.sessions.length > 0 ? (
              <div className="event-list">
                {selectedInstallation.sessions.map((session) => (
                  <div className="event-row" key={session.id}>
                    <span className={session.status === 'active' ? 'event-dot event-dot--info' : session.status === 'revoked' ? 'event-dot event-dot--warn' : 'event-dot event-dot--activity'} />
                    <div className="event-row__body">
                      <span className="event-row__type">{session.id}</span>
                      <span className="event-row__context">
                        user {session.userId}
                        {session.revokedAt ? ` · revoked ${formatUtcDateTime(session.revokedAt)}` : ''}
                      </span>
                    </div>
                    <div className="event-row__meta">
                      <span className={session.status === 'active' ? 'tag-soft tag-soft--green' : 'tag-soft tag-soft--orange'}>{session.status}</span>
                      <br />{formatUtcDateTime(session.issuedAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="list-muted">No session history available yet.</p>
            )}
          </article>
        </section>
      ) : null}
    </>
  );
}
