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
  relayUrl?: string;
  platformOrigin?: string;
  state: PlatformStateManager;
  requestId?: string;
  bridgeNonce?: string;
  bridgeMode?: 'bind_result' | 'fallback_code';
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

const DEV_DEFAULT_PLATFORM_SITE_URL = 'http://localhost:3000';
const BRIDGE_REQUEST_ID_MIN_LENGTH = 8;
const BRIDGE_REQUEST_ID_MAX_LENGTH = 160;
const BRIDGE_NONCE_MIN_LENGTH = 8;
const BRIDGE_NONCE_MAX_LENGTH = 128;
const BRIDGE_TOKEN_PATTERN = /^[A-Za-z0-9:_\-.]+$/;
const RECOMMENDED_HANDSHAKE_CAPABILITIES = [
  'quiz-capture',
  'runtime.chat',
  'runtime.answer',
  'runtime.screenshot',
  'runtime.multicheck',
  'runtime.models.read',
  'relay.query_payload',
  'relay.postmessage_payload',
] as const;

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

function normalizeBridgeRequestId(value: string | undefined): string | undefined {
  const normalized = normalizeString(value);

  if (
    !normalized ||
    normalized.length < BRIDGE_REQUEST_ID_MIN_LENGTH ||
    normalized.length > BRIDGE_REQUEST_ID_MAX_LENGTH
  ) {
    return undefined;
  }

  return BRIDGE_TOKEN_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizeBridgeNonce(value: string | undefined): string | undefined {
  const normalized = normalizeString(value);

  if (
    !normalized ||
    normalized.length < BRIDGE_NONCE_MIN_LENGTH ||
    normalized.length > BRIDGE_NONCE_MAX_LENGTH
  ) {
    return undefined;
  }

  return BRIDGE_TOKEN_PATTERN.test(normalized) ? normalized : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();

  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function decodeBase64UrlToJson(value: string): unknown {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4 || 4)) % 4;
  const padded = `${normalized}${'='.repeat(paddingLength)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const decoded = new TextDecoder().decode(bytes);
  return JSON.parse(decoded);
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

function normalizeHttpOrigin(value: string, fieldName: string): string {
  const parsed = new URL(value);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${fieldName} must use http or https protocol.`);
  }

  return parsed.origin;
}

function normalizeRelayUrl(value: string, targetOrigin: string): string {
  const parsed = new URL(value);
  const relayOrigin = normalizeOrigin(parsed.toString());
  const normalizedTargetOrigin = normalizeOrigin(targetOrigin);

  if (relayOrigin !== normalizedTargetOrigin) {
    throw new Error('relayUrl origin must match targetOrigin.');
  }

  return parsed.toString();
}

export function createBridgeNonce(): string {
  return `nonce_${randomHex(18)}`;
}

export function createBridgeRequestId(prefix = 'bind'): string {
  const normalizedPrefix = normalizeBridgeRequestId(prefix)?.replace(/[_:.-]+/g, '_') ?? 'bind';

  return `${normalizedPrefix}_${Date.now()}_${randomHex(6)}`;
}

export function buildRecommendedHandshakeCapabilities(additionalCapabilities: string[] = []): string[] {
  const normalizedAdditionalCapabilities = additionalCapabilities
    .map((capability) => capability.trim())
    .filter((capability) => capability.length > 0);

  return Array.from(new Set([...RECOMMENDED_HANDSHAKE_CAPABILITIES, ...normalizedAdditionalCapabilities]));
}

