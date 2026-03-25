'use client';

import Link from 'next/link';
import {
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationBindResult,
  type WorkspaceSummary,
} from '@quizmind/contracts';
import {
  type BridgeConnectDiagnostics,
  parseBridgeConnectRequest,
} from './bridge-connect-contract';
import { useEffect, useRef, useState } from 'react';

interface ExtensionConnectClientProps {
  currentUserLabel: string;
  initialRequest: ExtensionInstallationBindRequest | null;
  diagnostics: BridgeConnectDiagnostics;
  requestId?: string;
  targetOrigin?: string;
  workspaces: WorkspaceSummary[];
}

interface BindRouteResponse {
  ok: boolean;
  data?: ExtensionInstallationBindResult;
  error?: {
    message?: string;
  };
}

function normalizeTargetOrigin(value?: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    return '*';
  }

  if (normalized.startsWith('chrome-extension://') || normalized.startsWith('moz-extension://')) {
    return normalized;
  }

  try {
    return new URL(normalized).origin;
  } catch {
    return '*';
  }
}

function maskToken(value: string): string {
  if (value.length <= 8) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function ExtensionConnectClient({
  currentUserLabel,
  initialRequest,
  diagnostics,
  requestId,
  targetOrigin,
  workspaces,
}: ExtensionConnectClientProps) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    initialRequest?.workspaceId ?? workspaces[0]?.id ?? '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    diagnostics.missingFields.length > 0
      ? null
      : initialRequest?.workspaceId || workspaces.length <= 1
        ? 'Preparing secure extension bind...'
        : 'Choose the workspace that should own this extension installation.',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bindResult, setBindResult] = useState<ExtensionInstallationBindResult | null>(null);
  const [resolvedRequest, setResolvedRequest] = useState<ExtensionInstallationBindRequest | null>(initialRequest);
  const [resolvedDiagnostics, setResolvedDiagnostics] = useState<BridgeConnectDiagnostics>(diagnostics);
  const autoBindAttemptedRef = useRef(false);
  const postedInitialErrorRef = useRef(false);
  const bridgeRequestIdRef = useRef<string>(requestId?.trim() || `bind_${Date.now()}`);
  const resolvedTargetOrigin = normalizeTargetOrigin(targetOrigin);

  const canConnect = Boolean(resolvedRequest) && resolvedDiagnostics.missingFields.length === 0 && !isSubmitting;

  function postBridgeMessage(message: Record<string, unknown>) {
    const bridgeTarget = window.opener ?? (window.parent !== window ? window.parent : null);

    if (!bridgeTarget) {
      return false;
    }

    bridgeTarget.postMessage(message, resolvedTargetOrigin);

    return true;
  }

  async function handleConnect() {
    if (!resolvedRequest) {
      const message = `Missing required bridge parameters: ${resolvedDiagnostics.missingFields.join(', ')}.`;
      setErrorMessage(message);
      setStatusMessage(null);

      postBridgeMessage({
        type: 'quizmind.extension.bind_error',
        requestId: bridgeRequestIdRef.current,
        error: {
          code: 'missing_bridge_params',
          message,
        },
      });
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage('Binding installation through the signed-in site session...');

    try {
      const response = await fetch('/api/extension/bind', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...resolvedRequest,
          ...(selectedWorkspaceId ? { workspaceId: selectedWorkspaceId } : {}),
        } satisfies ExtensionInstallationBindRequest),
      });
      const payload = (await response.json().catch(() => null)) as BindRouteResponse | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        const message = payload?.error?.message ?? 'Unable to connect the extension right now.';
        setIsSubmitting(false);
        setStatusMessage(null);
        setErrorMessage(message);

        postBridgeMessage({
          type: 'quizmind.extension.bind_error',
          requestId: bridgeRequestIdRef.current,
          error: {
            code: response.status === 401 ? 'auth_required' : 'bind_failed',
            message,
          },
        });
        return;
      }

      setBindResult(payload.data);
      setIsSubmitting(false);
      setStatusMessage(
        window.opener
          ? 'Extension connected. Returning the installation session to the opener...'
          : 'Extension connected. You can return to the extension now.',
      );

      postBridgeMessage({
        type: 'quizmind.extension.bind_result',
        requestId: bridgeRequestIdRef.current,
        payload: payload.data,
      });

      if (window.opener) {
        window.setTimeout(() => {
          window.close();
        }, 900);
      }
    } catch {
      const message = 'Unable to reach the web bind route right now.';
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage(message);

      postBridgeMessage({
        type: 'quizmind.extension.bind_error',
        requestId: bridgeRequestIdRef.current,
        error: {
          code: 'bridge_request_failed',
          message,
        },
      });
    }
  }


  useEffect(() => {
    if (resolvedRequest && resolvedDiagnostics.missingFields.length === 0) {
      return;
    }

    const url = new URL(window.location.href);
    const mergedParams = new URLSearchParams(url.search);
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : '';

    if (hash) {
      const hashParams = new URLSearchParams(hash);
      for (const [key, value] of hashParams.entries()) {
        if (!mergedParams.has(key)) {
          mergedParams.append(key, value);
        }
      }
    }

    const merged = parseBridgeConnectRequest(mergedParams, {
      defaultEnvironment: initialRequest?.environment ?? 'development',
    });

    if (merged.diagnostics.missingFields.length < resolvedDiagnostics.missingFields.length) {
      setResolvedRequest(merged.initialRequest);
      setResolvedDiagnostics(merged.diagnostics);
    }
  }, [initialRequest, resolvedDiagnostics.missingFields.length, resolvedRequest]);

  useEffect(() => {
    if (resolvedRequest || postedInitialErrorRef.current || resolvedDiagnostics.missingFields.length === 0) {
      return;
    }

    postedInitialErrorRef.current = true;
    const message = `Missing required bridge parameters: ${resolvedDiagnostics.missingFields.join(', ')}.`;
    setErrorMessage(message);

    postBridgeMessage({
      type: 'quizmind.extension.bind_error',
      requestId: bridgeRequestIdRef.current,
      error: {
        code: 'missing_bridge_params',
        message,
      },
    });
  }, [resolvedRequest, resolvedDiagnostics.missingFields]);

  useEffect(() => {
    if (autoBindAttemptedRef.current || !resolvedRequest || resolvedDiagnostics.missingFields.length > 0) {
      return;
    }

    if (!resolvedRequest.workspaceId && workspaces.length > 1) {
      return;
    }

    autoBindAttemptedRef.current = true;
    void handleConnect();
  }, [resolvedRequest, resolvedDiagnostics.missingFields, workspaces.length]);

  return (
    <div className="auth-form-shell">
      <span className="micro-label">Extension bridge</span>
      <h2>Connect this installation to QuizMind Platform.</h2>
      <p className="auth-form-copy">
        Signed in as {currentUserLabel}. This page keeps the site session on the web side and only hands the
        extension a short-lived installation token.
      </p>

      <div className="auth-session-card">
        <strong>Runtime handshake</strong>
        <p>
          Installation: <span className="monospace">{resolvedRequest?.installationId ?? 'missing'}</span>
        </p>
        <p>
          Version: <span className="monospace">{resolvedRequest?.handshake.extensionVersion ?? 'missing'}</span>
          {' '}| Schema: <span className="monospace">{resolvedRequest?.handshake.schemaVersion ?? 'missing'}</span>
          {' '}| Browser: <span className="monospace">{resolvedRequest?.handshake.browser ?? 'missing'}</span>
        </p>
        <div className="tag-row">
          {(resolvedRequest?.handshake.capabilities ?? []).map((capability) => (
            <span className="tag" key={capability}>
              {capability}
            </span>
          ))}
          {resolvedRequest?.handshake.buildId ? (
            <span className="tag warn">build {resolvedRequest.handshake.buildId}</span>
          ) : null}
        </div>
      </div>

      {workspaces.length > 1 ? (
        <label className="auth-field">
          <span>Workspace</span>
          <select
            onChange={(event) => setSelectedWorkspaceId(event.target.value)}
            value={selectedWorkspaceId}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name} ({workspace.role})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {workspaces.length === 0 ? (
        <div className="auth-highlight">
          <span className="micro-label">Workspace</span>
          <strong>No workspace membership was found in this site session.</strong>
          <p>The installation can still bind, but workspace-scoped quotas and settings will stay unbound until a workspace is selected later.</p>
        </div>
      ) : null}

      {resolvedDiagnostics.missingFields.length > 0 ? (
        <div className="auth-highlight">
          <span className="micro-label">Missing parameters</span>
          <strong>The extension did not open the bridge with a full handshake.</strong>
          <p>Missing: {resolvedDiagnostics.missingFields.join(', ')}</p>
          <p>Received query/hash params: {resolvedDiagnostics.receivedParams.join(', ') || 'none'}</p>
        </div>
      ) : null}

      <div className="auth-form-actions">
        <button className="btn-primary" disabled={!canConnect} onClick={() => void handleConnect()} type="button">
          {isSubmitting ? 'Connecting...' : bindResult ? 'Reconnect installation' : 'Connect extension'}
        </button>
        <button className="btn-ghost" onClick={() => window.close()} type="button">
          Close window
        </button>
        <Link className="btn-ghost" href="/app/settings">
          Open settings
        </Link>
      </div>

      {statusMessage ? <p className="auth-inline-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

      {bindResult ? (
        <div className="auth-session-card">
          <strong>Bind complete</strong>
          <p>
            Workspace: <span className="monospace">{bindResult.installation.workspaceId ?? 'unbound'}</span>
          </p>
          <p>
            Token: <span className="monospace">{maskToken(bindResult.session.token)}</span>
            {' '}| Expires: <span className="monospace">{bindResult.session.expiresAt}</span>
          </p>
          <p>
            Compatibility: <span className="monospace">{bindResult.bootstrap.compatibility.status}</span>
            {' '}| Refresh after: <span className="monospace">{bindResult.session.refreshAfterSeconds}s</span>
          </p>
          <div className="tag-row">
            {bindResult.bootstrap.featureFlags.map((flag) => (
              <span className="tag" key={flag}>
                {flag}
              </span>
            ))}
            {bindResult.bootstrap.killSwitches.map((switchKey) => (
              <span className="tag warn" key={switchKey}>
                {switchKey}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="auth-highlight">
        <span className="micro-label">Bridge transport</span>
        <strong>Result channel: `window.postMessage`</strong>
        <p>
          Request id: <span className="monospace">{bridgeRequestIdRef.current}</span>
          {' '}| Target origin: <span className="monospace">{resolvedTargetOrigin}</span>
        </p>
        {Object.keys(resolvedDiagnostics.acceptedAliases).length > 0 ? (
          <p>Accepted legacy aliases: <span className="monospace">{JSON.stringify(resolvedDiagnostics.acceptedAliases)}</span></p>
        ) : null}
      </div>
    </div>
  );
}
