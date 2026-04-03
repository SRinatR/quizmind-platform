'use client';

import {
  usageExportFormats,
  usageExportScopes,
  type UsageExportFormat,
  type UsageExportResult,
  type UsageExportScope,
} from '@quizmind/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { formatUtcDateTime } from '../../../lib/datetime';
import { type UsageSummarySnapshot } from '../../../lib/api';

interface WorkspaceOption {
  id: string;
  name: string;
  role: string;
}

interface UsageExplorerClientProps {
  usageSummary: UsageSummarySnapshot;
  isConnectedSession: boolean;
  canExportUsage: boolean;
  workspaceOptions: WorkspaceOption[];
}

interface MutationRouteResponse<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

const csvUsageExportScopes = usageExportScopes.filter((scope) => scope !== 'full');

function formatWindow(start?: string, end?: string) {
  if (!start || !end) {
    return 'Current window unavailable';
  }

  return `${formatUtcDateTime(start)} - ${formatUtcDateTime(end)}`;
}

function downloadExportFile(result: UsageExportResult) {
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

export function UsageExplorerClient({
  usageSummary,
  isConnectedSession,
  canExportUsage,
  workspaceOptions,
}: UsageExplorerClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [exportFormat, setExportFormat] = useState<UsageExportFormat>('json');
  const [exportScope, setExportScope] = useState<UsageExportScope>('full');
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    'Usage explorer now reads server-side quota counters and can export JSON or scoped CSV snapshots.',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function updateWorkspaceScope(workspaceId: string) {
    const params = new URLSearchParams(searchParams.toString());

    params.set('workspaceId', workspaceId);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleFormatChange(nextFormat: UsageExportFormat) {
    setExportFormat(nextFormat);

    if (nextFormat === 'csv' && exportScope === 'full') {
      setExportScope('quotas');
    }
  }

  async function exportUsage() {
    if (!isConnectedSession) {
      setStatusMessage(null);
      setErrorMessage('Sign in with a connected session to export usage.');
      return;
    }

    if (!canExportUsage) {
      setStatusMessage(null);
      setErrorMessage('This session can read usage, but it does not have usage:export.');
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);
    setStatusMessage('Preparing usage export...');

    try {
      const response = await fetch('/api/admin/usage/export', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          format: exportFormat,
          scope: exportScope,
        }),
      });
      const payload = (await response.json().catch(() => null)) as MutationRouteResponse<UsageExportResult> | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsExporting(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to export usage right now.');
        return;
      }

      downloadExportFile(payload.data);
      setIsExporting(false);
      setStatusMessage(`Exported ${payload.data.fileName} at ${formatUtcDateTime(payload.data.exportedAt)}.`);
    } catch {
      setIsExporting(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the usage export route right now.');
    }
  }

  const availableScopes = exportFormat === 'csv' ? csvUsageExportScopes : usageExportScopes;
  const canSelectWorkspace = workspaceOptions.length > 1;
  const highlightedQuota = usageSummary.quotas[0] ?? null;

  return (
    <>
      {statusMessage ? <div className="banner banner-info">{statusMessage}</div> : null}
      {errorMessage ? <div className="banner banner-error">{errorMessage}</div> : null}

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Export</span>
          <h2>Download usage snapshots</h2>
          <div className="filter-grid">
            <label className="filter-field">
              <span className="filter-field__label">Workspace</span>
              <select
                disabled={true}
                value=""
              >
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Format</span>
              <select
                onChange={(event) => handleFormatChange(event.target.value as UsageExportFormat)}
                value={exportFormat}
              >
                {usageExportFormats.map((format) => (
                  <option key={format} value={format}>{format}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field__label">Scope</span>
              <select
                onChange={(event) => setExportScope(event.target.value as UsageExportScope)}
                value={exportScope}
              >
                {availableScopes.map((scope) => (
                  <option key={scope} value={scope}>{scope}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-actions" style={{ marginTop: '12px' }}>
            <button className="btn-primary" disabled={isExporting || !canExportUsage} onClick={() => void exportUsage()} type="button">
              {isExporting ? 'Exporting...' : 'Export usage'}
            </button>
            <span className={canExportUsage ? 'tag-soft tag-soft--green' : 'tag-soft tag-soft--orange'}>
              {canExportUsage ? 'export allowed' : 'export blocked'}
            </span>
          </div>
          <p className="list-muted" style={{ fontSize: '0.82rem', marginTop: '8px' }}>
            JSON supports full workspace snapshots. CSV is scoped to quotas, installations, or recent events.
          </p>
        </article>

        <article className="panel">
          <span className="micro-label">Baseline</span>
          <h2>Current usage summary</h2>
          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-row__key">Primary quota</span>
              <span className="kv-row__value">
                {highlightedQuota
                  ? `${highlightedQuota.label}: ${highlightedQuota.consumed}${typeof highlightedQuota.limit === 'number' ? ` / ${highlightedQuota.limit}` : ''}`
                  : 'No quota snapshot available'}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Period</span>
              <span className="kv-row__value">{formatWindow(usageSummary.currentPeriodStart, usageSummary.currentPeriodEnd)}</span>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Fleet</span>
              <span className="kv-row__value">
                {usageSummary.installations.length} installation{usageSummary.installations.length === 1 ? '' : 's'} · {usageSummary.recentEvents.length} recent event{usageSummary.recentEvents.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Quotas</span>
          <h2>Server-side quota counters</h2>
          {usageSummary.quotas.length > 0 ? (
            <div style={{ display: 'grid', gap: '12px' }}>
              {usageSummary.quotas.map((quota) => {
                const pct = quota.limit && quota.limit > 0 ? Math.min(100, Math.round((quota.consumed / quota.limit) * 100)) : -1;
                const tone = pct >= 90 ? 'critical' : pct >= 70 ? 'warn' : 'ok';
                return (
                  <div className="quota-row" key={quota.key}>
                    <div className="quota-row__header">
                      <span className="quota-row__label">{quota.label}</span>
                      <span className="quota-row__value">
                        {quota.consumed}{typeof quota.limit === 'number' ? ` / ${quota.limit}` : ''}
                      </span>
                    </div>
                    <div className="quota-bar">
                      <div className={`quota-bar__fill quota-bar__fill--${pct >= 0 ? tone : 'unknown'}`} style={{ width: pct >= 0 ? `${pct}%` : '0%' }} />
                    </div>
                    <span className="quota-row__meta">{quota.status} · {formatWindow(quota.periodStart, quota.periodEnd)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="list-muted">No quota counters available for this workspace yet.</p>
          )}
        </article>

        <article className="panel">
          <span className="micro-label">Installations</span>
          <h2>Managed extension fleet</h2>
          {usageSummary.installations.length > 0 ? (
            <div className="installation-list">
              {usageSummary.installations.map((installation) => (
                <div className="installation-row" key={installation.installationId}>
                  <div className="installation-row__header">
                    <span className="installation-row__id">{installation.installationId}</span>
                    <div className="installation-row__badges">
                      <span className="tag-soft">{installation.browser}</span>
                      <span className="tag-soft tag-soft--gray">v{installation.extensionVersion}</span>
                    </div>
                  </div>
                  <span className="list-muted" style={{ fontSize: '0.8rem' }}>
                    {installation.capabilities.join(', ') || 'No capabilities'} · last seen {formatUtcDateTime(installation.lastSeenAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="list-muted">No installations reported into this workspace yet.</p>
          )}
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Recent events</span>
        <h2>Telemetry and activity stream</h2>
        {usageSummary.recentEvents.length > 0 ? (
          <div className="event-list">
            {usageSummary.recentEvents.map((event) => (
              <div className="event-row" key={event.id}>
                <span className={event.source === 'ai' ? 'event-dot event-dot--ai' : event.source === 'activity' ? 'event-dot event-dot--activity' : event.severity === 'warn' || event.severity === 'error' ? 'event-dot event-dot--warn' : 'event-dot event-dot--info'} />
                <div className="event-row__body">
                  <span className="event-row__type">{event.eventType}</span>
                  {event.summary ? <p className="event-row__summary">{event.summary}</p> : null}
                  <span className="event-row__context">
                    {event.installationId ?? 'no installation'}
                    {event.actorId ? ` · ${event.actorId}` : ''}
                  </span>
                </div>
                <div className="event-row__meta">
                  <span className="tag-soft tag-soft--gray">{event.source}</span>
                  <br />{formatUtcDateTime(event.occurredAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="list-muted">No telemetry or activity recorded for this workspace yet.</p>
        )}
      </section>
    </>
  );
}