export function resolvePlatformSiteUrl(input?: {
  productionSiteUrl?: string;
  devOverrideSiteUrl?: string;
  fallbackDevSiteUrl?: string;
  nodeEnv?: string;
}): string {
  const nodeEnv = input?.nodeEnv?.trim().toLowerCase() ?? 'development';
  const isProduction = nodeEnv === 'production';
  const productionSiteUrl = input?.productionSiteUrl?.trim();
  const devOverrideSiteUrl = input?.devOverrideSiteUrl?.trim();
  const fallbackDevSiteUrl = input?.fallbackDevSiteUrl?.trim() ?? DEV_DEFAULT_PLATFORM_SITE_URL;
  const selectedSiteUrl = devOverrideSiteUrl || productionSiteUrl || fallbackDevSiteUrl;

  let parsed: URL;

  try {
    parsed = new URL(selectedSiteUrl);
  } catch {
    throw new Error('Platform site URL must be a valid absolute URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Platform site URL must use http:// or https:// protocol.');
  }

  if (isProduction) {
    if (!productionSiteUrl && !devOverrideSiteUrl) {
      throw new Error(
        'Production platform site URL is required. Configure productionSiteUrl or provide a runtime override.',
      );
    }

    if (parsed.protocol !== 'https:') {
      throw new Error('Production platform site URL must use https:// protocol.');
    }

    if (isLoopbackHostname(parsed.hostname)) {
      throw new Error('Production platform site URL must not target localhost loopback.');
    }
  }

  return parsed.origin;
}

