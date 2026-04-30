'use client';

import { useRouter } from 'next/navigation';
import {
  type ExtensionConnectionStatus,
  type ExtensionInstallationDisconnectResult,
  type ExtensionInstallationInventoryItem,
  type ExtensionInstallationInventorySnapshot,
} from '@quizmind/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { usePreferences } from '../../../lib/preferences';
import { useAutoRefresh } from '../../../lib/use-auto-refresh';

interface InstallationsPageClientProps {
  snapshot: ExtensionInstallationInventorySnapshot;
}

interface DisconnectRouteResponse {
  ok: boolean;
  data?: ExtensionInstallationDisconnectResult;
  error?: { message?: string };
}

interface LogoutAllRouteResponse {
  ok: boolean;
  data?: { revoked: boolean; revokedCount: number };
  error?: { message?: string };
}
const maxDeviceLabelLength = 120;

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

function ConnectionStatusBadge({ status, ti }: { status: ExtensionConnectionStatus; ti: ReturnType<typeof usePreferences>['t']['installs'] }) {
  if (status === 'connected') {
    return <span className="tag-soft tag-soft--green">{ti.statusConnected}</span>;
  }

  if (status === 'offline') {
    return <span className="tag-soft">{ti.statusOffline}</span>;
  }

  if (status === 'expiring_soon') {
    return <span className="tag-soft tag-soft--orange">{ti.statusExpiringSoon}</span>;
  }

  return <span className="tag-soft tag-soft--orange">{ti.statusReconnectRequired}</span>;
}

function isVisibleInstallation(installation: ExtensionInstallationInventoryItem): boolean {
  return installation.connectionStatus !== 'reconnect_required' && installation.requiresReconnect !== true;
}

function getBrowserDisplayName(installation: ExtensionInstallationInventoryItem): string {
  const rawName = (installation.browserName ?? installation.browser ?? '').toLowerCase();
  if (rawName === 'chrome') return 'Chrome';
  if (rawName === 'edge') return 'Edge';
  if (rawName === 'firefox') return 'Firefox';
  if (rawName === 'unknown' || rawName === 'other' || rawName.length === 0) return 'Browser';
  return rawName.charAt(0).toUpperCase() + rawName.slice(1);
}

function getInstallationTitle(installation: ExtensionInstallationInventoryItem): string {
  if (installation.deviceLabel) return installation.deviceLabel;
  const browserDisplay = getBrowserDisplayName(installation);
  if (installation.osName) return `${browserDisplay} on ${installation.osName}`;
  if (installation.platform) return `${browserDisplay} on ${installation.platform}`;
  return `${browserDisplay} extension`;
}

function getInstallationSubtitle(installation: ExtensionInstallationInventoryItem): string {
  const parts: string[] = [`Extension ${installation.extensionVersion}`];
  if (installation.browserVersion) {
    parts.push(`${getBrowserDisplayName(installation)} ${installation.browserVersion}`);
  }
  if (installation.osName) {
    parts.push(`${installation.osName}${installation.osVersion ? ` ${installation.osVersion}` : ''}`);
  }
  return parts.join(', ');
}

