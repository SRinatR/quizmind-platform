import { randomBytes } from 'node:crypto';
import IORedis from 'ioredis';
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

export type BindCodeRedeemFailureCode = 'invalid_or_expired' | 'context_mismatch' | 'store_unavailable';

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
const REDIS_KEY_PREFIX = 'quizmind:extension:bind_fallback:';
const REDIS_CONNECT_TIMEOUT_MS = 900;
const REDIS_FAILURE_COOLDOWN_MS = 30_000;
export const extensionBindFallbackRedeemPath = '/api/extension/bind/redeem';

export class BindCodeStoreUnavailableError extends Error {
  constructor(message = 'Shared bind code store is unavailable.') {
    super(message);
    this.name = 'BindCodeStoreUnavailableError';
  }
}

// Redis shared store is the primary source for multi-instance environments.
// In-memory storage remains as a local fallback when Redis is unavailable.
const bindCodeRecords = new Map<string, BindCodeRecord>();
let redisClient: IORedis | null = null;
let redisStoreDisabledUntilMs = 0;

const redeemBindCodeScript = `
local key = KEYS[1]
local nowMs = tonumber(ARGV[1]) or 0
local expectedInstallationId = ARGV[2]
local expectedRequestId = ARGV[3]
local expectedBridgeNonce = ARGV[4]
local expectedRequestOrigin = ARGV[5]

local raw = redis.call('GET', key)
if not raw then
  return { 'invalid' }
end

local decoded = cjson.decode(raw)
local expiresAtMs = tonumber(decoded.expiresAtMs) or 0
if expiresAtMs <= nowMs then
  redis.call('DEL', key)
  return { 'invalid' }
end

if expectedInstallationId ~= '' and decoded.installationId ~= expectedInstallationId then
  return { 'mismatch', 'installationId' }
end

if decoded.requestId and decoded.requestId ~= '' and decoded.requestId ~= expectedRequestId then
  return { 'mismatch', 'requestId' }
end

if decoded.bridgeNonce and decoded.bridgeNonce ~= '' and decoded.bridgeNonce ~= expectedBridgeNonce then
  return { 'mismatch', 'bridgeNonce' }
end

if decoded.targetOrigin and decoded.targetOrigin ~= '' and decoded.targetOrigin ~= expectedRequestOrigin then
  return { 'mismatch', 'targetOrigin' }
end

redis.call('DEL', key)
return { 'ok', raw }
`;

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

function resolveRedisUrl(): string | undefined {
  const normalized = process.env.REDIS_URL?.trim();

  return normalized ? normalized : undefined;
}

function isSharedStoreRequired(): boolean {
  const mode = process.env.QUIZMIND_EXTENSION_BIND_CODE_STORE_MODE?.trim().toLowerCase();

  if (mode === 'required') {
    return true;
  }

  if (mode === 'optional') {
    return false;
  }

  return process.env.NODE_ENV === 'production';
}

function buildRedisKey(code: string): string {
  return `${REDIS_KEY_PREFIX}${code}`;
}

