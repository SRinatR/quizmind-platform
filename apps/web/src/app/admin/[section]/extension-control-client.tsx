'use client';

import {
  type ExtensionBootstrapRequest,
  type ExtensionBootstrapPayload,
} from '@quizmind/contracts';
import { useState } from 'react';

interface ExtensionControlClientProps {
  initialRequest: ExtensionBootstrapRequest;
  initialResult: ExtensionBootstrapPayload | null;
  planOptions: string[];
  workspaceOptions: Array<{
    id: string;
    name: string;
  }>;
}

interface RouteResponse {
  ok: boolean;
  data?: ExtensionBootstrapPayload;
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

export function ExtensionControlClient({
  initialRequest,
  initialResult,
  planOptions,
  workspaceOptions,
}: ExtensionControlClientProps) {
  const [formState, setFormState] = useState({
    installationId: initialRequest.installationId,
    userId: initialRequest.userId,
    workspaceId: initialRequest.workspaceId ?? '',
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
      const response = await fetch('/api/admin/extension/bootstrap', {
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
          ...(formState.workspaceId.trim() ? { workspaceId: formState.workspaceId.trim() } : {}),
          ...(formState.planCode.trim() ? { planCode: formState.planCode.trim() } : {}),
        } satisfies ExtensionBootstrapRequest),
      });
      const payload = (await response.json().catch(() => null)) as RouteResponse | null;

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
              <span className="micro-label">Workspace</span>
              <select
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    workspaceId: event.target.value,
                  }))
                }
                value={formState.workspaceId}
              >
                <option value="">No workspace binding</option>
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
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
              <select
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    planCode: event.target.value,
                  }))
                }
                value={formState.planCode}
              >
                <option value="">Resolve from workspace subscription</option>
                {planOptions.map((planCode) => (
                  <option key={planCode} value={planCode}>
                    {planCode}
                  </option>
                ))}
              </select>
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
    </div>
  );
}
