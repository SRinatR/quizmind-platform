'use client';

import { useRouter } from 'next/navigation';
import {
  type ExtensionBootstrapPayload,
  type ExtensionBootstrapRequest,
  type UsageEventIngestResult,
  type UsageEventPayload,
} from '@quizmind/contracts';
import { useState, useTransition } from 'react';

import { formatUtcDateTime } from '../../../lib/datetime';
import { type UsageSummarySnapshot } from '../../../lib/api';

interface ExtensionControlClientProps {
  initialRequest: ExtensionBootstrapRequest;
  initialResult: ExtensionBootstrapPayload | null;
  initialUsageEvent: UsageEventPayload;
  usageSummary: UsageSummarySnapshot | null;
}

interface BootstrapRouteResponse {
  ok: boolean;
  data?: ExtensionBootstrapPayload;
  error?: {
    message?: string;
  };
}

interface UsageRouteResponse {
  ok: boolean;
  data?: UsageEventIngestResult;
  error?: {
    message?: string;
  };
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseCapabilities(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatQuotaValue(consumed: number, limit?: number) {
  return typeof limit === 'number' ? `${consumed}/${limit}` : `${consumed}`;
}

function formatWindow(start?: string, end?: string) {
  if (!start || !end) {
    return 'Current window unavailable';
  }

  return `${formatUtcDateTime(start)} - ${formatUtcDateTime(end)}`;
}

function parseUsagePayload(value: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Payload must be valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Payload must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

export function ExtensionControlClient({
  initialRequest,
  initialResult,
  initialUsageEvent,
  usageSummary,
}: ExtensionControlClientProps) {
  const router = useRouter();
  const [isRefreshingSnapshot, startRefresh] = useTransition();
  const [formState, setFormState] = useState({
    installationId: initialRequest.installationId,
    userId: initialRequest.userId,
    environment: initialRequest.environment,
    planCode: initialRequest.planCode ?? '',
    extensionVersion: initialRequest.handshake.extensionVersion,
    schemaVersion: initialRequest.handshake.schemaVersion,
    capabilities: initialRequest.handshake.capabilities.join(', '),
    browser: initialRequest.handshake.browser,
  });
  const [result, setResult] = useState<ExtensionBootstrapPayload | null>(initialResult);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    'Adjust the bootstrap request, run the simulation, and inspect the exact compatibility, flag, and remote-config output the extension would receive.',
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [usageFormState, setUsageFormState] = useState({
    installationId: initialUsageEvent.installationId,
    eventType: initialUsageEvent.eventType,
    occurredAt: initialUsageEvent.occurredAt,
    payload: stringifyJson(initialUsageEvent.payload),
  });
  const [usageStatusMessage, setUsageStatusMessage] = useState<string | null>(
    'Queue a telemetry event to exercise the worker pipeline and refresh the workspace usage snapshot.',
  );
  const [usageErrorMessage, setUsageErrorMessage] = useState<string | null>(null);
  const [lastQueuedEvent, setLastQueuedEvent] = useState<UsageEventIngestResult | null>(null);
  const [isQueueingUsageEvent, setIsQueueingUsageEvent] = useState(false);

  async function handleSimulate() {
    const capabilities = parseCapabilities(formState.capabilities);

    if (
      !formState.installationId.trim() ||
      !formState.userId.trim() ||
      !formState.environment.trim() ||
      !formState.extensionVersion.trim() ||
      !formState.schemaVersion.trim() ||
      capabilities.length === 0
    ) {
      setStatusMessage(null);
      setErrorMessage('installationId, userId, environment, extensionVersion, schemaVersion, and capabilities are required.');
      return;
    }

    setIsSimulating(true);
    setErrorMessage(null);
    setStatusMessage(`Simulating bootstrap for ${formState.installationId.trim()}...`);

    try {
      const response = await fetch('/bff/admin/extension/bootstrap', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          installationId: formState.installationId.trim(),
          userId: formState.userId.trim(),
          environment: formState.environment.trim(),
          handshake: {
            extensionVersion: formState.extensionVersion.trim(),
            schemaVersion: formState.schemaVersion.trim(),
            capabilities,
            browser: formState.browser,
          },
          ...(formState.planCode.trim() ? { planCode: formState.planCode.trim() } : {}),
        } satisfies ExtensionBootstrapRequest),
      });
      const payload = (await response.json().catch(() => null)) as BootstrapRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsSimulating(false);
        setStatusMessage(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to simulate extension bootstrap right now.');
        return;
      }

      setResult(payload.data);
      setIsSimulating(false);
      setStatusMessage('Bootstrap simulation refreshed from the live API.');
    } catch {
      setIsSimulating(false);
      setStatusMessage(null);
      setErrorMessage('Unable to reach the extension bootstrap simulation route right now.');
    }
  }