export function InstallationsPageClient({ snapshot }: InstallationsPageClientProps) {
  const router = useRouter();
  const { t } = usePreferences();
  const ti = t.installs;
  const s = t.settings;
  const [liveSnapshot, setLiveSnapshot] = useState(snapshot);
  const [pendingInstallationId, setPendingInstallationId] = useState<string | null>(null);
  const [cardMessages, setCardMessages] = useState<Record<string, { type: 'info' | 'error'; text: string }>>({});
  const [logoutAllStatusMessage, setLogoutAllStatusMessage] = useState<string | null>(null);
  const [logoutAllErrorMessage, setLogoutAllErrorMessage] = useState<string | null>(null);
  const [isRevokingEverywhere, setIsRevokingEverywhere] = useState(false);
  const [editingInstallationId, setEditingInstallationId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const refreshInstallations = useCallback(async (signal: AbortSignal) => {
    const response = await fetch('/bff/extension/installations', { cache: 'no-store', signal });
    const payload = (await response.json().catch(() => null)) as { ok: boolean; data?: ExtensionInstallationInventorySnapshot; error?: { message?: string } } | null;
    if (!response.ok || !payload?.ok || !payload.data) {
      throw new Error(payload?.error?.message ?? 'Refresh failed');
    }
    setLiveSnapshot(payload.data);
  }, []);

  const { isRefreshing, lastUpdatedAt, error, refreshNow } = useAutoRefresh({
    enabled: true,
    intervalMs: 20_000,
    refresh: refreshInstallations,
    pauseWhenHidden: true,
  });

  useEffect(() => {
    setLiveSnapshot(snapshot);
  }, [snapshot]);

  const visibleItems = liveSnapshot.items.filter(isVisibleInstallation);
  const connectedItems = visibleItems.filter((installation) => installation.connectionStatus === 'connected' || installation.connectionStatus === 'expiring_soon');
  const activeSessionCount = connectedItems.reduce((sum, installation) => sum + installation.activeSessionCount, 0);
  const compatibilityWarningCount = visibleItems.filter((i) => i.compatibility.status !== 'supported').length;
  const refreshStatus = useMemo(() => {
    if (error) return 'Refresh failed';
    if (!lastUpdatedAt) return null;
    const seconds = Math.floor((Date.now() - lastUpdatedAt) / 1000);
    return seconds < 5 ? 'Updated just now' : `Updated ${seconds}s ago`;
  }, [error, lastUpdatedAt]);

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
      await refreshNow();
    } catch {
      setPendingInstallationId(null);
      setCardMessage(installationId, 'error', ti.disconnectError);
    }
  }

  async function handleLogoutAll() {
    setLogoutAllErrorMessage(null);
    setLogoutAllStatusMessage(s.security.signingOut);
    setIsRevokingEverywhere(true);

    try {
      const response = await fetch('/bff/auth/logout-all', { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as LogoutAllRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data?.revoked) {
        setIsRevokingEverywhere(false);
        setLogoutAllStatusMessage(null);
        setLogoutAllErrorMessage(payload?.error?.message ?? s.errors.unableToSignOut);
        return;
      }

      router.push('/auth/login?next=/app/installations');
      router.refresh();
    } catch {
      setIsRevokingEverywhere(false);
      setLogoutAllStatusMessage(null);
      setLogoutAllErrorMessage(s.errors.unableToSignOutAll);
    }
  }

  function startRename(installation: ExtensionInstallationInventoryItem) {
    setEditingInstallationId(installation.installationId);
    setRenameDraft(installation.deviceLabel ?? '');
    clearCardMessage(installation.installationId);
  }

  function cancelRename(installationId: string) {
    setEditingInstallationId(null);
    setRenameDraft('');
    clearCardMessage(installationId);
  }

  async function saveRename(installation: ExtensionInstallationInventoryItem, clear = false) {
    const nextLabel = clear ? null : renameDraft.trim() || null;
    if (!clear && renameDraft.trim().length > maxDeviceLabelLength) {
      setCardMessage(installation.installationId, 'error', `${ti.deviceName} max ${maxDeviceLabelLength} chars.`);
      return;
    }

    setIsRenaming(true);
    clearCardMessage(installation.installationId);
    try {
      const response = await fetch(`/bff/extension/installations/${installation.installationId}/label`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceLabel: nextLabel }),
      });
      const payload = (await response.json().catch(() => null)) as { ok: boolean; data?: { deviceLabel: string | null }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.ok) {
        setCardMessage(installation.installationId, 'error', payload?.error?.message ?? ti.deviceRenameFailed);
        setIsRenaming(false);
        return;
      }

      setLiveSnapshot((prev) => ({
        ...prev,
        items: prev.items.map((item) => (
          item.installationId === installation.installationId
            ? { ...item, deviceLabel: payload.data?.deviceLabel ?? undefined }
            : item
        )),
      }));
      setCardMessage(installation.installationId, 'info', ti.deviceRenameSaved);
      setEditingInstallationId(null);
      setRenameDraft('');
    } catch {
      setCardMessage(installation.installationId, 'error', ti.deviceRenameFailed);
    } finally {
      setIsRenaming(false);
    }
  }

  return (
    <>
      <section className="panel" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span className="micro-label">Live status</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn-ghost" type="button" onClick={() => void refreshNow()} disabled={isRefreshing} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            {refreshStatus ? (
              <span className="list-muted" style={{ fontSize: '0.78rem' }}>{refreshStatus}</span>
            ) : null}
          </div>
        </div>
      </section>
      {visibleItems.length === 0 ? (
        <section className="empty-state">
          <span className="micro-label">{ti.devicesLabel}</span>
          <h2>{ti.noInstallations}</h2>
          <p>{ti.noInstallationsDesc}</p>
          <p>{ti.removedExtensionsDisappear}</p>
        </section>
      ) : (
        <>
          <section className="metrics-grid">
            <article className="stat-card">
              <span className="micro-label">{ti.devicesLabel}</span>
              <p className="stat-value">{visibleItems.length}</p>
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
            <p>{ti.devicesDesc} {ti.sessionAutoRefresh}</p>
            <p className="list-muted">{ti.hardwareModelUnavailableNote}</p>

            <div className="installation-list" style={{ marginTop: '16px' }}>
              {visibleItems.map((installation) => {
                const cardMessage = cardMessages[installation.installationId];
                const isDisconnecting = pendingInstallationId === installation.installationId;
                const isEditing = editingInstallationId === installation.installationId;
                const labelLength = renameDraft.trim().length;
                const isLabelTooLong = labelLength > maxDeviceLabelLength;

                return (
                  <div className="installation-row" key={installation.installationId}>
                    <div className="installation-row__header">
                      <div className="installation-row__device-info">
                        <span className="installation-row__device-title">{getInstallationTitle(installation)}</span>
                        <span className="installation-row__device-subtitle">{getInstallationSubtitle(installation)}</span>
                      </div>
                      <div className="installation-row__badges">
                        <ConnectionStatusBadge status={installation.connectionStatus} ti={ti} />
                        {installation.compatibility.status !== 'supported' ? (
                          <span className="tag-soft tag-soft--orange">{installation.compatibility.status}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="kv-list" style={{ marginTop: '8px' }}>
                      <div className="kv-row">
                        <span className="kv-row__key">{ti.signedIn}</span>
                        <span className="kv-row__value">{formatDateTime(installation.signedInAt ?? installation.boundAt)}</span>
                      </div>
                      <div className="kv-row">
                        <span className="kv-row__key">{ti.lastSeen}</span>
                        <span className="kv-row__value">{installation.connectionStatus === 'connected' || installation.connectionStatus === 'expiring_soon' ? ti.onlineNow : `${ti.lastSeenPrefix} ${formatRelativeTime(installation.lastSeenAt)}`}</span>
                      </div>
                      <div className="kv-row">
                        <span className="kv-row__key">{ti.sessionValidUntil}</span>
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
                        className="btn-outline"
                        disabled={isRenaming}
                        onClick={() => startRename(installation)}
                        type="button"
                      >
                        {ti.renameDevice}
                      </button>
                      <button
                        className={isDisconnecting ? 'btn-ghost' : 'btn-danger-outline'}
                        disabled={isDisconnecting || isRenaming}
                        onClick={() => void handleDisconnect(installation.installationId)}
                        type="button"
                      >
                        {isDisconnecting ? ti.loggingOut : ti.logout}
                      </button>
                    </div>
                    {isEditing ? (
                      <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                        <label style={{ display: 'grid', gap: '6px' }}>
                          <span className="micro-label">{ti.deviceName}</span>
                          <input
                            maxLength={maxDeviceLabelLength + 1}
                            placeholder={ti.deviceNamePlaceholder}
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                          />
                        </label>
                        <span className="list-muted" style={{ fontSize: '0.78rem' }}>{ti.deviceRenameHelp}</span>
                        <span className="list-muted" style={{ fontSize: '0.78rem' }}>{labelLength}/{maxDeviceLabelLength}</span>
                        {isLabelTooLong ? <span className="banner banner-error">{ti.deviceRenameFailed}</span> : null}
                        <div className="link-row">
                          <button className="btn-primary" type="button" disabled={isRenaming || isLabelTooLong} onClick={() => void saveRename(installation)}>
                            {ti.saveDeviceName}
                          </button>
                          <button className="btn-ghost" type="button" disabled={isRenaming} onClick={() => cancelRename(installation.installationId)}>
                            {ti.cancelRename}
                          </button>
                          <button className="btn-ghost" type="button" disabled={isRenaming} onClick={() => void saveRename(installation, true)}>
                            {ti.clearDeviceName}
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
      )}

      {visibleItems.length > 0 ? (
        <section className="panel">
          <span className="micro-label">{ti.sessionControls}</span>
          <h2>{ti.signOutEverywhere}</h2>
          <p>{ti.signOutEverywhereDesc}</p>

          {logoutAllStatusMessage ? (
            <div className="banner banner-info" style={{ marginTop: '12px' }}>{logoutAllStatusMessage}</div>
          ) : null}
          {logoutAllErrorMessage ? (
            <div className="banner banner-error" style={{ marginTop: '12px' }}>{logoutAllErrorMessage}</div>
          ) : null}

          <div className="link-row" style={{ marginTop: '12px' }}>
            <button
              className="btn-danger-outline"
              disabled={isRevokingEverywhere}
              onClick={() => void handleLogoutAll()}
              type="button"
            >
              {isRevokingEverywhere ? s.security.signingOut : ti.signOutEverywhere}
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