export function buildExtensionConnectUrl(input: {
  siteUrl: string;
  installationId: string;
  environment: string;
  handshake: CompatibilityHandshake;
  targetOrigin: string;
  relayUrl?: string;
  platformOrigin?: string;
  requestId: string;
  bridgeNonce: string;
  bridgeMode?: 'bind_result' | 'fallback_code';
}): string {
  const url = new URL('/app/extension/connect', input.siteUrl);
  const normalizedTargetOrigin = normalizeOrigin(input.targetOrigin);
  const platformOrigin = normalizeHttpOrigin(
    normalizeString(input.platformOrigin) ?? new URL(input.siteUrl).toString(),
    'platformOrigin',
  );
  const requestId = normalizeBridgeRequestId(input.requestId);
  const bridgeNonce = normalizeBridgeNonce(input.bridgeNonce);

  if (!requestId) {
    throw new Error(
      `requestId must be ${String(BRIDGE_REQUEST_ID_MIN_LENGTH)}-${String(BRIDGE_REQUEST_ID_MAX_LENGTH)} characters using A-Z, a-z, 0-9, "_", "-", ".", or ":".`,
    );
  }

  if (!bridgeNonce) {
    throw new Error(
      `bridgeNonce must be ${String(BRIDGE_NONCE_MIN_LENGTH)}-${String(BRIDGE_NONCE_MAX_LENGTH)} characters using A-Z, a-z, 0-9, "_", "-", ".", or ":".`,
    );
  }

  url.searchParams.set('installationId', input.installationId);
  url.searchParams.set('environment', input.environment);
  url.searchParams.set('extensionVersion', input.handshake.extensionVersion);
  url.searchParams.set('schemaVersion', input.handshake.schemaVersion);
  url.searchParams.set('browser', input.handshake.browser);
  url.searchParams.set('capabilities', input.handshake.capabilities.join(','));
  url.searchParams.set('targetOrigin', normalizedTargetOrigin);
  url.searchParams.set('platformOrigin', platformOrigin);
  url.searchParams.set('requestId', requestId);
  url.searchParams.set('bridgeNonce', bridgeNonce);
  url.searchParams.set('bridgeMode', input.bridgeMode ?? 'fallback_code');

  if (input.relayUrl) {
    url.searchParams.set('relayUrl', normalizeRelayUrl(input.relayUrl, normalizedTargetOrigin));
  }

  if (input.handshake.buildId) {
    url.searchParams.set('buildId', input.handshake.buildId);
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

function normalizeBridgeEnvelopeFromRecord(value: unknown): BridgeEnvelope | undefined {
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

function parseBridgeEnvelopeFromQueryPayload(searchParams: URLSearchParams): BridgeEnvelope | undefined {
  const rawPayload = normalizeString(searchParams.get('quizmind_bridge_payload') ?? undefined);

  if (!rawPayload) {
    return undefined;
  }

  const payloadFormat = normalizeString(searchParams.get('quizmind_bridge_payload_format') ?? undefined);
  const queryRequestId = normalizeString(searchParams.get('requestId') ?? undefined);
  const queryBridgeNonce = normalizeString(searchParams.get('bridgeNonce') ?? undefined);
  let decodedPayload: unknown;

  try {
    if (payloadFormat === 'base64url-json' || payloadFormat === 'base64url') {
      decodedPayload = decodeBase64UrlToJson(rawPayload);
    } else {
      try {
        decodedPayload = JSON.parse(rawPayload);
      } catch {
        decodedPayload = JSON.parse(decodeURIComponent(rawPayload));
      }
    }
  } catch {
    return undefined;
  }

  if (!isRecord(decodedPayload)) {
    return undefined;
  }

  const normalizedPayload: Record<string, unknown> = { ...decodedPayload };

  if (queryRequestId && typeof normalizedPayload.requestId !== 'string') {
    normalizedPayload.requestId = queryRequestId;
  }

  if (queryBridgeNonce && typeof normalizedPayload.bridgeNonce !== 'string') {
    normalizedPayload.bridgeNonce = queryBridgeNonce;
  }

  return normalizeBridgeEnvelopeFromRecord(normalizedPayload);
}

function normalizeBridgeEnvelope(value: unknown): BridgeEnvelope | undefined {
  if (value instanceof URL) {
    return parseBridgeEnvelopeFromQueryPayload(value.searchParams);
  }

  if (typeof value === 'string') {
    const normalized = value.trim();

    if (!normalized) {
      return undefined;
    }

    try {
      const parsedUrl = new URL(normalized);
      const fromQueryPayload = parseBridgeEnvelopeFromQueryPayload(parsedUrl.searchParams);

      if (fromQueryPayload) {
        return fromQueryPayload;
      }
    } catch {
      // Not a URL payload; continue with JSON parsing.
    }

    try {
      return normalizeBridgeEnvelopeFromRecord(JSON.parse(normalized));
    } catch {
      return undefined;
    }
  }

  return normalizeBridgeEnvelopeFromRecord(value);
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
  const requestId = normalizeString(input.requestId)
    ? normalizeBridgeRequestId(input.requestId)
    : createBridgeRequestId();
  const bridgeNonce = normalizeString(input.bridgeNonce)
    ? normalizeBridgeNonce(input.bridgeNonce)
    : createBridgeNonce();

  if (!requestId) {
    throw new PlatformBridgeError(
      `requestId must be ${String(BRIDGE_REQUEST_ID_MIN_LENGTH)}-${String(BRIDGE_REQUEST_ID_MAX_LENGTH)} characters using A-Z, a-z, 0-9, "_", "-", ".", or ":".`,
      'invalid_request_id',
    );
  }

  if (!bridgeNonce) {
    throw new PlatformBridgeError(
      `bridgeNonce must be ${String(BRIDGE_NONCE_MIN_LENGTH)}-${String(BRIDGE_NONCE_MAX_LENGTH)} characters using A-Z, a-z, 0-9, "_", "-", ".", or ":".`,
      'invalid_bridge_nonce',
      requestId,
    );
  }

  const url = buildExtensionConnectUrl({
    siteUrl: input.siteUrl,
    installationId,
    environment: input.environment,
    handshake: input.handshake,
    targetOrigin: input.targetOrigin,
    ...(normalizeString(input.relayUrl) ? { relayUrl: normalizeString(input.relayUrl) } : {}),
    ...(normalizeString(input.platformOrigin) ? { platformOrigin: normalizeString(input.platformOrigin) } : {}),
    requestId,
    bridgeNonce,
    bridgeMode: input.bridgeMode ?? 'fallback_code',
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
