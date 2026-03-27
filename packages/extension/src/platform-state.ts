import {
  type ExtensionBootstrapPayloadV2,
  type ExtensionInstallationBindResult,
  type ExtensionInstallationTokenSession,
} from '@quizmind/contracts';

export interface PlatformStateStore {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface PlatformRuntimeStateSnapshot {
  installationId?: string;
  workspaceId?: string;
  installationSession?: ExtensionInstallationTokenSession;
  lastBootstrap?: ExtensionBootstrapPayloadV2;
  lastBootstrapFetchedAt?: string;
}

function normalizeTrimmedValue(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function parseJsonValue<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function randomBytesHex(bytes = 16): string {
  const randomValues = new Uint8Array(bytes);
  const cryptography = globalThis.crypto;

  if (cryptography?.getRandomValues) {
    cryptography.getRandomValues(randomValues);
  } else {
    for (let index = 0; index < randomValues.length; index += 1) {
      randomValues[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(randomValues, (value) => value.toString(16).padStart(2, '0')).join('');
}

function defaultInstallationIdFactory(): string {
  const cryptography = globalThis.crypto as typeof globalThis.crypto & {
    randomUUID?: () => string;
  };

  if (typeof cryptography?.randomUUID === 'function') {
    return `inst_${cryptography.randomUUID()}`;
  }

  return `inst_${randomBytesHex(16)}`;
}

export function createInMemoryPlatformStateStore(
  initialEntries?: Record<string, string>,
): PlatformStateStore & { dump: () => Record<string, string> } {
  const entries = new Map<string, string>(Object.entries(initialEntries ?? {}));

  return {
    getItem(key) {
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      entries.set(key, value);
    },
    removeItem(key) {
      entries.delete(key);
    },
    dump() {
      return Object.fromEntries(entries);
    },
  };
}

export function createWebStorageStateStore(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): PlatformStateStore {
  return {
    getItem(key) {
      return storage.getItem(key);
    },
    setItem(key, value) {
      storage.setItem(key, value);
    },
    removeItem(key) {
      storage.removeItem(key);
    },
  };
}

export class PlatformStateManager {
  private readonly installationIdKey: string;

  private readonly workspaceIdKey: string;

  private readonly installationSessionKey: string;

  private readonly bootstrapCacheKey: string;

  private readonly bootstrapFetchedAtKey: string;

  constructor(
    private readonly store: PlatformStateStore,
    namespace = 'quizmind.platform',
  ) {
    const normalizedNamespace = namespace.trim() || 'quizmind.platform';

    this.installationIdKey = `${normalizedNamespace}.installation_id`;
    this.workspaceIdKey = `${normalizedNamespace}.workspace_id`;
    this.installationSessionKey = `${normalizedNamespace}.installation_session`;
    this.bootstrapCacheKey = `${normalizedNamespace}.bootstrap_cache`;
    this.bootstrapFetchedAtKey = `${normalizedNamespace}.bootstrap_fetched_at`;
  }

  async getInstallationId(): Promise<string | undefined> {
    return normalizeTrimmedValue(await this.store.getItem(this.installationIdKey));
  }

  async getOrCreateInstallationId(factory = defaultInstallationIdFactory): Promise<string> {
    const existingInstallationId = await this.getInstallationId();

    if (existingInstallationId) {
      return existingInstallationId;
    }

    const generatedInstallationId = normalizeTrimmedValue(factory());

    if (!generatedInstallationId) {
      throw new Error('Installation id factory returned an empty value.');
    }

    await this.store.setItem(this.installationIdKey, generatedInstallationId);

    return generatedInstallationId;
  }

  async setWorkspaceId(workspaceId?: string): Promise<void> {
    const normalizedWorkspaceId = normalizeTrimmedValue(workspaceId ?? null);

    if (!normalizedWorkspaceId) {
      await this.store.removeItem(this.workspaceIdKey);
      return;
    }

    await this.store.setItem(this.workspaceIdKey, normalizedWorkspaceId);
  }

  async getWorkspaceId(): Promise<string | undefined> {
    return normalizeTrimmedValue(await this.store.getItem(this.workspaceIdKey));
  }

  async saveInstallationSession(session: ExtensionInstallationTokenSession): Promise<void> {
    await this.store.setItem(this.installationSessionKey, JSON.stringify(session));
  }

  async getInstallationSession(): Promise<ExtensionInstallationTokenSession | undefined> {
    const session = parseJsonValue<ExtensionInstallationTokenSession>(
      await this.store.getItem(this.installationSessionKey),
    );

    if (!session || !normalizeTrimmedValue(session.token) || !normalizeTrimmedValue(session.expiresAt)) {
      return undefined;
    }

    return session;
  }

  async clearInstallationSession(): Promise<void> {
    await this.store.removeItem(this.installationSessionKey);
  }

  async saveBootstrapCache(payload: ExtensionBootstrapPayloadV2, fetchedAt = new Date().toISOString()): Promise<void> {
    await this.store.setItem(this.bootstrapCacheKey, JSON.stringify(payload));
    await this.store.setItem(this.bootstrapFetchedAtKey, fetchedAt);
  }

  async getBootstrapCache(): Promise<{ payload: ExtensionBootstrapPayloadV2; fetchedAt?: string } | undefined> {
    const payload = parseJsonValue<ExtensionBootstrapPayloadV2>(
      await this.store.getItem(this.bootstrapCacheKey),
    );

    if (!payload) {
      return undefined;
    }

    return {
      payload,
      fetchedAt: normalizeTrimmedValue(await this.store.getItem(this.bootstrapFetchedAtKey)),
    };
  }

  async clearBootstrapCache(): Promise<void> {
    await this.store.removeItem(this.bootstrapCacheKey);
    await this.store.removeItem(this.bootstrapFetchedAtKey);
  }

  async saveBindResult(result: ExtensionInstallationBindResult): Promise<void> {
    await this.setWorkspaceId(result.installation.workspaceId);
    await this.saveInstallationSession(result.session);
    await this.saveBootstrapCache(result.bootstrap, result.bootstrap.issuedAt);
  }

  async clearRuntimeState(options?: { keepInstallationId?: boolean }): Promise<void> {
    await this.clearInstallationSession();
    await this.clearBootstrapCache();
    await this.setWorkspaceId(undefined);

    if (!options?.keepInstallationId) {
      await this.store.removeItem(this.installationIdKey);
    }
  }

  async getSnapshot(): Promise<PlatformRuntimeStateSnapshot> {
    const installationId = await this.getInstallationId();
    const workspaceId = await this.getWorkspaceId();
    const installationSession = await this.getInstallationSession();
    const bootstrapCache = await this.getBootstrapCache();

    return {
      ...(installationId ? { installationId } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...(installationSession ? { installationSession } : {}),
      ...(bootstrapCache?.payload ? { lastBootstrap: bootstrapCache.payload } : {}),
      ...(bootstrapCache?.fetchedAt ? { lastBootstrapFetchedAt: bootstrapCache.fetchedAt } : {}),
    };
  }
}
