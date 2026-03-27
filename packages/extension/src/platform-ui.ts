import {
  type AiAccessPolicyMode,
  type CompatibilityStatus,
  type ExtensionBootstrapPayloadV2,
} from '@quizmind/contracts';

export interface PlatformUiState {
  connectionState: 'connected' | 'reconnect_required' | 'offline_fallback';
  compatibilityStatus?: CompatibilityStatus;
  compatibilityReason?: string;
  showReconnectPrompt: boolean;
  showUnsupportedBanner: boolean;
  showDeprecationWarning: boolean;
  deprecationMessages: string[];
  killSwitches: string[];
  aiMode?: AiAccessPolicyMode;
  quotaWarningCount: number;
}

function isExpired(expiresAt: string | undefined, nowMs: number): boolean {
  if (!expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);

  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }

  return expiresAtMs <= nowMs;
}

export function shouldDisableManagedActions(bootstrap?: ExtensionBootstrapPayloadV2 | null): boolean {
  if (!bootstrap) {
    return false;
  }

  return (
    bootstrap.compatibility.status === 'unsupported' ||
    bootstrap.killSwitches.includes('extension.unsupported')
  );
}

export function derivePlatformUiState(input: {
  bootstrap?: ExtensionBootstrapPayloadV2 | null;
  installationTokenExpiresAt?: string;
  authInvalid?: boolean;
  backendUnavailable?: boolean;
  nowMs?: number;
}): PlatformUiState {
  const nowMs = input.nowMs ?? Date.now();
  const bootstrap = input.bootstrap ?? undefined;
  const tokenExpired = isExpired(input.installationTokenExpiresAt, nowMs);
  const showReconnectPrompt = Boolean(input.authInvalid || tokenExpired);
  const deprecationMessages = bootstrap?.deprecationMessages ?? [];
  const compatibilityStatus = bootstrap?.compatibility.status;
  const compatibilityReason = bootstrap?.compatibility.reason;
  const showUnsupportedBanner = shouldDisableManagedActions(bootstrap);
  const showDeprecationWarning = !showUnsupportedBanner && (deprecationMessages.length > 0 || compatibilityStatus === 'deprecated');
  const quotaWarningCount =
    bootstrap?.quotaHints.filter((hint) => hint.status === 'warning' || hint.status === 'exceeded').length ?? 0;
  const connectionState = input.backendUnavailable
    ? 'offline_fallback'
    : showReconnectPrompt
      ? 'reconnect_required'
      : 'connected';

  return {
    connectionState,
    ...(compatibilityStatus ? { compatibilityStatus } : {}),
    ...(compatibilityReason ? { compatibilityReason } : {}),
    showReconnectPrompt,
    showUnsupportedBanner,
    showDeprecationWarning,
    deprecationMessages,
    killSwitches: bootstrap?.killSwitches ?? [],
    ...(bootstrap?.aiAccessPolicy.mode ? { aiMode: bootstrap.aiAccessPolicy.mode } : {}),
    quotaWarningCount,
  };
}
