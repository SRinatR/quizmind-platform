'use client';

import Link from 'next/link';
import {
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationBindResult,
} from '@quizmind/contracts';
import { useEffect, useRef, useState } from 'react';
import {
  buildRelayRedirectUrl,
  normalizeBridgeMode,
  normalizeBridgeNonce,
  normalizeBridgeRequestId,
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
  platformOriginSecurityIssue?: string | null;
  relayUrl?: string;
  requestId?: string;
  targetOrigin?: string;
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
  platformOriginSecurityIssue,
  relayUrl,
  requestId,
  targetOrigin,
}: ExtensionConnectClientProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    missingFields.length > 0 ? null : 'Preparing secure extension bind...',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bindResult, setBindResult] = useState<ExtensionInstallationBindResult | null>(null);
  const [fallbackCode, setFallbackCode] = useState<BindRouteResponse['fallbackCode'] | null>(null);
  const [fallbackCodeCopied, setFallbackCodeCopied] = useState(false);
  const [hasBridgeTarget, setHasBridgeTarget] = useState(false);
  const autoBindAttemptedRef = useRef(false);
  const postedInitialErrorRef = useRef(false);
  const resolvedRequestId = normalizeBridgeRequestId(requestId);
  const bridgeRequestIdRef = useRef<string>(resolvedRequestId ?? `bind_${Date.now()}`);
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
    rawRequestId: requestId,
    resolvedRequestId,
    rawRelayUrl: relayUrl,
    resolvedRelayUrl,
    resolvedTargetOrigin,
    resolvedBridgeNonce,
  });
  const effectiveBridgeSecurityIssue = platformOriginSecurityIssue ?? bridgeSecurityIssue;

  const canConnect =
    Boolean(initialRequest) &&
    missingFields.length === 0 &&
    !isSubmitting &&
    !effectiveBridgeSecurityIssue &&
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

    if (effectiveBridgeSecurityIssue) {
      setErrorMessage(effectiveBridgeSecurityIssue);
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
        body: JSON.stringify(initialRequest satisfies ExtensionInstallationBindRequest),
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
            platformBaseUrl: window.location.origin,
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
    if (!effectiveBridgeSecurityIssue) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(effectiveBridgeSecurityIssue);
  }, [effectiveBridgeSecurityIssue]);

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
      effectiveBridgeSecurityIssue ||
      bridgeReturnChannelIssue
    ) {
      return;
    }

    autoBindAttemptedRef.current = true;
    void handleConnect();
  }, [bridgeReturnChannelIssue, effectiveBridgeSecurityIssue, initialRequest, missingFields]);

  return (
    <div className="connect-flow">
      {/* ── Header ── */}
      <div className="connect-flow__header">
        <span className="connect-flow__eyebrow">Extension bridge</span>
        <h2 className="connect-flow__title">
          {bindResult ? 'Extension connected' : 'Connect your extension'}
        </h2>
        <p className="connect-flow__sub">
          Signed in as <strong>{currentUserLabel}</strong>. Your site session stays secure — the
          extension only receives a short-lived installation token.
        </p>
      </div>

      {/* ── Handshake info ── */}
      {initialRequest ? (
        <div className="connect-card">
          <span className="connect-card__label">Extension handshake</span>
          <div className="connect-card__row">
            <span className="tag-soft">{initialRequest.handshake.browser}</span>
            <span className="tag-soft tag-soft--gray">v{initialRequest.handshake.extensionVersion}</span>
            <span className="tag-soft tag-soft--gray">schema {initialRequest.handshake.schemaVersion}</span>
          </div>
          <span className="connect-card__id">{initialRequest.installationId}</span>
          {(initialRequest.handshake.capabilities ?? []).length > 0 ? (
            <div className="connect-card__row">
              {(initialRequest.handshake.capabilities ?? []).map((cap) => (
                <span className="tag" key={cap}>{cap}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Issue cards ── */}
      {missingFields.length > 0 ? (
        <div className="connect-issue">
          <span className="connect-issue__label">Incomplete handshake</span>
          <p className="connect-issue__title">Extension did not send required bridge parameters</p>
          <p className="connect-issue__detail">Missing: {missingFields.join(', ')}</p>
        </div>
      ) : null}

      {effectiveBridgeSecurityIssue ? (
        <div className="connect-issue">
          <span className="connect-issue__label">Security issue</span>
          <p className="connect-issue__title">Bridge parameters invalid</p>
          <p className="connect-issue__detail">{effectiveBridgeSecurityIssue}</p>
        </div>
      ) : null}

      {platformOriginWarning && !effectiveBridgeSecurityIssue ? (
        <div className="connect-issue">
          <span className="connect-issue__label">Origin warning</span>
          <p className="connect-issue__title">Bridge origin mismatch</p>
          <p className="connect-issue__detail">{platformOriginWarning}</p>
        </div>
      ) : null}

      {bridgeReturnChannelIssue ? (
        <div className="connect-issue">
          <span className="connect-issue__label">Return channel</span>
          <p className="connect-issue__title">Automatic return unavailable</p>
          <p className="connect-issue__detail">{bridgeReturnChannelIssue}</p>
        </div>
      ) : null}

      {/* ── Actions ── */}
      <div className="connect-flow__actions">
        <button
          className="btn-primary btn-lg"
          disabled={!canConnect}
          onClick={() => void handleConnect()}
          type="button"
        >
          {isSubmitting ? 'Connecting...' : bindResult ? 'Reconnect' : 'Connect extension'}
        </button>
        <button className="btn-ghost" onClick={() => window.close()} type="button">
          Cancel
        </button>
        <Link className="btn-ghost" href="/app/settings">Settings</Link>
      </div>

      {/* ── Status / error ── */}
      {statusMessage ? (
        <p className="connect-flow__status">{statusMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="connect-flow__error">{errorMessage}</p>
      ) : null}

      {/* ── Success card ── */}
      {bindResult ? (
        <div className="connect-success">
          <span className="connect-success__label">Connection established</span>
          <p className="connect-success__title">Extension successfully bound</p>
          <div className="connect-card__row">
            <span className="tag-soft tag-soft--green">
              {bindResult.bootstrap.compatibility.status}
            </span>
            {bindResult.bootstrap.featureFlags.map((flag) => (
              <span className="tag" key={flag}>{flag}</span>
            ))}
            {bindResult.bootstrap.killSwitches.map((sw) => (
              <span className="tag warn" key={sw}>{sw}</span>
            ))}
          </div>
          <span className="connect-success__detail">
            Token expires {bindResult.session.expiresAt}
          </span>
        </div>
      ) : null}

      {/* ── Fallback bind code ── */}
      {fallbackCode ? (
        <div className="connect-card">
          <span className="connect-card__label">Manual fallback — one-time code</span>
          <div className="connect-code-block">
            <span className="connect-code-block__value">{fallbackCode.code}</span>
            <button
              className="btn-ghost"
              onClick={() => void handleCopyFallbackCode()}
              type="button"
              style={{ padding: '6px 14px', fontSize: '0.82rem', flexShrink: 0 }}
            >
              {fallbackCodeCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <span className="connect-card__id" style={{ fontSize: '0.76rem', opacity: 0.65 }}>
            Expires {fallbackCode.expiresAt} · {fallbackCode.ttlSeconds}s TTL
          </span>
        </div>
      ) : null}

      {/* ── Bridge diagnostics (collapsed) ── */}
      <details style={{ marginTop: '4px' }}>
        <summary style={{ fontSize: '0.8rem', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none', padding: '4px 0' }}>
          Bridge diagnostics
        </summary>
        <div className="connect-card" style={{ marginTop: '10px' }}>
          <span className="connect-card__label">Transport</span>
          <div className="kv-list" style={{ gap: '6px' }}>
            <div className="kv-row">
              <span className="kv-row__key">Channel</span>
              <code>{resultChannelLabel}</code>
            </div>
            <div className="kv-row">
              <span className="kv-row__key">Mode</span>
              <code>{bindRouteBridgeMode}</code>
            </div>
            {resolvedTargetOrigin ? (
              <div className="kv-row">
                <span className="kv-row__key">Target origin</span>
                <code>{resolvedTargetOrigin}</code>
              </div>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}
