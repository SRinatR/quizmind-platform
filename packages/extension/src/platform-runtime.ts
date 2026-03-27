import {
  type CompatibilityHandshake,
  type ExtensionBootstrapPayloadV2,
  type ExtensionInstallationBindResult,
  type UsageEventIngestResult,
  type UsageEventPayload,
} from '@quizmind/contracts';

import { connectToPlatform } from './platform-auth';
import {
  PlatformRequestError,
  refreshBootstrap,
  resolveBootstrapRefreshDelayMs,
} from './platform-bootstrap';
import { type PlatformStateManager } from './platform-state';
import { sendUsageEvent } from './platform-telemetry';
import { derivePlatformUiState, type PlatformUiState } from './platform-ui';

export interface PlatformRuntimeOptions {
  apiUrl: string;
  siteUrl: string;
  environment: string;
  handshake: CompatibilityHandshake;
  targetOrigin: string;
  state: PlatformStateManager;
  openBridge: Parameters<typeof connectToPlatform>[0]['openBridge'];
  fetcher?: typeof fetch;
}

export interface PlatformBootstrapRefreshResult {
  bootstrap: ExtensionBootstrapPayloadV2;
  source: 'live' | 'cache';
  reconnectRequired: boolean;
  backendUnavailable: boolean;
}

function createReconnectRequiredError(): PlatformRequestError {
  return new PlatformRequestError('Installation session is missing. Reconnect required.', 401, false);
}

export class PlatformRuntimeClient {
  constructor(private readonly options: PlatformRuntimeOptions) {}

  async connectToPlatform(input?: {
    workspaceId?: string;
    requestId?: string;
    bridgeNonce?: string;
  }): Promise<ExtensionInstallationBindResult> {
    return connectToPlatform({
      siteUrl: this.options.siteUrl,
      environment: this.options.environment,
      handshake: this.options.handshake,
      targetOrigin: this.options.targetOrigin,
      state: this.options.state,
      openBridge: this.options.openBridge,
      ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input?.requestId ? { requestId: input.requestId } : {}),
      ...(input?.bridgeNonce ? { bridgeNonce: input.bridgeNonce } : {}),
    });
  }

  async refreshBootstrap(input?: {
    allowCacheFallback?: boolean;
  }): Promise<PlatformBootstrapRefreshResult> {
    const allowCacheFallback = input?.allowCacheFallback !== false;
    const installationId = await this.options.state.getOrCreateInstallationId();
    const session = await this.options.state.getInstallationSession();
    const cache = await this.options.state.getBootstrapCache();

    if (!session) {
      if (allowCacheFallback && cache?.payload) {
        return {
          bootstrap: cache.payload,
          source: 'cache',
          reconnectRequired: true,
          backendUnavailable: false,
        };
      }

      throw createReconnectRequiredError();
    }

    try {
      const bootstrap = await refreshBootstrap({
        apiUrl: this.options.apiUrl,
        token: session.token,
        request: {
          installationId,
          environment: this.options.environment,
          handshake: this.options.handshake,
        },
        state: this.options.state,
        fetcher: this.options.fetcher,
      });

      return {
        bootstrap,
        source: 'live',
        reconnectRequired: false,
        backendUnavailable: false,
      };
    } catch (error) {
      if (!(error instanceof PlatformRequestError)) {
        throw error;
      }

      if (error.status === 401) {
        await this.options.state.clearInstallationSession();

        if (allowCacheFallback && cache?.payload) {
          return {
            bootstrap: cache.payload,
            source: 'cache',
            reconnectRequired: true,
            backendUnavailable: false,
          };
        }
      }

      if (error.retryable && allowCacheFallback && cache?.payload) {
        return {
          bootstrap: cache.payload,
          source: 'cache',
          reconnectRequired: false,
          backendUnavailable: true,
        };
      }

      throw error;
    }
  }

  async sendUsageEvent(input: {
    eventType: string;
    payload: Record<string, unknown>;
    occurredAt?: string;
    workspaceId?: string;
  }): Promise<UsageEventIngestResult> {
    const installationId = await this.options.state.getOrCreateInstallationId();
    const session = await this.options.state.getInstallationSession();
    const workspaceId = input.workspaceId ?? (await this.options.state.getWorkspaceId());

    if (!session) {
      throw createReconnectRequiredError();
    }

    const event: UsageEventPayload = {
      installationId,
      ...(workspaceId ? { workspaceId } : {}),
      eventType: input.eventType,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      payload: input.payload,
    };

    try {
      return await sendUsageEvent({
        apiUrl: this.options.apiUrl,
        token: session.token,
        event,
        fetcher: this.options.fetcher,
      });
    } catch (error) {
      if (error instanceof PlatformRequestError && error.status === 401) {
        await this.options.state.clearInstallationSession();
      }

      throw error;
    }
  }

  async deriveUiState(input?: {
    backendUnavailable?: boolean;
    authInvalid?: boolean;
    bootstrap?: ExtensionBootstrapPayloadV2 | null;
  }): Promise<PlatformUiState> {
    const session = await this.options.state.getInstallationSession();
    const cache = await this.options.state.getBootstrapCache();
    const bootstrap = input?.bootstrap ?? cache?.payload;

    return derivePlatformUiState({
      bootstrap,
      installationTokenExpiresAt: session?.expiresAt,
      authInvalid: input?.authInvalid,
      backendUnavailable: input?.backendUnavailable,
    });
  }

  scheduleBootstrapRefresh(input: {
    bootstrap: ExtensionBootstrapPayloadV2;
    onRefresh: () => void | Promise<void>;
    earlyRefreshSeconds?: number;
    minDelayMs?: number;
    nowMs?: number;
    setTimer?: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
    clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  }): {
    delayMs: number;
    cancel: () => void;
  } {
    const delayMs = resolveBootstrapRefreshDelayMs({
      bootstrap: input.bootstrap,
      nowMs: input.nowMs,
      earlyRefreshSeconds: input.earlyRefreshSeconds,
      minDelayMs: input.minDelayMs,
    });
    const setTimer = input.setTimer ?? ((handler, timeoutMs) => setTimeout(handler, timeoutMs));
    const clearTimer = input.clearTimer ?? ((timer) => clearTimeout(timer));
    const timer = setTimer(() => {
      void input.onRefresh();
    }, delayMs);

    return {
      delayMs,
      cancel: () => clearTimer(timer),
    };
  }
}