function createRedisClient(redisUrl: string): IORedis {
  const client = new IORedis(redisUrl, {
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    enableOfflineQueue: false,
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  // Redis connection errors should degrade gracefully to local fallback handling.
  client.on('error', () => undefined);

  return client;
}

function disableRedisStore(nowMs: number): void {
  redisStoreDisabledUntilMs = nowMs + REDIS_FAILURE_COOLDOWN_MS;

  if (!redisClient) {
    return;
  }

  redisClient.disconnect(false);
  redisClient = null;
}

async function withRedisStore<T>(
  nowMs: number,
  operation: (client: IORedis) => Promise<T>,
): Promise<T | null> {
  if (nowMs < redisStoreDisabledUntilMs) {
    return null;
  }

  const redisUrl = resolveRedisUrl();

  if (!redisUrl) {
    return null;
  }

  if (!redisClient) {
    redisClient = createRedisClient(redisUrl);
  }

  try {
    return await operation(redisClient);
  } catch {
    disableRedisStore(nowMs);
    return null;
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

function deserializeBindCodeRecord(value: string): BindCodeRecord | null {
  try {
    const parsed = JSON.parse(value) as Partial<BindCodeRecord> | null;

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (
      typeof parsed.code !== 'string' ||
      typeof parsed.createdAtMs !== 'number' ||
      typeof parsed.expiresAtMs !== 'number' ||
      typeof parsed.installationId !== 'string' ||
      typeof parsed.result !== 'object' ||
      !parsed.result
    ) {
      return null;
    }

    return parsed as BindCodeRecord;
  } catch {
    return null;
  }
}

function buildContextMismatchMessage(field?: string): string {
  if (field === 'installationId') {
    return 'Bind code context does not match installation id.';
  }

  if (field === 'requestId') {
    return 'Bind code context does not match request id.';
  }

  if (field === 'bridgeNonce') {
    return 'Bind code context does not match bridge nonce.';
  }

  if (field === 'targetOrigin') {
    return 'Bind code request origin does not match the expected target origin.';
  }

  return 'Bind code context does not match the expected bridge request.';
}

export async function issueBindFallbackCode(input: IssueBindFallbackCodeInput): Promise<ExtensionBindFallbackCode> {
  const nowMs = input.nowMs ?? Date.now();
  pruneExpiredBindCodes(nowMs);

  const ttlSeconds = clampTtlSeconds(input.ttlSeconds);
  const code = createBindCode();
  const expiresAtMs = nowMs + ttlSeconds * 1000;
  const record: BindCodeRecord = {
    code,
    createdAtMs: nowMs,
    expiresAtMs,
    installationId: input.installationId,
    requestId: normalizeHeaderValue(input.requestId),
    bridgeNonce: normalizeHeaderValue(input.bridgeNonce),
    targetOrigin: normalizeBridgeOrigin(input.targetOrigin),
    result: input.result,
  };

  bindCodeRecords.set(code, record);

  trimStoreToLimit();

  const storedInRedis = await withRedisStore(nowMs, async (client) => {
    await client.set(buildRedisKey(code), JSON.stringify(record), 'EX', ttlSeconds);
    return true;
  });

  if (storedInRedis) {
    // When shared store write succeeds, Redis becomes source of truth for this code.
    bindCodeRecords.delete(code);
  } else if (isSharedStoreRequired()) {
    bindCodeRecords.delete(code);
    throw new BindCodeStoreUnavailableError(
      'Shared bind code store is required but unavailable. Retry the extension bind flow in a healthy environment.',
    );
  }

  return {
    code,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ttlSeconds,
    redeemPath: extensionBindFallbackRedeemPath,
  };
}

export async function redeemBindFallbackCode(
  input: RedeemBindFallbackCodeInput,
): Promise<RedeemBindFallbackCodeResult> {
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

  const installationId = normalizeHeaderValue(input.installationId);
  const requestId = normalizeHeaderValue(input.requestId);
  const bridgeNonce = normalizeHeaderValue(input.bridgeNonce);
  const requestOrigin = normalizeBridgeOrigin(input.requestOrigin);

  const redisResult = await withRedisStore(nowMs, async (client) =>
    client.eval(
      redeemBindCodeScript,
      1,
      buildRedisKey(code),
      String(nowMs),
      installationId ?? '',
      requestId ?? '',
      bridgeNonce ?? '',
      requestOrigin ?? '',
    ),
  );

  if (redisResult !== null) {
    if (!Array.isArray(redisResult) || redisResult.length === 0 || typeof redisResult[0] !== 'string') {
      bindCodeRecords.delete(code);
      return {
        ok: false,
        code: 'invalid_or_expired',
        message: 'Bind code is invalid or expired.',
      };
    }

    const status = redisResult[0];

    if (status === 'ok' && typeof redisResult[1] === 'string') {
      const decodedRecord = deserializeBindCodeRecord(redisResult[1]);
      bindCodeRecords.delete(code);

      if (!decodedRecord) {
        return {
          ok: false,
          code: 'invalid_or_expired',
          message: 'Bind code is invalid or expired.',
        };
      }

      return {
        ok: true,
        result: decodedRecord.result,
        redeemedAt: new Date(nowMs).toISOString(),
      };
    }

    if (status === 'invalid') {
      bindCodeRecords.delete(code);
      return {
        ok: false,
        code: 'invalid_or_expired',
        message: 'Bind code is invalid or expired.',
      };
    }

    if (status === 'mismatch') {
      const mismatchField = typeof redisResult[1] === 'string' ? redisResult[1] : undefined;
      return {
        ok: false,
        code: 'context_mismatch',
        message: buildContextMismatchMessage(mismatchField),
      };
    }

    return {
      ok: false,
      code: 'invalid_or_expired',
      message: 'Bind code is invalid or expired.',
    };
  }

  if (isSharedStoreRequired()) {
    bindCodeRecords.delete(code);
    return {
      ok: false,
      code: 'store_unavailable',
      message: 'Shared bind code store is unavailable. Reconnect the extension and retry.',
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

export async function resetBindFallbackCodesForTests(): Promise<void> {
  bindCodeRecords.clear();
  redisStoreDisabledUntilMs = 0;

  if (!redisClient) {
    return;
  }

  const currentClient = redisClient;
  redisClient = null;

  try {
    await currentClient.quit();
  } catch {
    currentClient.disconnect(false);
  }
}
