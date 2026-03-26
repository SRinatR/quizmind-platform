'use client';

import Link from 'next/link';
import {
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationBindResult,
  type WorkspaceSummary,
} from '@quizmind/contracts';
import { useEffect, useRef, useState } from 'react';

interface ExtensionConnectClientProps {
  currentUserLabel: string;
  initialRequest: ExtensionInstallationBindRequest | null;
  missingFields: string[];
  bridgeNonce?: string;
  requestId?: string;
  targetOrigin?: string;
  workspaces: WorkspaceSummary[];
}

interface BindRouteResponse {
  ok: boolean;
  data?: ExtensionInstallationBindResult;
  fallbackCode?: {
    code: string;
    expiresAt: string;
    ttlSeconds: number;
    redeemPath: string;
  };
  error?: {
    message?: string;
  };
}

function normalizeTargetOrigin(value?: string): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);

    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.origin;
    }

    if (parsed.protocol === 'chrome-extension:' || parsed.protocol === 'moz-extension:') {
      return `${parsed.protocol}//${parsed.host}`;
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeBridgeNonce(value?: string): string | null {
  const normalized = value?.trim();

  if (!normalized || normalized.length < 8 || normalized.length > 128) {
    return null;
  }

  return /^[A-Za-z0-9:_\-.]+$/.test(normalized) ? normalized : null;
}

function resolveBridgeTarget(): Window | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (window.opener && !window.opener.closed) {
    return window.opener;
  }

  if (window.parent !== window) {
    return window.parent;
  }

  return null;
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
  missingFields,
  bridgeNonce,
  requestId,
  targetOrigin,
  workspaces,
}: ExtensionConnectClientProps) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    initialRequest?.workspaceId ?? workspaces[0]?.id ?? '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    missingFields.length > 0
      ? null
      : initialRequest?.workspaceId || workspaces.length <= 1
        ? 'Preparing secure extension bind...'
        : 'Choose the workspace that should own this extension installation.',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bindResult, setBindResult] = useState<ExtensionInstallationBindResult | null>(null);
  const [fallbackCode, setFallbackCode] = useState<BindRouteResponse['fallbackCode'] | null>(null);
  const [fallbackCodeCopied, setFallbackCodeCopied] = useState(false);
  const [hasBridgeTarget, setHasBridgeTarget] = useState(false);
  const autoBindAttemptedRef = useRef(false);
  const postedInitialErrorRef = useRef(false);
  const bridgeRequestIdRef = useRef<string>(requestId?.trim() || `bind_${Date.now()}`);
  const resolvedTargetOrigin = normalizeTargetOrigin(targetOrigin);
  const resolvedBridgeNonce = normalizeBridgeNonce(bridgeNonce);
  const bridgeSecurityIssue =
    hasBridgeTarget && !resolvedTargetOrigin
      ? 'Secure bridge requires a valid targetOrigin query parameter.'
      : hasBridgeTarget && !resolvedBridgeNonce
        ? 'Secure bridge requires a valid bridgeNonce query parameter.'
        : null;

  const canConnect =
    Boolean(initialRequest) && missingFields.length === 0 && !isSubmitting && !bridgeSecurityIssue;

  function postBridgeMessage(message: Record<string, unknown>) {
    const bridgeTarget = resolveBridgeTarget();

    if (!bridgeTarget || !resolvedTargetOrigin || !resolvedBridgeNonce) {
      return false;
    }

    bridgeTarget.postMessage(
      {
        ...message,
        bridgeNonce: resolvedBridgeNonce,
      },
      resolvedTargetOrigin,
    );

    return true;
  }

  async function handleConnect() {
    if (!initialRequest) {
      const message = `Missing required bridge parameters: ${missingFields.join(', ')}.`;
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

    if (bridgeSecurityIssue) {
      setErrorMessage(bridgeSecurityIssue);
      setStatusMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setFallbackCode(null);
    setFallbackCodeCopied(false);
    setStatusMessage('Binding installation through the signed-in site session...');

    try {
      const bindHeaders: Record<string, string> = {
        'content-type': 'application/json',
        'x-quizmind-bind-request-id': bridgeRequestIdRef.current,
      };

      if (resolvedBridgeNonce) {
        bindHeaders['x-quizmind-bridge-nonce'] = resolvedBridgeNonce;
      }

      if (resolvedTargetOrigin) {
        bindHeaders['x-quizmind-target-origin'] = resolvedTargetOrigin;
      }

      const response = await fetch('/api/extension/bind', {
        method: 'POST',
        headers: bindHeaders,
        body: JSON.stringify({
          ...initialRequest,
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
      setFallbackCode(payload.fallbackCode ?? null);
      setIsSubmitting(false);
      setStatusMessage(
        window.opener
          ? 'Extension connected. Returning the installation session to the opener...'
          : 'Extension connected. You can return to the extension now.',
      );

      const deliveredToBridge = postBridgeMessage({
        type: 'quizmind.extension.bind_result',
        requestId: bridgeRequestIdRef.current,
        payload: payload.data,
      });

      if (hasBridgeTarget && !deliveredToBridge) {
        if (payload.fallbackCode) {
          setStatusMessage('Secure bridge delivery failed. Use the one-time bind code fallback before it expires.');
          setErrorMessage('postMessage handoff did not complete. Redeem the one-time bind code in the extension.');
        } else {
          setStatusMessage('Installation connected on site, but secure bridge delivery did not complete.');
          setErrorMessage('Reopen the bridge from the extension with a valid targetOrigin and bridgeNonce.');
        }
        return;
      }

      if (window.opener && deliveredToBridge) {
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

  async function handleCopyFallbackCode() {
    if (!fallbackCode?.code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(fallbackCode.code);
      setFallbackCodeCopied(true);
    } catch {
      setErrorMessage('Unable to copy the fallback bind code. Copy it manually.');
    }
  }

  useEffect(() => {
    if (initialRequest || postedInitialErrorRef.current || missingFields.length === 0) {
      return;
    }

    postedInitialErrorRef.current = true;
    const message = `Missing required bridge parameters: ${missingFields.join(', ')}.`;
    setErrorMessage(message);

    postBridgeMessage({
      type: 'quizmind.extension.bind_error',
      requestId: bridgeRequestIdRef.current,
      error: {
        code: 'missing_bridge_params',
        message,
      },
    });
  }, [initialRequest, missingFields]);

  useEffect(() => {
    setHasBridgeTarget(Boolean(resolveBridgeTarget()));
  }, []);

  useEffect(() => {
    if (!bridgeSecurityIssue) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(bridgeSecurityIssue);
  }, [bridgeSecurityIssue]);

  useEffect(() => {
    if (autoBindAttemptedRef.current || !initialRequest || missingFields.length > 0 || bridgeSecurityIssue) {
      return;
    }

    if (!initialRequest.workspaceId && workspaces.length > 1) {
      return;
    }

    autoBindAttemptedRef.current = true;
    void handleConnect();
  }, [bridgeSecurityIssue, initialRequest, missingFields, workspaces.length]);

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
          Installation: <span className="monospace">{initialRequest?.installationId ?? 'missing'}</span>
        </p>
        <p>
          Version: <span className="monospace">{initialRequest?.handshake.extensionVersion ?? 'missing'}</span>
          {' '}| Schema: <span className="monospace">{initialRequest?.handshake.schemaVersion ?? 'missing'}</span>
          {' '}| Browser: <span className="monospace">{initialRequest?.handshake.browser ?? 'missing'}</span>
        </p>
        <div className="tag-row">
          {(initialRequest?.handshake.capabilities ?? []).map((capability) => (
            <span className="tag" key={capability}>
              {capability}
            </span>
          ))}
          {initialRequest?.handshake.buildId ? (
            <span className="tag warn">build {initialRequest.handshake.buildId}</span>
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

      {missingFields.length > 0 ? (
        <div className="auth-highlight">
          <span className="micro-label">Missing parameters</span>
          <strong>The extension did not open the bridge with a full handshake.</strong>
          <p>{missingFields.join(', ')}</p>
        </div>
      ) : null}

      {bridgeSecurityIssue ? (
        <div className="auth-highlight">
          <span className="micro-label">Bridge security</span>
          <strong>Secure bridge parameters are missing or invalid.</strong>
          <p>{bridgeSecurityIssue}</p>
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

      {fallbackCode ? (
        <div className="auth-highlight">
          <span className="micro-label">Manual fallback</span>
          <strong>One-time bind code</strong>
          <p>
            Code: <span className="monospace">{fallbackCode.code}</span>
          </p>
          <p>
            Expires: <span className="monospace">{fallbackCode.expiresAt}</span>
            {' '}| TTL: <span className="monospace">{fallbackCode.ttlSeconds}s</span>
          </p>
          <p>
            Redeem endpoint: <span className="monospace">{fallbackCode.redeemPath}</span>
          </p>
          <button className="btn-ghost" onClick={() => void handleCopyFallbackCode()} type="button">
            {fallbackCodeCopied ? 'Code copied' : 'Copy bind code'}
          </button>
        </div>
      ) : null}

      <div className="auth-highlight">
        <span className="micro-label">Bridge transport</span>
        <strong>Result channel: `window.postMessage`</strong>
        <p>
          Request id: <span className="monospace">{bridgeRequestIdRef.current}</span>
          {' '}| Target origin: <span className="monospace">{resolvedTargetOrigin ?? 'missing/invalid'}</span>
        </p>
        <p>
          Nonce: <span className="monospace">{resolvedBridgeNonce ?? 'missing/invalid'}</span>
        </p>
      </div>
    </div>
  );
}
