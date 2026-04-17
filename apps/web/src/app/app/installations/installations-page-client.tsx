'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type ExtensionConnectionStatus,
  type ExtensionInstallationDisconnectResult,
  type ExtensionInstallationInventorySnapshot,
  type ExtensionInstallationRotateSessionResult,
} from '@quizmind/contracts';
import { useState, useTransition } from 'react';

import { usePreferences } from '../../../lib/preferences';

interface InstallationsPageClientProps {
  snapshot: ExtensionInstallationInventorySnapshot;
}

interface DisconnectRouteResponse {
  ok: boolean;
  data?: ExtensionInstallationDisconnectResult;
  error?: { message?: string };
}

interface RotateSessionRouteResponse {
  ok: boolean;
  data?: ExtensionInstallationRotateSessionResult;
  error?: { message?: string };
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatRelativeTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  const nowMs = Date.now();
  const diffMs = nowMs - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return 'just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function ConnectionStatusBadge({ status }: { status: ExtensionConnectionStatus }) {
  if (status === 'connected') {
    return <span className="tag-soft tag-soft--green">Connected</span>;
  }

  if (status === 'expiring_soon') {
    return <span className="tag-soft tag-soft--orange">Session expiring soon</span>;
  }

  return <span className="tag-soft tag-soft--orange">Reconnect required</span>;
}

