'use client';

import { useRouter } from 'next/navigation';
import {
  type ExtensionConnectionStatus,
  type ExtensionInstallationDisconnectResult,
  type ExtensionInstallationInventoryItem,
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

function isActiveInstallation(installation: ExtensionInstallationInventoryItem): boolean {
  return (
    installation.activeSessionCount > 0
    && installation.connectionStatus !== 'reconnect_required'
    && installation.requiresReconnect !== true
  );
}

export function InstallationsPageClient({ snapshot }: InstallationsPageClientProps) {
  const router = useRouter();
  const { t } = usePreferences();
  const ti = t.installs;
  const [pendingInstallationId, setPendingInstallationId] = useState<string | null>(null);
  const [cardMessages, setCardMessages] = useState<Record<string, { type: 'info' | 'error'; text: string }>>({});
  const [, startTransition] = useTransition();

  const activeItems = snapshot.items.filter(isActiveInstallation);
  const activeSessionCount = activeItems.reduce((sum, installation) => sum + installation.activeSessionCount, 0);
  const compatibilityWarningCount = activeItems.filter((i) => i.compatibility.status !== 'supported').length;

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
      startTransition(() => { router.refresh(); });
    } catch {
      setPendingInstallationId(null);
      setCardMessage(installationId, 'error', ti.disconnectError);
    }
  }

  if (activeItems.length === 0) {
    return (
      <section className="empty-state">
        <span className="micro-label">{ti.devicesLabel}</span>
        <h2>{ti.noInstallations}</h2>
        <p>{ti.noInstallationsDesc}</p>
      </section>
    );
  }

  return (
    <>
      <section className="metrics-grid">
        <article className="stat-card">
          <span className="micro-label">{ti.devicesLabel}</span>
          <p className="stat-value">{activeItems.length}</p>
          <p className="metric-copy">{ti.managedInstallations}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{ti.connectedDevices}</span>
          <p className="stat-value">{activeSessionCount}</p>
          <p className="metric-copy">{ti.connectedDevicesDesc}</p>
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
          {activeItems.map((installation) => {
            const cardMessage = cardMessages[installation.installationId];
            const isDisconnecting = pendingInstallationId === installation.installationId;

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
                  <div className="kv-row">
                    <span className="kv-row__key">{ti.tokenExpires}</span>
                    <span className="kv-row__value">{formatDateTime(installation.lastSessionExpiresAt)}</span>
                  </div>
                  {installation.compatibility.reason ? (
                    <div className="kv-row">
                      <span className="kv-row__key">Compatibility</span>
                      <span className="kv-row__value">{installation.compatibility.reason}</span>
                    </div>
                  ) : null}
                </div>

                {cardMessage ? (
                  <div className={`banner ${cardMessage.type === 'error' ? 'banner-error' : 'banner-info'}`} style={{ marginTop: '8px' }}>
                    {cardMessage.text}
                  </div>
                ) : null}

                <div className="link-row" style={{ marginTop: '10px' }}>
                  <button
                    className={isDisconnecting ? 'btn-ghost' : 'btn-danger'}
                    disabled={isDisconnecting}
                    onClick={() => void handleDisconnect(installation.installationId)}
                    type="button"
                  >
                    {isDisconnecting ? ti.loggingOut : ti.logout}
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
