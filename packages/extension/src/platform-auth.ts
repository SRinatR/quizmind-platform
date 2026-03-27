import {
  type CompatibilityHandshake,
  type ExtensionInstallationBindResult,
} from '@quizmind/contracts';

import { type PlatformStateManager } from './platform-state';

interface BridgeEnvelopeBase {
  requestId: string;
  bridgeNonce?: string;
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

export type BridgeEnvelope = BridgeBindResultEnvelope | BridgeBindErrorEnvelope;

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

function normalizeBridgeEnvelope(value: unknown): BridgeEnvelope | undefined {
  if (isBridgeBindResultEnvelope(value)) {
    return value;
  }

  if (isBridgeBindErrorEnvelope(value)) {
    return value;
  }

  return undefined;
}

function normalizeBindResult(value: unknown): ExtensionInstallationBindResult | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (!isRecord(value.installation) || !isRecord(value.session) || !isRecord(value.bootstrap)) {
    return undefined;
  }

  return value as unknown as ExtensionInstallationBindResult;
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
