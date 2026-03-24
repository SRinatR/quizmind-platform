'use client';

import {
  adminExtensionCompatibilityFilters,
  adminExtensionConnectionFilters,
  type AdminExtensionFleetFilters,
} from '@quizmind/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { type AdminExtensionFleetStateSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';

interface WorkspaceOption {
  id: string;
  name: string;
  role: string;
}

interface ExtensionFleetClientProps {
  snapshot: AdminExtensionFleetStateSnapshot;
  workspaceOptions: WorkspaceOption[];
}

function buildNextSearchParams(
  current: URLSearchParams,
  next: Partial<AdminExtensionFleetFilters>,
) {
  const params = new URLSearchParams(current.toString());

  if ('workspaceId' in next) {
    const workspaceId = next.workspaceId?.trim();

    if (workspaceId) {
      params.set('workspaceId', workspaceId);
    } else {
      params.delete('workspaceId');
    }
  }

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
  workspaceOptions,
}: ExtensionFleetClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(snapshot.filters.search ?? '');

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

  return (
    <div className="admin-feature-flags-shell">
      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Filters</span>
          <h2>Explore managed extension installations</h2>
          <div className="admin-ticket-editor">
            <label className="admin-ticket-field">
              <span className="micro-label">Workspace</span>
              <select
                onChange={(event) => pushFilters({ workspaceId: event.target.value, installationId: '' })}
                value={snapshot.workspace.id}
              >
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Compatibility</span>
              <select
                onChange={(event) =>
                  pushFilters({
                    compatibility: event.target.value as AdminExtensionFleetFilters['compatibility'],
                  })
                }
                value={snapshot.filters.compatibility}
              >
                {adminExtensionCompatibilityFilters.map((filter) => (
                  <option key={filter} value={filter}>
                    {filter}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Connection</span>
              <select
                onChange={(event) =>
                  pushFilters({
                    connection: event.target.value as AdminExtensionFleetFilters['connection'],
                  })
                }
                value={snapshot.filters.connection}
              >
                {adminExtensionConnectionFilters.map((filter) => (
                  <option key={filter} value={filter}>
                    {filter}
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
                    applySearch();
                  }
                }}
                placeholder="installation id, user id, chrome, deprecated"
                value={searchDraft}
              />
            </label>
          </div>
          <div className="admin-user-actions">
            <button className="btn-primary" onClick={applySearch} type="button">
              Apply filters
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setSearchDraft('');
                pushFilters({
                  installationId: '',
                  compatibility: 'all',
                  connection: 'all',
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
            This explorer shows workspace-bound installation auth health, compatibility drift, and short-lived token activity.
          </p>
        </article>

        <article className="panel">
          <span className="micro-label">Counts</span>
          <h2>Fleet health summary</h2>
          <div className="tag-row">
            <span className="tag">connected {snapshot.counts.connected}</span>
            <span className={snapshot.counts.reconnectRequired > 0 ? 'tag warn' : 'tag'}>
              reconnect {snapshot.counts.reconnectRequired}
            </span>
            <span className="tag">supported {snapshot.counts.supported}</span>
            <span className={snapshot.counts.supportedWithWarnings > 0 ? 'tag warn' : 'tag'}>
              warnings {snapshot.counts.supportedWithWarnings}
            </span>
            <span className={snapshot.counts.deprecated > 0 ? 'tag warn' : 'tag'}>
              deprecated {snapshot.counts.deprecated}
            </span>
            <span className={snapshot.counts.unsupported > 0 ? 'tag warn' : 'tag'}>
              unsupported {snapshot.counts.unsupported}
            </span>
          </div>
          <div className="mini-list">
            <div className="list-item">
              <strong>Workspace</strong>
              <p>{snapshot.workspace.name}</p>
            </div>
            <div className="list-item">
              <strong>Filter scope</strong>
              <p>
                {snapshot.filters.compatibility} | {snapshot.filters.connection}
                {snapshot.filters.search ? ` | "${snapshot.filters.search}"` : ''}
              </p>
            </div>
            <div className="list-item">
              <strong>Visible items</strong>
              <p>{snapshot.items.length} installation{snapshot.items.length === 1 ? '' : 's'} returned</p>
            </div>
          </div>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Installations</span>
        <h2>Workspace extension fleet</h2>
        {snapshot.items.length > 0 ? (
          <div className="settings-session-list">
            {snapshot.items.map((item) => (
              <div className="settings-session-row" key={item.installationId}>
                <div>
                  <strong>{item.installationId}</strong>
                  <p>
                    user {item.userId} | {item.browser} | v{item.extensionVersion} | schema {item.schemaVersion}
                  </p>
                  <p className="list-muted">
                    bound {formatUtcDateTime(item.boundAt)}
                    {item.lastSeenAt ? ` | last seen ${formatUtcDateTime(item.lastSeenAt)}` : ''}
                    {item.lastSessionExpiresAt ? ` | token expires ${formatUtcDateTime(item.lastSessionExpiresAt)}` : ''}
                  </p>
                  <p className="list-muted">
                    {item.capabilities.join(', ') || 'No capabilities reported'}
                    {item.compatibility.reason ? ` | ${item.compatibility.reason}` : ''}
                  </p>
                </div>
                <div className="billing-history-meta">
                  <span className={item.compatibility.status === 'supported' ? 'tag' : 'tag warn'}>
                    {item.compatibility.status}
                  </span>
                  <span className={item.requiresReconnect ? 'tag warn' : 'tag'}>
                    {item.requiresReconnect ? 'reconnect required' : `${item.activeSessionCount} active session${item.activeSessionCount === 1 ? '' : 's'}`}
                  </span>
                  <button className="btn-ghost" onClick={() => toggleInstallationDetail(item.installationId)} type="button">
                    {snapshot.selectedInstallationId === item.installationId ? 'Hide history' : 'View history'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No extension installations matched the current filter set.</p>
        )}
      </section>

      {snapshot.selectedInstallation ? (
        <section className="split-grid">
          <article className="panel">
            <span className="micro-label">Session Detail</span>
            <h2>Installation token lifecycle</h2>
            <div className="tag-row">
              <span className="tag">total {snapshot.selectedInstallation.counts.total}</span>
              <span className="tag">active {snapshot.selectedInstallation.counts.active}</span>
              <span className={snapshot.selectedInstallation.counts.expired > 0 ? 'tag warn' : 'tag'}>
                expired {snapshot.selectedInstallation.counts.expired}
              </span>
              <span className={snapshot.selectedInstallation.counts.revoked > 0 ? 'tag warn' : 'tag'}>
                revoked {snapshot.selectedInstallation.counts.revoked}
              </span>
            </div>
            <div className="mini-list">
              <div className="list-item">
                <strong>Installation</strong>
                <p>{snapshot.selectedInstallation.installation.installationId}</p>
              </div>
              <div className="list-item">
                <strong>Operator context</strong>
                <p>
                  {snapshot.selectedInstallation.installation.browser} | v
                  {snapshot.selectedInstallation.installation.extensionVersion} | schema{' '}
                  {snapshot.selectedInstallation.installation.schemaVersion}
                </p>
              </div>
              <div className="list-item">
                <strong>Latest state</strong>
                <p>
                  {snapshot.selectedInstallation.installation.requiresReconnect
                    ? 'Reconnect required'
                    : 'At least one active installation token still exists.'}
                </p>
              </div>
            </div>
          </article>

          <article className="panel">
            <span className="micro-label">History</span>
            <h2>Recent installation sessions</h2>
            {snapshot.selectedInstallation.sessions.length > 0 ? (
              <div className="settings-session-list">
                {snapshot.selectedInstallation.sessions.map((session) => (
                  <div className="settings-session-row" key={session.id}>
                    <div>
                      <strong>{session.id}</strong>
                      <p>
                        issued {formatUtcDateTime(session.issuedAt)} | expires {formatUtcDateTime(session.expiresAt)}
                      </p>
                      <p className="list-muted">
                        user {session.userId}
                        {session.revokedAt ? ` | revoked ${formatUtcDateTime(session.revokedAt)}` : ''}
                      </p>
                    </div>
                    <div className="billing-history-meta">
                      <span className={session.status === 'active' ? 'tag' : 'tag warn'}>{session.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No recent installation session history is available for this installation yet.</p>
            )}
          </article>
        </section>
      ) : null}
    </div>
  );
}
