import {
  type CompatibilityHandshake,
  type ExtensionBootstrapPayloadV2,
  type ExtensionInstallationBindResult,
  type UsageEventIngestResult,
  type UsageEventPayload,
  type UsageEventSeverity,
} from '@quizmind/contracts';

import { connectToPlatform, redeemBindFallbackCode as redeemBindFallbackCodeRequest } from './platform-auth';
import {
  PlatformRequestError,
  refreshBootstrap,
  resolveBootstrapRefreshDelayMs,
} from './platform-bootstrap';
import { type PlatformStateManager } from './platform-state';
import {
  flushBufferedEvents as flushBufferedEventsRequest,
  sendRuntimeError as sendRuntimeErrorRequest,
  sendUsageEvent as sendUsageEventRequest,
} from './platform-telemetry';
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
      fetcher: this.options.fetcher,
      ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input?.requestId ? { requestId: input.requestId } : {}),
      ...(input?.bridgeNonce ? { bridgeNonce: input.bridgeNonce } : {}),
    });
  }

  async redeemBindFallbackCode(input: {
    fallbackCode: string;
    requestId?: string;
    bridgeNonce?: string;
    redeemPath?: string;
    installationId?: string;
  }): Promise<ExtensionInstallationBindResult> {
    const installationId = input.installationId ?? (await this.options.state.getOrCreateInstallationId());
    const result = await redeemBindFallbackCodeRequest({
      siteUrl: this.options.siteUrl,
      fallbackCode: input.fallbackCode,
      installationId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.bridgeNonce ? { bridgeNonce: input.bridgeNonce } : {}),
      ...(input.redeemPath ? { redeemPath: input.redeemPath } : {}),
      fetcher: this.options.fetcher,
    });

    await this.options.state.saveBindResult(result);

    return result;
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
      return await sendUsageEventRequest({
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

  async sendRuntimeError(input: {
    surface: string;
    message: string;
    stackPreview?: string;
    severity?: UsageEventSeverity;
    feature?: string;
    occurredAt?: string;
    extra?: Record<string, unknown>;
    workspaceId?: string;
  }): Promise<UsageEventIngestResult> {
    const installationId = await this.options.state.getOrCreateInstallationId();
    const session = await this.options.state.getInstallationSession();
    const workspaceId = input.workspaceId ?? (await this.options.state.getWorkspaceId());

    if (!session) {
      throw createReconnectRequiredError();
    }

    try {
      return await sendRuntimeErrorRequest({
        apiUrl: this.options.apiUrl,
        token: session.token,
        installationId,
        ...(workspaceId ? { workspaceId } : {}),
        surface: input.surface,
        message: input.message,
        ...(input.stackPreview ? { stackPreview: input.stackPreview } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.feature ? { feature: input.feature } : {}),
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        ...(input.extra ? { extra: input.extra } : {}),
        fetcher: this.options.fetcher,
      });
    } catch (error) {
      if (error instanceof PlatformRequestError && error.status === 401) {
        await this.options.state.clearInstallationSession();
      }

      throw error;
    }
  }

  async flushBufferedEvents(input: {
    events: UsageEventPayload[];
  }): Promise<{
    delivered: Array<{
      event: UsageEventPayload;
      result: UsageEventIngestResult;
    }>;
    remaining: UsageEventPayload[];
  }> {
    const session = await this.options.state.getInstallationSession();

    if (!session) {
      throw createReconnectRequiredError();
    }

    return flushBufferedEventsRequest({
      apiUrl: this.options.apiUrl,
      token: session.token,
      events: input.events,
      fetcher: this.options.fetcher,
    });
  }

  async sendBootstrapRefreshFailedEvent(input: {
    message: string;
    status?: number;
    retryable?: boolean;
    occurredAt?: string;
    workspaceId?: string;
    extra?: Record<string, unknown>;
  }): Promise<UsageEventIngestResult> {
    return this.sendUsageEvent({
      eventType: 'extension.bootstrap_refresh_failed',
      occurredAt: input.occurredAt,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      payload: {
        message: input.message,
        ...(typeof input.status === 'number' ? { status: input.status } : {}),
        ...(typeof input.retryable === 'boolean' ? { retryable: input.retryable } : {}),
        ...(input.extra ?? {}),
      },
    });
  }

  async sendReconnectRequestedEvent(input?: {
    reason?: string;
    occurredAt?: string;
    workspaceId?: string;
    extra?: Record<string, unknown>;
  }): Promise<UsageEventIngestResult> {
    return this.sendUsageEvent({
      eventType: 'extension.installation_reconnect_requested',
      occurredAt: input?.occurredAt,
      ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
      payload: {
        ...(input?.reason ? { reason: input.reason } : {}),
        ...(input?.extra ?? {}),
      },
    });
  }

  async sendReconnectedEvent(input?: {
    occurredAt?: string;
    workspaceId?: string;
    extra?: Record<string, unknown>;
  }): Promise<UsageEventIngestResult> {
    return this.sendUsageEvent({
      eventType: 'extension.installation_reconnected',
      occurredAt: input?.occurredAt,
      ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
      payload: {
        ...(input?.extra ?? {}),
      },
    });
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
