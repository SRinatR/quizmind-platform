'use client';

import Link from 'next/link';
import {
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationBindResult,
  type WorkspaceSummary,
} from '@quizmind/contracts';
import { useEffect, useRef, useState } from 'react';
import {
  normalizeBridgeMode,
  normalizeBridgeNonce,
  normalizeRelayUrl,
  normalizeTargetOrigin,
  resolveBridgeIssues,
} from './connect-bridge';

interface ExtensionConnectClientProps {
  currentUserLabel: string;
  initialRequest: ExtensionInstallationBindRequest | null;
  missingFields: string[];
  bridgeNonce?: string;
  bridgeMode?: string;
  platformOriginWarning?: string | null;
  relayUrl?: string;
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

function encodeBase64UrlJson(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildRelayRedirectUrl(input: {
  relayUrl: string;
  envelope: Record<string, unknown>;
  requestId: string;
  bridgeNonce?: string | null;
}): string {
  const relay = new URL(input.relayUrl);
  relay.searchParams.set('quizmind_bridge_payload', encodeBase64UrlJson(input.envelope));
  relay.searchParams.set('quizmind_bridge_payload_format', 'base64url-json');
  relay.searchParams.set('requestId', input.requestId);

  if (input.bridgeNonce) {
    relay.searchParams.set('bridgeNonce', input.bridgeNonce);
  }

  return relay.toString();
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
  bridgeMode,
  platformOriginWarning,
  relayUrl,
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
  const bridgeModePreference = normalizeBridgeMode(bridgeMode);
  const resolvedTargetOrigin = normalizeTargetOrigin(targetOrigin);
  const resolvedBridgeNonce = normalizeBridgeNonce(bridgeNonce);
  const resolvedRelayUrl = normalizeRelayUrl(relayUrl, resolvedTargetOrigin);
  const bindRouteBridgeMode: 'bind_result' | 'fallback_code' =
    bridgeModePreference === 'fallback_code' && resolvedBridgeNonce && resolvedTargetOrigin
      ? 'fallback_code'
      : 'bind_result';
  const { bridgeSecurityIssue, bridgeReturnChannelIssue } = resolveBridgeIssues({
    hasBridgeTarget,
    rawRelayUrl: relayUrl,
    resolvedRelayUrl,
    resolvedTargetOrigin,
    resolvedBridgeNonce,
  });

  const canConnect =
    Boolean(initialRequest) &&
    missingFields.length === 0 &&
    !isSubmitting &&
    !bridgeSecurityIssue &&
    !bridgeReturnChannelIssue;
  const resultChannelLabel = hasBridgeTarget
    ? 'window.postMessage'
    : resolvedRelayUrl
      ? 'relay.redirect'
      : 'unavailable';

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

    if (bridgeReturnChannelIssue) {
      setErrorMessage(bridgeReturnChannelIssue);
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
        'x-quizmind-bridge-mode': bindRouteBridgeMode,
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
      const fallbackCodeForBridge = payload.fallbackCode ?? null;
      const useFallbackEnvelope = bridgeModePreference === 'fallback_code' && fallbackCodeForBridge !== null;
      const bridgeEnvelope: Record<string, unknown> = useFallbackEnvelope && fallbackCodeForBridge
        ? {
            type: 'quizmind.extension.bind_fallback_code',
            requestId: bridgeRequestIdRef.current,
            fallbackCode: fallbackCodeForBridge,
          }
        : {
            type: 'quizmind.extension.bind_result',
            requestId: bridgeRequestIdRef.current,
            payload: payload.data,
          };
      setStatusMessage(
        useFallbackEnvelope
          ? hasBridgeTarget
            ? 'Extension connected. Returning a secure one-time bind code envelope to the opener...'
            : resolvedRelayUrl
              ? 'Extension connected. Returning a secure one-time bind code envelope through extension relay...'
              : 'Extension connected. A secure fallback envelope is ready for extension redeem.'
          : hasBridgeTarget
            ? 'Extension connected. Returning the installation session to the opener...'
            : resolvedRelayUrl
              ? 'Extension connected. Returning the installation session through extension relay...'
              : 'Installation bound on site, but automatic return to extension is unavailable.',
      );

      const deliveredToBridge = postBridgeMessage(bridgeEnvelope);

      if (!deliveredToBridge && resolvedRelayUrl) {
        window.location.assign(
          buildRelayRedirectUrl({
            relayUrl: resolvedRelayUrl,
            envelope: {
              ...bridgeEnvelope,
              ...(resolvedBridgeNonce ? { bridgeNonce: resolvedBridgeNonce } : {}),
            },
            requestId: bridgeRequestIdRef.current,
            bridgeNonce: resolvedBridgeNonce,
          }),
        );
        return;
      }

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

      if (!hasBridgeTarget && !resolvedRelayUrl) {
        setErrorMessage(
          'Site bind succeeded, but extension return channel is missing. Reopen bridge from extension popup/window or provide relayUrl.',
        );
        return;
      }

      if (deliveredToBridge) {
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
    if (!bridgeReturnChannelIssue) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(bridgeReturnChannelIssue);
  }, [bridgeReturnChannelIssue]);

  useEffect(() => {
    if (
      autoBindAttemptedRef.current ||
      !initialRequest ||
      missingFields.length > 0 ||
      bridgeSecurityIssue ||
      bridgeReturnChannelIssue
    ) {
      return;
    }

    if (!initialRequest.workspaceId && workspaces.length > 1) {
      return;
    }

    autoBindAttemptedRef.current = true;
    void handleConnect();
  }, [bridgeReturnChannelIssue, bridgeSecurityIssue, initialRequest, missingFields, workspaces.length]);

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

      {platformOriginWarning ? (
        <div className="auth-highlight">
          <span className="micro-label">Bridge origin</span>
          <strong>Bridge launch origin mismatch detected.</strong>
          <p>{platformOriginWarning}</p>
        </div>
      ) : null}

      {bridgeReturnChannelIssue ? (
        <div className="auth-highlight">
          <span className="micro-label">Return channel</span>
          <strong>Automatic return to extension is not available in this tab context.</strong>
          <p>{bridgeReturnChannelIssue}</p>
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
        <strong>
          Result channel: <span className="monospace">{resultChannelLabel}</span>
        </strong>
        <p>
          Request id: <span className="monospace">{bridgeRequestIdRef.current}</span>
          {' '}| Target origin: <span className="monospace">{resolvedTargetOrigin ?? 'missing/invalid'}</span>
        </p>
        <p>
          Nonce: <span className="monospace">{resolvedBridgeNonce ?? 'missing/invalid'}</span>
        </p>
        <p>
          Bridge mode: <span className="monospace">{bridgeModePreference}</span>
          {' '}| Bind route mode: <span className="monospace">{bindRouteBridgeMode}</span>
        </p>
        {resolvedRelayUrl ? (
          <p>
            Relay URL: <span className="monospace">{resolvedRelayUrl}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
