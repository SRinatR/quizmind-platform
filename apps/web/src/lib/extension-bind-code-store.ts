import { randomBytes } from 'node:crypto';
import { type ExtensionInstallationBindResult } from '@quizmind/contracts';

export interface ExtensionBindFallbackCode {
  code: string;
  expiresAt: string;
  ttlSeconds: number;
  redeemPath: string;
}

export interface IssueBindFallbackCodeInput {
  result: ExtensionInstallationBindResult;
  installationId: string;
  requestId?: string;
  bridgeNonce?: string;
  targetOrigin?: string;
  ttlSeconds?: number;
  nowMs?: number;
}

export interface RedeemBindFallbackCodeInput {
  code?: string;
  installationId?: string;
  requestId?: string;
  bridgeNonce?: string;
  requestOrigin?: string;
  nowMs?: number;
}

export type BindCodeRedeemFailureCode = 'invalid_or_expired' | 'context_mismatch';

export type RedeemBindFallbackCodeResult =
  | {
      ok: true;
      result: ExtensionInstallationBindResult;
      redeemedAt: string;
    }
  | {
      ok: false;
      code: BindCodeRedeemFailureCode;
      message: string;
    };

interface BindCodeRecord {
  code: string;
  createdAtMs: number;
  expiresAtMs: number;
  installationId: string;
  requestId?: string;
  bridgeNonce?: string;
  targetOrigin?: string;
  result: ExtensionInstallationBindResult;
}

const DEFAULT_TTL_SECONDS = 180;
const MIN_TTL_SECONDS = 30;
const MAX_TTL_SECONDS = 900;
const MAX_ACTIVE_CODES = 2_000;
export const extensionBindFallbackRedeemPath = '/api/extension/bind/redeem';

// In-memory fallback is sufficient for local/dev and single-instance deploys.
// For horizontally scaled production, replace this with a shared store (Redis/PostgreSQL).
const bindCodeRecords = new Map<string, BindCodeRecord>();

function clampTtlSeconds(value?: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TTL_SECONDS;
  }

  const rounded = Math.floor(value ?? DEFAULT_TTL_SECONDS);

  if (rounded < MIN_TTL_SECONDS) {
    return MIN_TTL_SECONDS;
  }

  if (rounded > MAX_TTL_SECONDS) {
    return MAX_TTL_SECONDS;
  }

  return rounded;
}

export function normalizeBridgeOrigin(value?: string): string | undefined {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);

    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.origin;
    }

    if (parsed.protocol === 'chrome-extension:' || parsed.protocol === 'moz-extension:') {
      return `${parsed.protocol}//${parsed.host}`;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function pruneExpiredBindCodes(nowMs: number): void {
  for (const [code, record] of bindCodeRecords) {
    if (record.expiresAtMs <= nowMs) {
      bindCodeRecords.delete(code);
    }
  }
}

function trimStoreToLimit(): void {
  if (bindCodeRecords.size <= MAX_ACTIVE_CODES) {
    return;
  }

  const oldestByCreation = Array.from(bindCodeRecords.values())
    .sort((left, right) => left.createdAtMs - right.createdAtMs)
    .slice(0, bindCodeRecords.size - MAX_ACTIVE_CODES);

  for (const record of oldestByCreation) {
    bindCodeRecords.delete(record.code);
  }
}

function createBindCode(): string {
  return `bindc_${randomBytes(18).toString('base64url')}`;
}

function normalizeHeaderValue(value?: string): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

export function issueBindFallbackCode(input: IssueBindFallbackCodeInput): ExtensionBindFallbackCode {
  const nowMs = input.nowMs ?? Date.now();
  pruneExpiredBindCodes(nowMs);

  const ttlSeconds = clampTtlSeconds(input.ttlSeconds);
  const code = createBindCode();
  const expiresAtMs = nowMs + ttlSeconds * 1000;

  bindCodeRecords.set(code, {
    code,
    createdAtMs: nowMs,
    expiresAtMs,
    installationId: input.installationId,
    requestId: normalizeHeaderValue(input.requestId),
    bridgeNonce: normalizeHeaderValue(input.bridgeNonce),
    targetOrigin: normalizeBridgeOrigin(input.targetOrigin),
    result: input.result,
  });

  trimStoreToLimit();

  return {
    code,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ttlSeconds,
    redeemPath: extensionBindFallbackRedeemPath,
  };
}

export function redeemBindFallbackCode(input: RedeemBindFallbackCodeInput): RedeemBindFallbackCodeResult {
  const nowMs = input.nowMs ?? Date.now();
  pruneExpiredBindCodes(nowMs);

  const code = normalizeHeaderValue(input.code);

  if (!code) {
    return {
      ok: false,
      code: 'invalid_or_expired',
      message: 'Bind code is required.',
    };
  }

  const record = bindCodeRecords.get(code);

  if (!record || record.expiresAtMs <= nowMs) {
    bindCodeRecords.delete(code);
    return {
      ok: false,
      code: 'invalid_or_expired',
      message: 'Bind code is invalid or expired.',
    };
  }

  const installationId = normalizeHeaderValue(input.installationId);
  const requestId = normalizeHeaderValue(input.requestId);
  const bridgeNonce = normalizeHeaderValue(input.bridgeNonce);
  const requestOrigin = normalizeBridgeOrigin(input.requestOrigin);

  if (installationId && installationId !== record.installationId) {
    return {
      ok: false,
      code: 'context_mismatch',
      message: 'Bind code context does not match installation id.',
    };
  }

  if (record.requestId && requestId !== record.requestId) {
    return {
      ok: false,
      code: 'context_mismatch',
      message: 'Bind code context does not match request id.',
    };
  }

  if (record.bridgeNonce && bridgeNonce !== record.bridgeNonce) {
    return {
      ok: false,
      code: 'context_mismatch',
      message: 'Bind code context does not match bridge nonce.',
    };
  }

  if (record.targetOrigin && requestOrigin !== record.targetOrigin) {
    return {
      ok: false,
      code: 'context_mismatch',
      message: 'Bind code request origin does not match the expected target origin.',
    };
  }

  bindCodeRecords.delete(code);

  return {
    ok: true,
    result: record.result,
    redeemedAt: new Date(nowMs).toISOString(),
  };
}

export function resetBindFallbackCodesForTests(): void {
  bindCodeRecords.clear();
}