export function InstallationsPageClient({ snapshot }: InstallationsPageClientProps) {
  const router = useRouter();
  const { t } = usePreferences();
  const ti = t.installs;
  const [expandedAdminCard, setExpandedAdminCard] = useState<string | null>(null);
  const [actionReasons, setActionReasons] = useState<Record<string, string>>({});
  const [pendingInstallationId, setPendingInstallationId] = useState<string | null>(null);
  const [pendingRotationInstallationId, setPendingRotationInstallationId] = useState<string | null>(null);
  const [rotatedSessions, setRotatedSessions] = useState<Record<string, ExtensionInstallationRotateSessionResult>>({});
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [cardMessages, setCardMessages] = useState<Record<string, { type: 'info' | 'error'; text: string }>>({});
  const [, startTransition] = useTransition();

  const connectedCount = snapshot.items.filter((i) => i.connectionStatus === 'connected' || i.connectionStatus === 'expiring_soon').length;
  const reconnectRequiredCount = snapshot.items.filter((i) => i.connectionStatus === 'reconnect_required').length;
  const compatibilityWarningCount = snapshot.items.filter((i) => i.compatibility.status !== 'supported').length;

  function getActionReason(installationId: string) {
    return actionReasons[installationId] ?? '';
  }

  function setActionReason(installationId: string, value: string) {
    setActionReasons((prev) => ({ ...prev, [installationId]: value }));
  }

  function setCardMessage(installationId: string, type: 'info' | 'error', text: string) {
    setCardMessages((prev) => ({ ...prev, [installationId]: { type, text } }));
  }

  function clearCardMessage(installationId: string) {
    setCardMessages((prev) => {
      const next = { ...prev };
      delete next[installationId];
      return next;
    });
  }

  async function handleDisconnect(installationId: string) {
    const reason = getActionReason(installationId).trim();

    if (!reason) {
      setCardMessage(installationId, 'error', ti.provideReasonError);
      return;
    }

    setPendingInstallationId(installationId);
    clearCardMessage(installationId);

    try {
      const response = await fetch('/bff/extension/installations/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installationId, reason }),
      });
      const payload = (await response.json().catch(() => null)) as DisconnectRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setPendingInstallationId(null);
        setCardMessage(installationId, 'error', payload?.error?.message ?? ti.disconnectError);
        return;
      }

      setPendingInstallationId(null);
      setCardMessage(installationId, 'info', `${ti.disconnect.toLowerCase()}. ${payload.data.revokedSessionCount} ${ti.activeSessions.toLowerCase()} revoked.`);
      startTransition(() => { router.refresh(); });
    } catch {
      setPendingInstallationId(null);
      setCardMessage(installationId, 'error', ti.disconnectError);
    }
  }

  async function handleRotateSession(installationId: string) {
    const reason = getActionReason(installationId).trim();

    if (!reason) {
      setCardMessage(installationId, 'error', ti.provideReasonError);
      return;
    }

    setPendingRotationInstallationId(installationId);
    clearCardMessage(installationId);
    setRotatedSessions((prev) => {
      const next = { ...prev };
      delete next[installationId];
      return next;
    });

    try {
      const response = await fetch('/bff/extension/installations/rotate-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installationId, reason }),
      });
      const payload = (await response.json().catch(() => null)) as RotateSessionRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setPendingRotationInstallationId(null);
        setCardMessage(installationId, 'error', payload?.error?.message ?? ti.rotateError);
        return;
      }

      setPendingRotationInstallationId(null);
      setRotatedSessions((prev) => ({ ...prev, [installationId]: payload.data! }));
      setCardMessage(installationId, 'info', `${ti.rotateToken.toLowerCase()} — new token issued.`);
      startTransition(() => { router.refresh(); });
    } catch {
      setPendingRotationInstallationId(null);
      setCardMessage(installationId, 'error', ti.rotateError);
    }
  }

  async function handleCopyToken(installationId: string) {
    const token = rotatedSessions[installationId]?.session.token;

    if (!token) return;

    try {
      await navigator.clipboard.writeText(token);
      setCopiedTokenId(installationId);
    } catch {
      setCardMessage(installationId, 'error', ti.copyTokenError);
    }
  }

  if (snapshot.items.length === 0) {
    return (
      <section className="empty-state">
        <span className="micro-label">{ti.devicesLabel}</span>
        <h2>{ti.noInstallations}</h2>
        <p>{ti.noInstallationsDesc}</p>
        <div className="link-row">
          <Link className="btn-ghost" href="/app/usage">{ti.openUsage}</Link>
          <Link className="btn-ghost" href="/app/settings">{ti.openSettings}</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">{ti.devicesLabel}</span>
          <p className="stat-value">{snapshot.items.length}</p>
          <p className="metric-copy">{ti.managedInstallations}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{ti.connectedDevices}</span>
          <p className="stat-value">{connectedCount}</p>
          <p className="metric-copy">{ti.connectedDevicesDesc}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{ti.reconnectRequired}</span>
          <p className="stat-value">{reconnectRequiredCount}</p>
          <p className="metric-copy">{ti.reconnectRequiredDesc}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{ti.compatibilityWarnings}</span>
          <p className="stat-value">{compatibilityWarningCount}</p>
          <p className="metric-copy">{ti.compatibilityWarningsDesc}</p>
        </article>
      </section>

      <section className="panel">
        <span className="micro-label">{ti.devicesLabel}</span>
        <h2>{ti.managedInstallations}</h2>
        <p>{ti.devicesDesc}</p>

        <div className="installation-list" style={{ marginTop: '16px' }}>
          {snapshot.items.map((installation) => {
            const cardMessage = cardMessages[installation.installationId];
            const rotatedSession = rotatedSessions[installation.installationId];
            const actionReason = getActionReason(installation.installationId);
            const isAdminExpanded = expandedAdminCard === installation.installationId;
            const canWrite = snapshot.disconnectDecision.allowed;
            const isDisconnecting = pendingInstallationId === installation.installationId;
            const isRotating = pendingRotationInstallationId === installation.installationId;
            const reasonTrimmed = actionReason.trim();
            const disconnectDisabled = !canWrite || !reasonTrimmed || installation.activeSessionCount === 0 || isDisconnecting;
            const rotateDisabled = !canWrite || !reasonTrimmed || isRotating;

            return (
              <div className="installation-row" key={installation.installationId}>
                <div className="installation-row__header">
                  <div className="installation-row__device-info">
                    <span className="installation-row__browser">{installation.browser}</span>
                    <span className="installation-row__version">v{installation.extensionVersion}</span>
                  </div>
                  <div className="installation-row__badges">
                    <ConnectionStatusBadge status={installation.connectionStatus} />
                    {installation.compatibility.status !== 'supported' ? (
                      <span className="tag-soft tag-soft--orange">{installation.compatibility.status}</span>
                    ) : null}
                  </div>
                </div>

                <div className="kv-list" style={{ marginTop: '8px' }}>
                  <div className="kv-row">
                    <span className="kv-row__key">{ti.lastSeen}</span>
                    <span className="kv-row__value">{formatRelativeTime(installation.lastSeenAt)}</span>
                  </div>
                  {installation.connectionStatus !== 'reconnect_required' ? (
                    <div className="kv-row">
                      <span className="kv-row__key">{ti.tokenExpires}</span>
                      <span className="kv-row__value">{formatDateTime(installation.lastSessionExpiresAt)}</span>
                    </div>
                  ) : null}
                  {installation.compatibility.reason ? (
                    <div className="kv-row">
                      <span className="kv-row__key">Compatibility</span>
                      <span className="kv-row__value">{installation.compatibility.reason}</span>
                    </div>
                  ) : null}
                </div>

                {installation.connectionStatus === 'reconnect_required' ? (
                  <p className="list-muted" style={{ fontSize: '0.84rem', margin: '8px 0 0' }}>
                    {ti.reconnectGuidance}
                  </p>
                ) : null}

                {cardMessage ? (
                  <div className={`banner ${cardMessage.type === 'error' ? 'banner-error' : 'banner-info'}`} style={{ marginTop: '8px' }}>
                    {cardMessage.text}
                  </div>
                ) : null}

                {rotatedSession ? (
                  <div className="connect-success" style={{ marginTop: '10px' }}>
                    <span className="micro-label">{ti.rotatedToken}</span>
                    <div className="connect-code-block">
                      <code>{rotatedSession.session.token}</code>
                      <button
                        className="connect-code-block__copy"
                        onClick={() => void handleCopyToken(installation.installationId)}
                        type="button"
                      >
                        {copiedTokenId === installation.installationId ? ti.copied : ti.copy}
                      </button>
                    </div>
                    <div className="kv-list" style={{ marginTop: '6px' }}>
                      <div className="kv-row">
                        <span className="kv-row__key">{ti.expires}</span>
                        <span className="kv-row__value">{formatDateTime(rotatedSession.session.expiresAt)}</span>
                      </div>
                      <div className="kv-row">
                        <span className="kv-row__key">{ti.refreshAfter}</span>
                        <span className="kv-row__value">{rotatedSession.session.refreshAfterSeconds}s</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="link-row" style={{ marginTop: '10px' }}>
                  <Link className="btn-ghost" href="/app/usage">{ti.usage}</Link>
                  {canWrite ? (
                    <button
                      className="btn-ghost"
                      onClick={() => setExpandedAdminCard(isAdminExpanded ? null : installation.installationId)}
                      type="button"
                    >
                      {ti.adminActionsToggle}
                    </button>
                  ) : null}
                </div>

                {isAdminExpanded && canWrite ? (
                  <div className="admin-actions-panel" style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        {ti.sessionDetails}
                      </summary>
                      <div className="kv-list" style={{ marginTop: '6px' }}>
                        <div className="kv-row">
                          <span className="kv-row__key">{ti.installationsLabel}</span>
                          <span className="kv-row__value" style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{installation.installationId}</span>
                        </div>
                        <div className="kv-row">
                          <span className="kv-row__key">{ti.bound}</span>
                          <span className="kv-row__value">{formatDateTime(installation.boundAt)}</span>
                        </div>
                        <div className="kv-row">
                          <span className="kv-row__key">{ti.schema}</span>
                          <span className="kv-row__value">{installation.schemaVersion}</span>
                        </div>
                        <div className="kv-row">
                          <span className="kv-row__key">{ti.activeSessions}</span>
                          <span className="kv-row__value">{installation.activeSessionCount}</span>
                        </div>
                      </div>
                    </details>

                    <label className="form-field" style={{ marginTop: '10px' }}>
                      <span className="form-field__label">
                        {ti.operatorReason} <span className="list-muted">{ti.operatorReasonHint}</span>
                      </span>
                      <textarea
                        maxLength={500}
                        onChange={(event) => setActionReason(installation.installationId, event.target.value)}
                        placeholder={ti.operatorReasonPlaceholder}
                        rows={2}
                        value={actionReason}
                      />
                    </label>

                    <div className="link-row" style={{ marginTop: '8px' }}>
                      <button
                        className="btn-ghost"
                        disabled={rotateDisabled}
                        onClick={() => void handleRotateSession(installation.installationId)}
                        type="button"
                      >
                        {isRotating ? ti.rotating : ti.rotateToken}
                      </button>
                      <button
                        className={disconnectDisabled ? 'btn-ghost' : 'btn-danger'}
                        disabled={disconnectDisabled}
                        onClick={() => void handleDisconnect(installation.installationId)}
                        type="button"
                      >
                        {isDisconnecting
                          ? ti.disconnecting
                          : installation.activeSessionCount === 0
                            ? ti.noActiveSessions
                            : ti.disconnect}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
