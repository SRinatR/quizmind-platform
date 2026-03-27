export type BridgeMode = 'bind_result' | 'fallback_code';

export function normalizeTargetOrigin(value?: string): string | null {
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

export function normalizeBridgeNonce(value?: string): string | null {
  const normalized = value?.trim();

  if (!normalized || normalized.length < 8 || normalized.length > 128) {
    return null;
  }

  return /^[A-Za-z0-9:_\-.]+$/.test(normalized) ? normalized : null;
}

export function normalizeBridgeMode(value?: string): BridgeMode {
  const normalized = value?.trim().toLowerCase();

  return normalized === 'fallback_code' ? 'fallback_code' : 'bind_result';
}

export function normalizeRelayUrl(value?: string, expectedTargetOrigin?: string | null): string | null {
  const normalized = value?.trim();

  if (!normalized || !expectedTargetOrigin) {
    return null;
  }

  try {
    const parsed = new URL(normalized);

    if (parsed.protocol !== 'chrome-extension:' && parsed.protocol !== 'moz-extension:') {
      return null;
    }

    const relayOrigin = `${parsed.protocol}//${parsed.host}`;

    if (relayOrigin !== expectedTargetOrigin) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizePlatformBaseUrl(value?: string | null): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
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

export function buildRelayRedirectUrl(input: {
  relayUrl: string;
  envelope: Record<string, unknown>;
  requestId: string;
  bridgeNonce?: string | null;
  platformBaseUrl?: string | null;
}): string {
  const relay = new URL(input.relayUrl);
  relay.searchParams.set('quizmind_bridge_payload', encodeBase64UrlJson(input.envelope));
  relay.searchParams.set('quizmind_bridge_payload_format', 'base64url-json');
  relay.searchParams.set('requestId', input.requestId);

  if (input.bridgeNonce) {
    relay.searchParams.set('bridgeNonce', input.bridgeNonce);
  }

  const normalizedPlatformBaseUrl = normalizePlatformBaseUrl(input.platformBaseUrl);

  if (normalizedPlatformBaseUrl) {
    relay.searchParams.set('platformBaseUrl', normalizedPlatformBaseUrl);
  }

  return relay.toString();
}

interface ResolveBridgeIssuesInput {
  hasBridgeTarget: boolean;
  requestId?: string;
  rawRelayUrl?: string;
  resolvedRelayUrl: string | null;
  resolvedTargetOrigin: string | null;
  resolvedBridgeNonce: string | null;
}

interface ResolveBridgeIssuesOutput {
  bridgeSecurityIssue: string | null;
  bridgeReturnChannelIssue: string | null;
}

export function resolveBridgeIssues(input: ResolveBridgeIssuesInput): ResolveBridgeIssuesOutput {
  const relayRequested = Boolean(input.rawRelayUrl?.trim());
  const requestId = input.requestId?.trim();
  const secureReturnRequested = input.hasBridgeTarget || relayRequested;

  if (secureReturnRequested && !input.resolvedTargetOrigin) {
    return {
      bridgeSecurityIssue: 'Secure bridge requires a valid targetOrigin query parameter.',
      bridgeReturnChannelIssue: null,
    };
  }

  if (secureReturnRequested && !input.resolvedBridgeNonce) {
    return {
      bridgeSecurityIssue: 'Secure bridge requires a valid bridgeNonce query parameter.',
      bridgeReturnChannelIssue: null,
    };
  }

  if (relayRequested && !input.resolvedRelayUrl) {
    return {
      bridgeSecurityIssue: 'relayUrl must be a valid extension URL that matches targetOrigin.',
      bridgeReturnChannelIssue: null,
    };
  }

  if (secureReturnRequested && !requestId) {
    return {
      bridgeSecurityIssue: 'Secure bridge requires requestId query parameter from extension launcher.',
      bridgeReturnChannelIssue: null,
    };
  }

  if (!input.hasBridgeTarget && !input.resolvedRelayUrl) {
    return {
      bridgeSecurityIssue: null,
      bridgeReturnChannelIssue:
        'No bridge return channel detected. Configure extension launcher to keep opener/parent access or provide relayUrl.',
    };
  }

  return {
    bridgeSecurityIssue: null,
    bridgeReturnChannelIssue: null,
  };
}
