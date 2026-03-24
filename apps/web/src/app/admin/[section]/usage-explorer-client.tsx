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
          workspaceId: usageSummary.workspace.id,
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
    <div className="admin-feature-flags-shell">
      {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Export</span>
          <h2>Download usage snapshots</h2>
          <div className="admin-ticket-editor">
            <label className="admin-ticket-field">
              <span className="micro-label">Workspace</span>
              <select
                disabled={!canSelectWorkspace}
                onChange={(event) => updateWorkspaceScope(event.target.value)}
                value={usageSummary.workspace.id}
              >
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Format</span>
              <select
                onChange={(event) => handleFormatChange(event.target.value as UsageExportFormat)}
                value={exportFormat}
              >
                {usageExportFormats.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Scope</span>
              <select
                onChange={(event) => setExportScope(event.target.value as UsageExportScope)}
                value={exportScope}
              >
                {availableScopes.map((scope) => (
                  <option key={scope} value={scope}>
                    {scope}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="admin-user-actions">
            <button className="btn-primary" disabled={isExporting || !canExportUsage} onClick={() => void exportUsage()} type="button">
              {isExporting ? 'Exporting...' : 'Export usage'}
            </button>
          </div>
          <p className="admin-ticket-note">
            JSON supports full workspace snapshots. CSV is intentionally scoped to quotas, installations, or recent events.
          </p>
        </article>

        <article className="panel">
          <span className="micro-label">Summary</span>
          <h2>Current usage baseline</h2>
          <div className="tag-row">
            <span className="tag">{usageSummary.planCode}</span>
            <span className="tag">{usageSummary.subscriptionStatus}</span>
            <span className={canExportUsage ? 'tag' : 'tag warn'}>
              {canExportUsage ? 'export allowed' : 'export blocked'}
            </span>
          </div>
          <div className="mini-list">
            <div className="list-item">
              <strong>Workspace</strong>
              <p>{usageSummary.workspace.name}</p>
            </div>
            <div className="list-item">
              <strong>Primary quota</strong>
              <p>
                {highlightedQuota
                  ? `${highlightedQuota.label}: ${highlightedQuota.consumed}${
                      typeof highlightedQuota.limit === 'number' ? ` / ${highlightedQuota.limit}` : ''
                    }`
                  : 'No tracked quota snapshot is available.'}
              </p>
            </div>
            <div className="list-item">
              <strong>Current window</strong>
              <p>{formatWindow(usageSummary.currentPeriodStart, usageSummary.currentPeriodEnd)}</p>
            </div>
            <div className="list-item">
              <strong>Fleet + activity</strong>
              <p>
                {usageSummary.installations.length} installation{usageSummary.installations.length === 1 ? '' : 's'} |{' '}
                {usageSummary.recentEvents.length} recent event{usageSummary.recentEvents.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Quotas</span>
          <h2>Server-side quota counters</h2>
          {usageSummary.quotas.length > 0 ? (
            <div className="list-stack">
              {usageSummary.quotas.map((quota) => (
                <div className="list-item" key={quota.key}>
                  <strong>{quota.label}</strong>
                  <p>
                    {quota.consumed}
                    {typeof quota.limit === 'number' ? ` / ${quota.limit}` : ''} | {quota.status}
                  </p>
                  <span className="list-muted">{formatWindow(quota.periodStart, quota.periodEnd)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p>No quota counters are available for this workspace yet.</p>
          )}
        </article>

        <article className="panel">
          <span className="micro-label">Installations</span>
          <h2>Managed extension fleet</h2>
          {usageSummary.installations.length > 0 ? (
            <div className="list-stack">
              {usageSummary.installations.map((installation) => (
                <div className="list-item" key={installation.installationId}>
                  <strong>{installation.installationId}</strong>
                  <p>
                    {installation.browser} | v{installation.extensionVersion} | schema {installation.schemaVersion}
                  </p>
                  <span className="list-muted">
                    {installation.capabilities.join(', ') || 'No capabilities reported'} | last seen{' '}
                    {formatUtcDateTime(installation.lastSeenAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p>No extension installations have reported into this workspace yet.</p>
          )}
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Recent events</span>
        <h2>Telemetry and activity stream</h2>
        {usageSummary.recentEvents.length > 0 ? (
          <div className="list-stack">
            {usageSummary.recentEvents.map((event) => (
              <div className="list-item" key={event.id}>
                <strong>{event.eventType}</strong>
                <p>{event.summary}</p>
                <span className="list-muted">
                  {event.source}
                  {event.installationId ? ` | ${event.installationId}` : ''}
                  {event.actorId ? ` | actor ${event.actorId}` : ''}
                  {event.severity ? ` | ${event.severity}` : ''} | {formatUtcDateTime(event.occurredAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p>No telemetry or dashboard activity has been recorded for this workspace yet.</p>
        )}
      </section>
    </div>
  );
}
