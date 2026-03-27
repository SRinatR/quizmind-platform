'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type ExtensionInstallationDisconnectResult,
  type ExtensionInstallationInventorySnapshot,
  type ExtensionInstallationRotateSessionResult,
} from '@quizmind/contracts';
import { useState, useTransition } from 'react';

interface InstallationsPageClientProps {
  snapshot: ExtensionInstallationInventorySnapshot;
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

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Unavailable';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatCompatibilityTone(status: string) {
  return status === 'supported' ? 'tag' : 'tag warn';
}

export function InstallationsPageClient({ snapshot }: InstallationsPageClientProps) {
  const router = useRouter();
  const [actionReason, setActionReason] = useState('');
  const [pendingInstallationId, setPendingInstallationId] = useState<string | null>(null);
  const [pendingRotationInstallationId, setPendingRotationInstallationId] = useState<string | null>(null);
  const [rotatedSession, setRotatedSession] = useState<ExtensionInstallationRotateSessionResult | null>(null);
  const [copiedRotatedToken, setCopiedRotatedToken] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const activeSessionTotal = snapshot.items.reduce((sum, installation) => sum + installation.activeSessionCount, 0);
  const reconnectRequiredCount = snapshot.items.filter((installation) => installation.requiresReconnect).length;
  const compatibilityWarningCount = snapshot.items.filter(
    (installation) => installation.compatibility.status !== 'supported',
  ).length;
  const normalizedActionReason = actionReason.trim();

  async function handleDisconnect(installationId: string) {
    if (!normalizedActionReason) {
      setErrorMessage('Provide an operator reason before disconnecting or rotating installation sessions.');
      return;
    }

    setPendingInstallationId(installationId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/extension/installations/disconnect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          installationId,
          workspaceId: snapshot.workspace.id,
          reason: normalizedActionReason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as DisconnectRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setPendingInstallationId(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to disconnect the installation right now.');
        return;
      }

      setPendingInstallationId(null);
      setStatusMessage(
        `${payload.data.installationId} disconnected. Revoked ${payload.data.revokedSessionCount} active installation session${payload.data.revokedSessionCount === 1 ? '' : 's'}.`,
      );

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setPendingInstallationId(null);
      setErrorMessage('Unable to disconnect the installation right now.');
    }
  }

  async function handleRotateSession(installationId: string) {
    if (!normalizedActionReason) {
      setErrorMessage('Provide an operator reason before disconnecting or rotating installation sessions.');
      return;
    }

    setPendingRotationInstallationId(installationId);
    setStatusMessage(null);
    setErrorMessage(null);
    setRotatedSession(null);
    setCopiedRotatedToken(false);

    try {
      const response = await fetch('/api/extension/installations/rotate-session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          installationId,
          workspaceId: snapshot.workspace.id,
          reason: normalizedActionReason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as RotateSessionRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setPendingRotationInstallationId(null);
        setErrorMessage(payload?.error?.message ?? 'Unable to rotate the installation session right now.');
        return;
      }

      setPendingRotationInstallationId(null);
      setRotatedSession(payload.data);
      setStatusMessage(
        `${payload.data.installationId} rotated. Revoked ${payload.data.revokedSessionCount} active installation session${payload.data.revokedSessionCount === 1 ? '' : 's'}.`,
      );

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setPendingRotationInstallationId(null);
      setErrorMessage('Unable to rotate the installation session right now.');
    }
  }

  async function handleCopyRotatedToken() {
    if (!rotatedSession?.session.token) {
      return;
    }

    try {
      await navigator.clipboard.writeText(rotatedSession.session.token);
      setCopiedRotatedToken(true);
    } catch {
      setErrorMessage('Unable to copy the rotated token right now.');
    }
  }

  if (snapshot.items.length === 0) {
    return (
      <section className="empty-state">
        <span className="micro-label">Installations</span>
        <h2>No extension installations are bound to this workspace yet.</h2>
        <p>Open the extension and use the site bridge to connect the first managed installation.</p>
        <div className="link-row">
          <Link className="btn-ghost" href="/app/usage">
            Open usage
          </Link>
          <Link className="btn-ghost" href="/app/settings">
            Open settings
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">Installations</span>
          <p className="stat-value">{snapshot.items.length}</p>
          <p className="metric-copy">{snapshot.workspace.name}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Active sessions</span>
          <p className="stat-value">{activeSessionTotal}</p>
          <p className="metric-copy">Short-lived installation tokens currently alive</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Reconnect required</span>
          <p className="stat-value">{reconnectRequiredCount}</p>
          <p className="metric-copy">Installations that must rebind or refresh auth</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">Compatibility warnings</span>
          <p className="stat-value">{compatibilityWarningCount}</p>
          <p className="metric-copy">Deprecated, warning, or unsupported installation versions</p>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">Fleet</span>
        <h2>Managed extension installations</h2>
        <p>
          Platform bind, compatibility, and installation session state are now visible in one workspace-scoped inventory.
        </p>
        <label className="admin-ticket-field">
          <span className="micro-label">Operator reason (required for rotate/disconnect)</span>
          <textarea
            maxLength={500}
            onChange={(event) => setActionReason(event.target.value)}
            placeholder="Example: Investigating suspicious token activity reported by support."
            rows={3}
            value={actionReason}
          />
        </label>
        {statusMessage ? <p className="admin-inline-status">{statusMessage}</p> : null}
        {errorMessage ? <p className="admin-inline-error">{errorMessage}</p> : null}
        {rotatedSession ? (
          <div className="auth-highlight">
            <span className="micro-label">Rotated token</span>
            <strong>New installation session issued for {rotatedSession.installationId}</strong>
            <p>
              Token: <span className="monospace">{rotatedSession.session.token}</span>
            </p>
            <p>
              Expires: <span className="monospace">{formatDateTime(rotatedSession.session.expiresAt)}</span>
              {' '}| Refresh after: <span className="monospace">{rotatedSession.session.refreshAfterSeconds}s</span>
            </p>
            <button className="btn-ghost" onClick={() => void handleCopyRotatedToken()} type="button">
              {copiedRotatedToken ? 'Token copied' : 'Copy rotated token'}
            </button>
          </div>
        ) : null}
        <div className="list-stack">
          {snapshot.items.map((installation) => {
            const disconnectDisabled =
              !snapshot.disconnectDecision.allowed ||
              normalizedActionReason.length === 0 ||
              installation.activeSessionCount === 0 ||
              pendingInstallationId === installation.installationId;
            const rotateDisabled =
              !snapshot.disconnectDecision.allowed ||
              normalizedActionReason.length === 0 ||
              pendingRotationInstallationId === installation.installationId;

            return (
              <div className="list-item" key={installation.installationId}>
                <strong>{installation.installationId}</strong>
                <p>
                  {installation.browser} | v{installation.extensionVersion} | schema {installation.schemaVersion}
                </p>
                <div className="tag-row">
                  <span className={formatCompatibilityTone(installation.compatibility.status)}>
                    {installation.compatibility.status}
                  </span>
                  <span className={installation.requiresReconnect ? 'tag warn' : 'tag'}>
                    {installation.requiresReconnect ? 'reconnect required' : 'connected'}
                  </span>
                  <span className="tag">{installation.activeSessionCount} active session{installation.activeSessionCount === 1 ? '' : 's'}</span>
                </div>
                <span className="list-muted">
                  Bound {formatDateTime(installation.boundAt)} | last seen {formatDateTime(installation.lastSeenAt)} | token expires{' '}
                  {formatDateTime(installation.lastSessionExpiresAt)}
                </span>
                {installation.compatibility.reason ? <p>{installation.compatibility.reason}</p> : null}
                <div className="tag-row">
                  {installation.capabilities.map((capability) => (
                    <span className="tag" key={`${installation.installationId}:${capability}`}>
                      {capability}
                    </span>
                  ))}
                </div>
                <div className="link-row">
                  <button
                    className="btn-ghost"
                    disabled={rotateDisabled}
                    onClick={() => void handleRotateSession(installation.installationId)}
                    type="button"
                  >
                    {pendingRotationInstallationId === installation.installationId ? 'Rotating...' : 'Rotate token'}
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={disconnectDisabled}
                    onClick={() => void handleDisconnect(installation.installationId)}
                    type="button"
                  >
                    {pendingInstallationId === installation.installationId
                      ? 'Disconnecting...'
                      : installation.activeSessionCount === 0
                        ? 'Disconnected'
                        : 'Disconnect installation'}
                  </button>
                  <Link className="btn-ghost" href={`/app/usage?workspaceId=${snapshot.workspace.id}`}>
                    Open usage
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
