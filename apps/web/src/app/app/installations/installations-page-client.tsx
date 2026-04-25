'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type ExtensionConnectionStatus,
  type ExtensionInstallationDisconnectResult,
  type ExtensionInstallationInventorySnapshot,
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
  const [pendingInstallationId, setPendingInstallationId] = useState<string | null>(null);
  const [cardMessages, setCardMessages] = useState<Record<string, { type: 'info' | 'error'; text: string }>>({});
  const [, startTransition] = useTransition();

  const connectedCount = snapshot.items.filter((i) => i.connectionStatus === 'connected' || i.connectionStatus === 'expiring_soon').length;
  const reconnectRequiredCount = snapshot.items.filter((i) => i.connectionStatus === 'reconnect_required').length;
  const compatibilityWarningCount = snapshot.items.filter((i) => i.compatibility.status !== 'supported').length;

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
    const shouldDisconnect = window.confirm(ti.logoutConfirm);

    if (!shouldDisconnect) {
      return;
    }

    setPendingInstallationId(installationId);
    clearCardMessage(installationId);

    try {
      const response = await fetch('/bff/extension/installations/self-disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installationId }),
      });
      const payload = (await response.json().catch(() => null)) as DisconnectRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setPendingInstallationId(null);
        setCardMessage(installationId, 'error', payload?.error?.message ?? ti.disconnectError);
        return;
      }

      setPendingInstallationId(null);
      setCardMessage(installationId, 'info', `${ti.loggedOut}. ${payload.data.revokedSessionCount} ${ti.activeSessions.toLowerCase()} revoked.`);
      startTransition(() => { router.refresh(); });
    } catch {
      setPendingInstallationId(null);
      setCardMessage(installationId, 'error', ti.disconnectError);
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
            const isDisconnecting = pendingInstallationId === installation.installationId;
            const disconnectDisabled = installation.activeSessionCount === 0 || isDisconnecting;

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

                <div className="link-row" style={{ marginTop: '10px' }}>
                  <button
                    className={disconnectDisabled ? 'btn-ghost' : 'btn-danger'}
                    disabled={disconnectDisabled}
                    onClick={() => void handleDisconnect(installation.installationId)}
                    type="button"
                  >
                    {isDisconnecting
                      ? ti.loggingOut
                      : installation.activeSessionCount === 0
                        ? ti.loggedOut
                        : ti.logout}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
