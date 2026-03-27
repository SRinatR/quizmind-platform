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

interface ResolveBridgeIssuesInput {
  hasBridgeTarget: boolean;
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