  async function handleQueueUsageEvent() {
    if (!usageFormState.installationId.trim() || !usageFormState.eventType.trim() || !usageFormState.occurredAt.trim()) {
      setUsageStatusMessage(null);
      setUsageErrorMessage('installationId, eventType, and occurredAt are required.');
      return;
    }

    const occurredAt = new Date(usageFormState.occurredAt.trim());

    if (Number.isNaN(occurredAt.getTime())) {
      setUsageStatusMessage(null);
      setUsageErrorMessage('occurredAt must be a valid ISO datetime string.');
      return;
    }

    let parsedPayload: Record<string, unknown>;

    try {
      parsedPayload = parseUsagePayload(usageFormState.payload);
    } catch (error) {
      setUsageStatusMessage(null);
      setUsageErrorMessage(error instanceof Error ? error.message : 'Payload must be a JSON object.');
      return;
    }

    setIsQueueingUsageEvent(true);
    setUsageErrorMessage(null);
    setUsageStatusMessage(`Queueing ${usageFormState.eventType.trim()} for ${usageFormState.installationId.trim()}...`);

    try {
      const response = await fetch('/bff/admin/extension/usage-events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          installationId: usageFormState.installationId.trim(),
          eventType: usageFormState.eventType.trim(),
          occurredAt: occurredAt.toISOString(),
          payload: parsedPayload,
        } satisfies UsageEventPayload),
      });
      const payload = (await response.json().catch(() => null)) as UsageRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setIsQueueingUsageEvent(false);
        setUsageStatusMessage(null);
        setUsageErrorMessage(payload?.error?.message ?? 'Unable to queue usage event right now.');
        return;
      }

      setLastQueuedEvent(payload.data);
      setUsageFormState((current) => ({
        ...current,
        occurredAt: new Date().toISOString(),
      }));
      setIsQueueingUsageEvent(false);
      setUsageStatusMessage(`Queued ${payload.data.logEvent.eventType} at ${formatUtcDateTime(payload.data.job.createdAt)}.`);
      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setIsQueueingUsageEvent(false);
      setUsageStatusMessage(null);
      setUsageErrorMessage('Unable to reach the usage event ingest route right now.');
    }
  }

  return (
    <div className="admin-extension-simulator-shell">
      {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Request</span>
          <h2>Bootstrap input</h2>
          <div className="admin-ticket-editor">
            <label className="admin-ticket-field">
              <span className="micro-label">Installation ID</span>
              <input
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    installationId: event.target.value,
                  }))
                }
                value={formState.installationId}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">User ID</span>
              <input
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    userId: event.target.value,
                  }))
                }
                value={formState.userId}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Environment</span>
              <input
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    environment: event.target.value,
                  }))
                }
                value={formState.environment}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Plan code</span>
              <input
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    planCode: event.target.value,
                  }))
                }
                placeholder="pro"
                value={formState.planCode}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Browser</span>
              <select
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    browser: event.target.value as ExtensionBootstrapRequest['handshake']['browser'],
                  }))
                }
                value={formState.browser}
              >
                <option value="chrome">chrome</option>
                <option value="edge">edge</option>
                <option value="brave">brave</option>
                <option value="other">other</option>
              </select>
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Extension version</span>
              <input
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    extensionVersion: event.target.value,
                  }))
                }
                value={formState.extensionVersion}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Schema version</span>
              <input
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    schemaVersion: event.target.value,
                  }))
                }
                value={formState.schemaVersion}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Capabilities</span>
              <textarea
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    capabilities: event.target.value,
                  }))
                }
                placeholder="quiz-capture, history-sync, remote-sync"
                rows={4}
                value={formState.capabilities}
              />
            </label>
          </div>
          <div className="admin-user-actions">
            <button className="btn-primary" disabled={isSimulating} onClick={() => void handleSimulate()} type="button">
              {isSimulating ? 'Simulating...' : 'Run simulation'}
            </button>
          </div>
        </article>

        <article className="panel">
          <span className="micro-label">Summary</span>
          <h2>Resolved bootstrap output</h2>
          {result ? (
            <div className="admin-extension-snapshot-grid">
              <div className="admin-extension-snapshot-card">
                <strong>Compatibility</strong>
                <p>{result.compatibility.status}</p>
                <p className="list-muted">
                  min {result.compatibility.minimumVersion} | recommended {result.compatibility.recommendedVersion}
                </p>
                {result.compatibility.reason ? (
                  <p className="list-muted">{result.compatibility.reason}</p>
                ) : null}
              </div>
              <div className="admin-extension-snapshot-card">
                <strong>Feature flags</strong>
                <p>{result.featureFlags.length > 0 ? result.featureFlags.join(', ') : 'No flags resolved.'}</p>
              </div>
              <div className="admin-extension-snapshot-card">
                <strong>Applied config layers</strong>
                <p>
                  {result.remoteConfig.appliedLayerIds.length > 0
                    ? result.remoteConfig.appliedLayerIds.join(', ')
                    : 'No remote-config layers matched.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <span className="micro-label">No snapshot</span>
              <h2>Run the simulator to inspect extension bootstrap.</h2>
              <p>The result will show compatibility gating, resolved flags, and final remote-config values.</p>
            </div>
          )}
        </article>
      </section>

      {result ? (
        <section className="panel">
          <span className="micro-label">Resolved payload</span>
          <h2>Remote config values</h2>
          <div className="admin-extension-preview">
            <pre>{stringifyJson(result.remoteConfig.values)}</pre>
          </div>
        </section>
      ) : null}

      {usageStatusMessage ? <p className="admin-inline-status">{usageStatusMessage}</p> : null}
      {usageErrorMessage ? <p className="admin-inline-error">{usageErrorMessage}</p> : null}

      <section className="split-grid">
        <article className="panel">
          <span className="micro-label">Telemetry</span>
          <h2>Queue usage event</h2>
          <div className="admin-ticket-editor">
            <label className="admin-ticket-field">
              <span className="micro-label">Installation ID</span>
              <input
                onChange={(event) =>
                  setUsageFormState((current) => ({
                    ...current,
                    installationId: event.target.value,
                  }))
                }
                value={usageFormState.installationId}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Event type</span>
              <input
                onChange={(event) =>
                  setUsageFormState((current) => ({
                    ...current,
                    eventType: event.target.value,
                  }))
                }
                value={usageFormState.eventType}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Occurred at</span>
              <input
                onChange={(event) =>
                  setUsageFormState((current) => ({
                    ...current,
                    occurredAt: event.target.value,
                  }))
                }
                value={usageFormState.occurredAt}
              />
            </label>
            <label className="admin-ticket-field">
              <span className="micro-label">Payload JSON</span>
              <textarea
                onChange={(event) =>
                  setUsageFormState((current) => ({
                    ...current,
                    payload: event.target.value,
                  }))
                }
                rows={8}
                value={usageFormState.payload}
              />
            </label>
          </div>
          <div className="admin-user-actions">
            <button
              className="btn-primary"
              disabled={isQueueingUsageEvent}
              onClick={() => void handleQueueUsageEvent()}
              type="button"
            >
              {isQueueingUsageEvent ? 'Queueing...' : 'Queue usage event'}
            </button>
            <button
              className="btn-ghost"
              disabled={isRefreshingSnapshot}
              onClick={() =>
                startRefresh(() => {
                  router.refresh();
                })
              }
              type="button"
            >
              {isRefreshingSnapshot ? 'Refreshing...' : 'Refresh snapshot'}
            </button>
          </div>

          {lastQueuedEvent ? (
            <div className="admin-support-result">
              <span className="micro-label">Last queued job</span>
              <p>
                {lastQueuedEvent.logEvent.eventType} to {lastQueuedEvent.job.queue} / {lastQueuedEvent.job.id}
              </p>
              <p>
                Created {formatUtcDateTime(lastQueuedEvent.job.createdAt)}
                {lastQueuedEvent.job.dedupeKey ? ` | dedupe ${lastQueuedEvent.job.dedupeKey}` : ''}
              </p>
            </div>
          ) : null}
        </article>

        <article className="panel">
          <span className="micro-label">Usage snapshot</span>
          <h2>Current usage state</h2>
          {usageSummary ? (
            <div className="list-stack">
              <div className="list-item">
                <strong>Current window</strong>
                <p>{formatWindow(usageSummary.currentPeriodStart, usageSummary.currentPeriodEnd)}</p>
              </div>
              <div className="list-item">
                <strong>Installations</strong>
                <p>{usageSummary.installations.length}</p>
                <span className="list-muted">
                  {usageSummary.installations[0]
                    ? `${usageSummary.installations[0].installationId} last seen ${formatUtcDateTime(usageSummary.installations[0].lastSeenAt)}`
                    : 'No installations reported yet.'}
                </span>
              </div>
              {usageSummary.quotas.slice(0, 3).map((quota) => (
                <div className="list-item" key={quota.key}>
                  <strong>{quota.label}</strong>
                  <p>
                    {formatQuotaValue(quota.consumed, quota.limit)} | {quota.status}
                  </p>
                  <span className="list-muted">{formatWindow(quota.periodStart, quota.periodEnd)}</span>
                </div>
              ))}
              <div className="list-item">
                <strong>Recent activity</strong>
                <p>{usageSummary.recentEvents[0]?.summary ?? 'No recent telemetry or dashboard activity yet.'}</p>
                <span className="list-muted">
                  {usageSummary.recentEvents[0]
                    ? `${usageSummary.recentEvents[0].eventType} | ${formatUtcDateTime(usageSummary.recentEvents[0].occurredAt)}`
                    : 'Queue an event to exercise the worker pipeline.'}
                </span>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <span className="micro-label">No usage snapshot</span>
              <h2>Usage summary is unavailable.</h2>
              <p>Open the control plane with a connected admin session to inspect quotas and recent telemetry.</p>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
