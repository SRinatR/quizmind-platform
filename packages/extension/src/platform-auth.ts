import {
  type CompatibilityHandshake,
  type ExtensionInstallationBindResult,
} from '@quizmind/contracts';

import { type PlatformStateManager } from './platform-state';

interface BridgeEnvelopeBase {
  requestId: string;
  bridgeNonce?: string;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}

export interface BridgeBindResultEnvelope extends BridgeEnvelopeBase {
  type: 'quizmind.extension.bind_result';
  payload: ExtensionInstallationBindResult;
}

export interface BridgeBindErrorEnvelope extends BridgeEnvelopeBase {
  type: 'quizmind.extension.bind_error';
  error: {
    code: string;
    message: string;
  };
}

export interface BridgeBindFallbackCodeEnvelope extends BridgeEnvelopeBase {
  type: 'quizmind.extension.bind_fallback_code';
  fallbackCode: {
    code: string;
    redeemPath?: string;
    expiresAt?: string;
    ttlSeconds?: number;
  };
}

export type BridgeEnvelope =
  | BridgeBindResultEnvelope
  | BridgeBindErrorEnvelope
  | BridgeBindFallbackCodeEnvelope;

export interface ConnectToPlatformInput {
  siteUrl: string;
  environment: string;
  handshake: CompatibilityHandshake;
  targetOrigin: string;
  state: PlatformStateManager;
  workspaceId?: string;
  requestId?: string;
  bridgeNonce?: string;
  openBridge: (input: {
    url: string;
    requestId: string;
    bridgeNonce: string;
  }) =>
    | Promise<BridgeEnvelope | ExtensionInstallationBindResult>
    | BridgeEnvelope
    | ExtensionInstallationBindResult;
  fetcher?: typeof fetch;
}

export class PlatformBridgeError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'PlatformBridgeError';
  }
}

function randomHex(length = 12): string {
  const bytes = new Uint8Array(length);
  const cryptography = globalThis.crypto;

  if (cryptography?.getRandomValues) {
    cryptography.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOrigin(value: string): string {
  const parsed = new URL(value);

  if (
    parsed.protocol !== 'https:' &&
    parsed.protocol !== 'http:' &&
    parsed.protocol !== 'chrome-extension:' &&
    parsed.protocol !== 'moz-extension:'
  ) {
    throw new Error(`Unsupported origin protocol: ${parsed.protocol}`);
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return parsed.origin;
  }

  return `${parsed.protocol}//${parsed.host}`;
}

export function createBridgeNonce(): string {
  return `nonce_${randomHex(18)}`;
}

export function createBridgeRequestId(prefix = 'bind'): string {
  return `${prefix}_${Date.now()}_${randomHex(6)}`;
}

export function buildExtensionConnectUrl(input: {
  siteUrl: string;
  installationId: string;
  environment: string;
  handshake: CompatibilityHandshake;
  targetOrigin: string;
  requestId: string;
  bridgeNonce: string;
  bridgeMode?: 'bind_result' | 'fallback_code';
  workspaceId?: string;
}): string {
  const url = new URL('/app/extension/connect', input.siteUrl);

  url.searchParams.set('installationId', input.installationId);
  url.searchParams.set('environment', input.environment);
  url.searchParams.set('extensionVersion', input.handshake.extensionVersion);
  url.searchParams.set('schemaVersion', input.handshake.schemaVersion);
  url.searchParams.set('browser', input.handshake.browser);
  url.searchParams.set('capabilities', input.handshake.capabilities.join(','));
  url.searchParams.set('targetOrigin', normalizeOrigin(input.targetOrigin));
  url.searchParams.set('requestId', input.requestId);
  url.searchParams.set('bridgeNonce', input.bridgeNonce);
  url.searchParams.set('bridgeMode', input.bridgeMode ?? 'fallback_code');

  if (input.handshake.buildId) {
    url.searchParams.set('buildId', input.handshake.buildId);
  }

  if (input.workspaceId) {
    url.searchParams.set('workspaceId', input.workspaceId);
  }

  return url.toString();
}

export function isBridgeBindResultEnvelope(value: unknown): value is BridgeBindResultEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return value.type === 'quizmind.extension.bind_result' && typeof value.requestId === 'string' && 'payload' in value;
}

export function isBridgeBindErrorEnvelope(value: unknown): value is BridgeBindErrorEnvelope {
  if (!isRecord(value) || value.type !== 'quizmind.extension.bind_error' || typeof value.requestId !== 'string') {
    return false;
  }

  return isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string';
}

export function isBridgeBindFallbackCodeEnvelope(value: unknown): value is BridgeBindFallbackCodeEnvelope {
  if (
    !isRecord(value) ||
    value.type !== 'quizmind.extension.bind_fallback_code' ||
    typeof value.requestId !== 'string'
  ) {
    return false;
  }

  return (
    isRecord(value.fallbackCode) &&
    typeof value.fallbackCode.code === 'string' &&
    value.fallbackCode.code.trim().length > 0
  );
}

function normalizeBridgeEnvelope(value: unknown): BridgeEnvelope | undefined {
  if (isBridgeBindResultEnvelope(value)) {
    return value;
  }

  if (isBridgeBindErrorEnvelope(value)) {
    return value;
  }

  if (isBridgeBindFallbackCodeEnvelope(value)) {
    return value;
  }

  return undefined;
}

function normalizeBindResult(value: unknown): ExtensionInstallationBindResult | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (!isRecord(value.installation) || !isRecord(value.session) || !isRecord(value.bootstrap)) {
    if (isRecord(value.data)) {
      return normalizeBindResult(value.data);
    }

    return undefined;
  }

  return value as unknown as ExtensionInstallationBindResult;
}

function resolveBridgeErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  if (isRecord(payload.error) && typeof payload.error.message === 'string' && payload.error.message.trim().length > 0) {
    return payload.error.message.trim();
  }

  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    return payload.message.trim();
  }

  return fallback;
}

function resolveBridgeErrorCode(payload: unknown, fallback: string): string {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.code !== 'string') {
    return fallback;
  }

  const normalized = payload.error.code.trim();

  return normalized.length > 0 ? normalized : fallback;
}

export async function redeemBindFallbackCode(input: {
  siteUrl: string;
  fallbackCode: string;
  installationId?: string;
  requestId?: string;
  bridgeNonce?: string;
  redeemPath?: string;
  fetcher?: typeof fetch;
}): Promise<ExtensionInstallationBindResult> {
  const normalizedCode = normalizeString(input.fallbackCode);

  if (!normalizedCode) {
    throw new PlatformBridgeError('Fallback bind code is required.', 'missing_fallback_code', input.requestId);
  }

  const redeemPath = normalizeString(input.redeemPath) ?? '/api/extension/bind/redeem';
  const redeemUrl = new URL(redeemPath, `${trimTrailingSlash(input.siteUrl)}/`).toString();
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(redeemUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      code: normalizedCode,
      ...(normalizeString(input.installationId) ? { installationId: normalizeString(input.installationId) } : {}),
      ...(normalizeString(input.requestId) ? { requestId: normalizeString(input.requestId) } : {}),
      ...(normalizeString(input.bridgeNonce) ? { bridgeNonce: normalizeString(input.bridgeNonce) } : {}),
    }),
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<ExtensionInstallationBindResult> | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    const message = resolveBridgeErrorMessage(payload, `Fallback bind redeem failed (status ${response.status}).`);
    const code = resolveBridgeErrorCode(payload, 'bind_redeem_failed');

    throw new PlatformBridgeError(message, code, input.requestId);
  }

  return payload.data;
}

