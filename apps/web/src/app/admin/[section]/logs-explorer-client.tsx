'use client';

import {
  adminLogExportFormats,
  type AdminLogExportFormat,
  type AdminLogExportResult,
  adminLogSeverityFilters,
  adminLogStreamFilters,
  type AdminLogFilters,
} from '@quizmind/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { type AdminLogsStateSnapshot } from '../../../lib/api';
import { formatUtcDateTime } from '../../../lib/datetime';
import {
  buildExtensionLifecycleSearch,
  extensionLifecycleFilterDefinitions,
  isExtensionLifecycleEventType,
  summarizeExtensionLifecycleEvents,
} from '../../../features/admin/log-lifecycle';

interface WorkspaceOption {
  id: string;
  name: string;
  role: string;
}

interface LogsExplorerClientProps {
  snapshot: AdminLogsStateSnapshot;
  canExportLogs: boolean;
  isConnectedSession: boolean;
  workspaceOptions: WorkspaceOption[];
  defaultStreamOnReset?: AdminLogFilters['stream'];
}

interface MutationRouteResponse<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

function downloadExportFile(result: AdminLogExportResult) {
  const blob = new Blob([result.content], { type: result.contentType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = result.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function buildNextSearchParams(
  current: URLSearchParams,
  next: Partial<AdminLogFilters & { workspaceId: string }>,
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

  if ('stream' in next) {
    const stream = next.stream?.trim();

    if (stream && stream !== 'all') {
      params.set('logStream', stream);
    } else {
      params.delete('logStream');
    }
  }

  if ('severity' in next) {
    const severity = next.severity?.trim();

    if (severity && severity !== 'all') {
      params.set('logSeverity', severity);
    } else {
      params.delete('logSeverity');
    }
  }

  if ('search' in next) {
    const search = next.search?.trim();

    if (search) {
      params.set('logSearch', search);
    } else {
      params.delete('logSearch');
    }
  }

  if ('limit' in next) {
    const limit = typeof next.limit === 'number' ? String(next.limit) : '';

    if (limit && limit !== '12') {
      params.set('logLimit', limit);
    } else {
      params.delete('logLimit');
    }
  }

  return params;
}

export function LogsExplorerClient({
  snapshot,
  canExportLogs,
  isConnectedSession,
  workspaceOptions,
  defaultStreamOnReset,
}: LogsExplorerClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(snapshot.filters.search ?? '');
  const [exportFormat, setExportFormat] = useState<AdminLogExportFormat>('json');
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    'Admin log explorer can now export filtered audit streams as JSON or CSV.',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const extensionLifecycleSummary = summarizeExtensionLifecycleEvents(snapshot.items);

  function pushFilters(next: Partial<AdminLogFilters & { workspaceId: string }>) {
    const params = buildNextSearchParams(searchParams, next);
    const query = params.toString();

    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function applySearch() {
    setErrorMessage(null);
    pushFilters({
      search: searchDraft,
    });
  }

  function applyExtensionLifecycleFilter(eventType?: (typeof extensionLifecycleFilterDefinitions)[number]['eventType']) {
    const search = buildExtensionLifecycleSearch(eventType);

    setSearchDraft(search);
    setErrorMessage(null);
    pushFilters({
      stream: 'all',
      search,
    });
  }

  async function exportLogs() {
    if (!isConnectedSession) {
      setStatusMessage(null);
      setErrorMessage('Sign in with a connected session to export admin logs.');
      return;
    }

    if (!canExportLogs) {
      setStatusMessage(null);
      setErrorMessage('This session can read logs, but it does not have audit_logs:export.');
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);
    setStatusMessage('Preparing audit log export...');

    try {
      const response = await fetch('/api/admin/logs/export', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...(snapshot.workspace?.id ?? snapshot.filters.workspaceId
            ? { workspaceId: snapshot.workspace?.id ?? snapshot.filters.workspaceId }
            : {}),
          stream: snapshot.filters.stream,
          severity: snapshot.filters.severity,
          ...(snapshot.filters.search ? { search: snapshot.filters.search } : {}),
          limit: snapshot.filters.limit,
          format: exportFormat,
        }),
      });
      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<AdminLogExportResult> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsExporting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to export audit logs right now.');
        return;
      }

      downloadExportFile(payload.data);
      setIsExporting(false);
      setStatusMessage(`Exported ${payload.data.fileName} at ${formatUtcDateTime(payload.data.exportedAt)}.`);
    } catch {
      setIsExporting(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the audit log export route right now.');
    }
  }

  return (
    <>
      {statusMessage ? <div className="banner banner-info">{statusMessage}</div> : null}
      {errorMessage ? <div className="banner banner-error">{errorMessage}</div> : null}

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Filters</span>
          <h2>Explore operational log streams</h2>
          <div className="filter-grid">
            <label className="filter-field">
              <span className="filter-field__label">Workspace</span>
              <select
                onChange={(event) => pushFilters({ workspaceId: event.target.value })}
                value={snapshot.workspace?.id ?? snapshot.filters.workspaceId ?? ''}
              >
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Stream</span>
              <select
                onChange={(event) => pushFilters({ stream: event.target.value as AdminLogFilters['stream'] })}
                value={snapshot.filters.stream}
              >
                {adminLogStreamFilters.map((stream) => (
                  <option key={stream} value={stream}>
                    {stream}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Severity</span>
              <select
                onChange={(event) => pushFilters({ severity: event.target.value as AdminLogFilters['severity'] })}
                value={snapshot.filters.severity}
              >
                {adminLogSeverityFilters.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
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
                  <option key={limit} value={limit}>
                    {limit}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Search</span>
              <input
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applySearch();
                  }
                }}
                placeholder="billing, support, auth.login_failed"
                value={searchDraft}
              />
            </label>
          </div>
          <div className="filter-actions">
            <button className="btn-primary" onClick={applySearch} type="button">
              Apply filters
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setSearchDraft('');
                pushFilters({
                  stream: defaultStreamOnReset ?? 'all',
                  severity: 'all',
                  search: '',
                  limit: 12,
                });
              }}
              type="button"
            >
              Reset
            </button>
          </div>
          <div style={{ marginTop: '16px' }}>
            <p className="list-muted" style={{ fontSize: '0.82rem', marginBottom: '8px' }}>
              Extension lifecycle quick-filters:
            </p>
            <div className="tag-row">
              <button className="btn-ghost" onClick={() => applyExtensionLifecycleFilter()} type="button">
                all lifecycle
              </button>
              {extensionLifecycleFilterDefinitions.map((definition) => (
                <button
                  className="btn-ghost"
                  key={definition.eventType}
                  onClick={() => applyExtensionLifecycleFilter(definition.eventType)}
                  type="button"
                >
                  {definition.label} ({extensionLifecycleSummary.byEventType[definition.eventType]})
                </button>
              ))}
            </div>
          </div>
        </article>

        <article className="panel">
          <span className="micro-label">Export</span>
          <h2>Download filtered log snapshots</h2>
          <div className="filter-grid">
            <label className="filter-field">
              <span className="filter-field__label">Format</span>
              <select
                onChange={(event) => setExportFormat(event.target.value as AdminLogExportFormat)}
                value={exportFormat}
              >
                {adminLogExportFormats.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-actions" style={{ marginTop: '12px' }}>
            <button
              className="btn-primary"
              disabled={isExporting || !canExportLogs}
              onClick={() => void exportLogs()}
              type="button"
            >
              {isExporting ? 'Exporting...' : 'Export logs'}
            </button>
            <span className={canExportLogs ? 'tag-soft tag-soft--green' : 'tag-soft tag-soft--orange'}>
              {canExportLogs ? 'export allowed' : 'export blocked'}
            </span>
          </div>
          <div className="kv-list" style={{ marginTop: '16px' }}>
            <div className="kv-row">
              <span className="kv-row__key">Workspace</span>
              <span className="kv-row__value">{snapshot.workspace?.name ?? 'No workspace scope'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Visible events</span>
              <span className="kv-row__value">{snapshot.items.length} item{snapshot.items.length === 1 ? '' : 's'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Active filter</span>
              <span className="kv-row__value">
                {snapshot.filters.stream} · {snapshot.filters.severity}
                {snapshot.filters.search ? ` · "${snapshot.filters.search}"` : ''}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <span className="micro-label">Stream distribution</span>
            <h2>Recent audit and telemetry history</h2>
          </div>
          <div className="tag-row">
            <span className="tag-soft tag-soft--gray">audit {snapshot.streamCounts.audit}</span>
            <span className="tag-soft tag-soft--gray">activity {snapshot.streamCounts.activity}</span>
            <span className={snapshot.streamCounts.security > 0 ? 'tag-soft tag-soft--orange' : 'tag-soft tag-soft--gray'}>
              security {snapshot.streamCounts.security}
            </span>
            <span className="tag-soft tag-soft--gray">domain {snapshot.streamCounts.domain}</span>
            {extensionLifecycleSummary.total > 0 ? (
              <span className="tag-soft tag-soft--orange">lifecycle {extensionLifecycleSummary.total}</span>
            ) : null}
          </div>
        </div>
        {snapshot.items.length > 0 ? (
          <div className="event-list">
            {snapshot.items.map((item) => (
              <div className="event-row" key={item.id}>
                <span className={
                  item.stream === 'security' || item.status === 'failure' || item.severity === 'warn' || item.severity === 'error'
                    ? 'event-dot event-dot--warn'
                    : item.stream === 'domain'
                      ? 'event-dot event-dot--ai'
                      : item.stream === 'activity'
                        ? 'event-dot event-dot--activity'
                        : 'event-dot event-dot--info'
                } />
                <div className="event-row__body">
                  <span className="event-row__type">{item.stream} · {item.eventType}</span>
                  {item.summary ? <p className="event-row__summary">{item.summary}</p> : null}
                  <span className="event-row__context">
                    {item.workspace ? `${item.workspace.name} · ` : ''}
                    {item.actor ? `${item.actor.displayName ?? item.actor.email ?? item.actor.id} · ` : ''}
                    {item.targetType ?? 'no target'}
                    {item.targetId ? ` ${item.targetId}` : ''}
                  </span>
                </div>
                <div className="event-row__meta">
                  <div className="tag-row" style={{ justifyContent: 'flex-end', gap: '4px', marginBottom: '4px' }}>
                    <span className={item.stream === 'security' || item.status === 'failure' ? 'tag-soft tag-soft--orange' : 'tag-soft tag-soft--gray'}>
                      {item.stream}
                    </span>
                    {isExtensionLifecycleEventType(item.eventType) ? (
                      <span className={
                        item.eventType === 'extension.bootstrap_refresh_failed' || item.eventType === 'extension.runtime_error'
                          ? 'tag-soft tag-soft--orange'
                          : 'tag-soft tag-soft--gray'
                      }>
                        lifecycle
                      </span>
                    ) : null}
                  </div>
                  {formatUtcDateTime(item.occurredAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '32px 0' }}>
            <span className="micro-label">No entries</span>
            <h2>No log entries matched the current filter set</h2>
          </div>
        )}
      </section>
    </>
  );
}
