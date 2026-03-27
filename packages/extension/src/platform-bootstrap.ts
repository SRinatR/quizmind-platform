import {
  type CompatibilityHandshake,
  type ExtensionBootstrapPayloadV2,
  type ExtensionBootstrapRequestV2,
} from '@quizmind/contracts';

import { type PlatformStateManager } from './platform-state';

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    message?: string;
  };
}

export class PlatformRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'PlatformRequestError';
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function resolveErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fallback;
  }

  const candidate = payload as { error?: { message?: string }; message?: string };

  if (typeof candidate.error?.message === 'string' && candidate.error.message.trim().length > 0) {
    return candidate.error.message.trim();
  }

  if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
    return candidate.message.trim();
  }

  return fallback;
}

export function buildBootstrapRequest(input: {
  installationId: string;
  environment: string;
  handshake: CompatibilityHandshake;
}): ExtensionBootstrapRequestV2 {
  return {
    installationId: input.installationId,
    environment: input.environment,
    handshake: input.handshake,
  };
}

export async function refreshBootstrap(input: {
  apiUrl: string;
  token: string;
  request: ExtensionBootstrapRequestV2;
  state?: PlatformStateManager;
  fetcher?: typeof fetch;
}): Promise<ExtensionBootstrapPayloadV2> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(`${trimTrailingSlash(input.apiUrl)}/extension/bootstrap/v2`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input.request),
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<ExtensionBootstrapPayloadV2> | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    const message = resolveErrorMessage(payload, `Unable to refresh bootstrap (status ${response.status}).`);
    const retryable = response.status >= 500 || response.status === 429;

    throw new PlatformRequestError(message, response.status, retryable);
  }

  if (input.state) {
    await input.state.setWorkspaceId(payload.data.workspaceId);
    await input.state.saveBootstrapCache(payload.data, payload.data.issuedAt);
  }

  return payload.data;
}

export function resolveBootstrapRefreshDelayMs(input: {
  bootstrap: ExtensionBootstrapPayloadV2;
  nowMs?: number;
  earlyRefreshSeconds?: number;
  minDelayMs?: number;
}): number {
  const nowMs = input.nowMs ?? Date.now();
  const earlyRefreshSeconds = Math.max(0, Math.floor(input.earlyRefreshSeconds ?? 30));
  const minDelayMs = Math.max(0, Math.floor(input.minDelayMs ?? 15_000));
  const refreshAfterSeconds = Math.max(30, Math.floor(input.bootstrap.refreshAfterSeconds));
  const issuedAtMs = Date.parse(input.bootstrap.issuedAt);

  if (!Number.isFinite(issuedAtMs)) {
    return Math.max(minDelayMs, (refreshAfterSeconds - earlyRefreshSeconds) * 1_000);
  }

  const refreshAtMs = issuedAtMs + refreshAfterSeconds * 1_000 - earlyRefreshSeconds * 1_000;

  return Math.max(minDelayMs, Math.floor(refreshAtMs - nowMs));
}