export function handleBridgeMessage(input: {
  message: unknown;
  expectedRequestId: string;
  expectedBridgeNonce: string;
}):
  | { ok: true; result: ExtensionInstallationBindResult }
  | { ok: false; error: { code: string; message: string } } {
  const envelope = normalizeBridgeEnvelope(input.message);

  if (!envelope) {
    return {
      ok: false,
      error: {
        code: 'invalid_envelope',
        message: 'Bridge response payload shape is invalid.',
      },
    };
  }

  if (envelope.requestId !== input.expectedRequestId) {
    return {
      ok: false,
      error: {
        code: 'request_mismatch',
        message: 'Bridge response requestId does not match the active bind request.',
      },
    };
  }

  if (normalizeString(envelope.bridgeNonce) !== input.expectedBridgeNonce) {
    return {
      ok: false,
      error: {
        code: 'nonce_mismatch',
        message: 'Bridge response bridgeNonce does not match the active bind request.',
      },
    };
  }

  if (envelope.type === 'quizmind.extension.bind_error') {
    return {
      ok: false,
      error: {
        code: envelope.error.code,
        message: envelope.error.message,
      },
    };
  }

  if (envelope.type === 'quizmind.extension.bind_fallback_code') {
    return {
      ok: false,
      error: {
        code: 'fallback_code_envelope',
        message: 'Bridge returned a fallback code envelope instead of a direct bind result.',
      },
    };
  }

  return {
    ok: true,
    result: envelope.payload,
  };
}

export async function connectToPlatform(input: ConnectToPlatformInput): Promise<ExtensionInstallationBindResult> {
  const installationId = await input.state.getOrCreateInstallationId();
  const requestId = normalizeString(input.requestId) ?? createBridgeRequestId();
  const bridgeNonce = normalizeString(input.bridgeNonce) ?? createBridgeNonce();
  const url = buildExtensionConnectUrl({
    siteUrl: input.siteUrl,
    installationId,
    environment: input.environment,
    handshake: input.handshake,
    targetOrigin: input.targetOrigin,
    requestId,
    bridgeNonce,
    bridgeMode: 'fallback_code',
    ...(normalizeString(input.workspaceId) ? { workspaceId: normalizeString(input.workspaceId) } : {}),
  });
  const bridgeResponse = await input.openBridge({
    url,
    requestId,
    bridgeNonce,
  });
  const directBindResult = normalizeBindResult(bridgeResponse);

  if (directBindResult) {
    await input.state.saveBindResult(directBindResult);
    return directBindResult;
  }

  const bridgeEnvelope = normalizeBridgeEnvelope(bridgeResponse);

  if (bridgeEnvelope?.type === 'quizmind.extension.bind_fallback_code') {
    if (bridgeEnvelope.requestId !== requestId) {
      throw new PlatformBridgeError(
        'Bridge response requestId does not match the active bind request.',
        'request_mismatch',
        requestId,
      );
    }

    if (normalizeString(bridgeEnvelope.bridgeNonce) !== bridgeNonce) {
      throw new PlatformBridgeError(
        'Bridge response bridgeNonce does not match the active bind request.',
        'nonce_mismatch',
        requestId,
      );
    }

    const redeemedResult = await redeemBindFallbackCode({
      siteUrl: input.siteUrl,
      fallbackCode: bridgeEnvelope.fallbackCode.code,
      installationId,
      requestId,
      bridgeNonce,
      redeemPath: bridgeEnvelope.fallbackCode.redeemPath,
      fetcher: input.fetcher,
    });

    await input.state.saveBindResult(redeemedResult);

    return redeemedResult;
  }

  const handledMessage = handleBridgeMessage({
    message: bridgeResponse,
    expectedRequestId: requestId,
    expectedBridgeNonce: bridgeNonce,
  });

  if (!handledMessage.ok) {
    throw new PlatformBridgeError(handledMessage.error.message, handledMessage.error.code, requestId);
  }

  await input.state.saveBindResult(handledMessage.result);

  return handledMessage.result;
}
