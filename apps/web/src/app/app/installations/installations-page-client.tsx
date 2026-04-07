'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
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

export function InstallationsPageClient({ snapshot }: InstallationsPageClientProps) {
  const router = useRouter();
  const { t } = usePreferences();
  const ti = t.installs;
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
      setErrorMessage(ti.provideReasonError);
      return;
    }

    setPendingInstallationId(installationId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch('/bff/extension/installations/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          installationId,
          reason: normalizedActionReason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as DisconnectRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setPendingInstallationId(null);
        setErrorMessage(payload?.error?.message ?? ti.disconnectError);
        return;
      }

      setPendingInstallationId(null);
      setStatusMessage(
        `${payload.data.installationId} — ${ti.disconnect.toLowerCase()}. ${payload.data.revokedSessionCount} ${ti.activeSessions.toLowerCase()}.`,
      );

      startTransition(() => { router.refresh(); });
    } catch {
      setPendingInstallationId(null);
      setErrorMessage(ti.disconnectError);
    }
  }

  async function handleRotateSession(installationId: string) {
    if (!normalizedActionReason) {
      setErrorMessage(ti.provideReasonError);
      return;
    }

    setPendingRotationInstallationId(installationId);
    setStatusMessage(null);
    setErrorMessage(null);
    setRotatedSession(null);
    setCopiedRotatedToken(false);

    try {
      const response = await fetch('/bff/extension/installations/rotate-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          installationId,
          reason: normalizedActionReason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as RotateSessionRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setPendingRotationInstallationId(null);
        setErrorMessage(payload?.error?.message ?? ti.rotateError);
        return;
      }

      setPendingRotationInstallationId(null);
      setRotatedSession(payload.data);
      setStatusMessage(
        `${payload.data.installationId} — ${ti.rotateToken.toLowerCase()}. ${payload.data.revokedSessionCount} ${ti.activeSessions.toLowerCase()}.`,
      );

      startTransition(() => { router.refresh(); });
    } catch {
      setPendingRotationInstallationId(null);
      setErrorMessage(ti.rotateError);
    }
  }

  async function handleCopyRotatedToken() {
    if (!rotatedSession?.session.token) return;
    try {
      await navigator.clipboard.writeText(rotatedSession.session.token);
      setCopiedRotatedToken(true);
    } catch {
      setErrorMessage(ti.copyTokenError);
    }
  }

  if (snapshot.items.length === 0) {
    return (
      <section className="empty-state">
        <span className="micro-label">{ti.installationsLabel}</span>
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
          <span className="micro-label">{ti.installationsLabel}</span>
          <p className="stat-value">{snapshot.items.length}</p>
          <p className="metric-copy">{ti.managedInstallations}</p>
        </article>
        <article className="stat-card">
          <span className="micro-label">{ti.activeSessions}</span>
          <p className="stat-value">{activeSessionTotal}</p>
          <p className="metric-copy">{ti.activeSessionsDesc}</p>
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
        <span className="micro-label">{ti.fleet}</span>
        <h2>{ti.managedInstallations}</h2>
        <p>{ti.fleetDesc}</p>
        <label className="form-field">
          <span className="form-field__label">
            {ti.operatorReason} <span className="list-muted">{ti.operatorReasonHint}</span>
          </span>
          <textarea
            maxLength={500}
            onChange={(event) => setActionReason(event.target.value)}
            placeholder={ti.operatorReasonPlaceholder}
            rows={3}
            value={actionReason}
          />
        </label>

        {statusMessage ? <div className="banner banner-info">{statusMessage}</div> : null}
        {errorMessage ? <div className="banner banner-error">{errorMessage}</div> : null}

        {rotatedSession ? (
          <div className="connect-success" style={{ marginTop: '12px' }}>
            <span className="micro-label">{ti.rotatedToken}</span>
            <p><strong>{ti.newSessionFor} {rotatedSession.installationId}</strong></p>
            <div className="connect-code-block">
              <code>{rotatedSession.session.token}</code>
              <button className="connect-code-block__copy" onClick={() => void handleCopyRotatedToken()} type="button">
                {copiedRotatedToken ? ti.copied : ti.copy}
              </button>
            </div>
            <div className="kv-list" style={{ marginTop: '8px' }}>
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

        <div className="installation-list" style={{ marginTop: '16px' }}>
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
              <div className="installation-row" key={installation.installationId}>
                <div className="installation-row__header">
                  <span className="installation-row__id">{installation.installationId}</span>
                  <div className="installation-row__badges">
                    <span className="tag-soft">{installation.browser}</span>
                    <span className="tag-soft tag-soft--gray">v{installation.extensionVersion}</span>
                    <span className={installation.compatibility.status === 'supported' ? 'tag-soft tag-soft--green' : 'tag-soft tag-soft--orange'}>
                      {installation.compatibility.status}
                    </span>
                    <span className={installation.requiresReconnect ? 'tag-soft tag-soft--orange' : 'tag-soft tag-soft--green'}>
                      {installation.requiresReconnect ? ti.reconnectRequiredBadge : ti.connected}
                    </span>
                    <span className="tag-soft tag-soft--gray">
                      {installation.activeSessionCount} {ti.activeSessions.toLowerCase()}
                    </span>
                  </div>
                </div>
                {installation.capabilities.length > 0 ? (
                  <div className="tag-row">
                    {installation.capabilities.map((capability) => (
                      <span className="tag" key={`${installation.installationId}:${capability}`}>{capability}</span>
                    ))}
                  </div>
                ) : null}
                {installation.compatibility.reason ? (
                  <p className="list-muted" style={{ fontSize: '0.84rem', margin: '4px 0 0' }}>{installation.compatibility.reason}</p>
                ) : null}
                <div className="kv-list" style={{ marginTop: '8px' }}>
                  <div className="kv-row">
                    <span className="kv-row__key">{ti.bound}</span>
                    <span className="kv-row__value">{formatDateTime(installation.boundAt)}</span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-row__key">{ti.lastSeen}</span>
                    <span className="kv-row__value">{formatDateTime(installation.lastSeenAt)}</span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-row__key">{ti.tokenExpires}</span>
                    <span className="kv-row__value">{formatDateTime(installation.lastSessionExpiresAt)}</span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-row__key">{ti.schema}</span>
                    <span className="kv-row__value">{installation.schemaVersion}</span>
                  </div>
                </div>
                <div className="link-row" style={{ marginTop: '10px' }}>
                  <button
                    className="btn-ghost"
                    disabled={rotateDisabled}
                    onClick={() => void handleRotateSession(installation.installationId)}
                    type="button"
                  >
                    {pendingRotationInstallationId === installation.installationId ? ti.rotating : ti.rotateToken}
                  </button>
                  <button
                    className={disconnectDisabled ? 'btn-ghost' : 'btn-danger'}
                    disabled={disconnectDisabled}
                    onClick={() => void handleDisconnect(installation.installationId)}
                    type="button"
                  >
                    {pendingInstallationId === installation.installationId
                      ? ti.disconnecting
                      : installation.activeSessionCount === 0
                        ? ti.noActiveSessions
                        : ti.disconnect}
                  </button>
                  <Link className="btn-ghost" href="/app/usage">
                    {ti.usage}
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
