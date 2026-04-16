import {
  type CompatibilityHandshake,
  type ExtensionBootstrapPayloadV2,
  type ExtensionInstallationBindResult,
  type ExtensionInstallationTokenSession,
  type UsageEventIngestResult,
  type UsageEventPayload,
  type UsageEventSeverity,
} from '@quizmind/contracts';

import { connectToPlatform, redeemBindFallbackCode as redeemBindFallbackCodeRequest } from './platform-auth';
import {
  PlatformRequestError,
  refreshBootstrap,
  refreshInstallationSession as refreshInstallationSessionRequest,
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

function isSessionExpired(expiresAt: string | undefined, nowMs = Date.now()): boolean {
  if (!expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);

  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }

  return expiresAtMs <= nowMs;
}

function createReconnectRequiredError(reason: 'missing' | 'expired' = 'missing'): PlatformRequestError {
  return new PlatformRequestError(
    reason === 'expired'
      ? 'Installation session expired. Reconnect required.'
      : 'Installation session is missing. Reconnect required.',
    401,
    false,
  );
}

export class PlatformRuntimeClient {
  constructor(private readonly options: PlatformRuntimeOptions) {}

  private async resolveSessionState(): Promise<{
    session?: ExtensionInstallationTokenSession;
    expired: boolean;
  }> {
    const session = await this.options.state.getInstallationSession();

    if (!session) {
      return {
        expired: false,
      };
    }

    if (!isSessionExpired(session.expiresAt)) {
      return {
        session,
        expired: false,
      };
    }

    await this.options.state.clearInstallationSession();

    return {
      expired: true,
    };
  }

  private async hasBufferedReconnectRequestedLifecycleEvent(): Promise<boolean> {
    const bufferedEvents = await this.options.state.getBufferedEvents();

    return bufferedEvents.some(
      (event) => event.eventType === 'extension.installation_reconnect_requested',
    );
  }

  private async bufferLifecycleEvent(input: {
    eventType: string;
    payload: Record<string, unknown>;
    occurredAt?: string;
  }): Promise<void> {
    const installationId = await this.options.state.getOrCreateInstallationId();

    await this.options.state.appendBufferedEvent({
      installationId,
      eventType: input.eventType,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      payload: input.payload,
    });
  }

  private async bufferReconnectRequestedLifecycleEvent(input: {
    reason: string;
    message?: string;
    status?: number;
    sourceEventType?: string;
    occurredAt?: string;
    skipIfAlreadyBuffered?: boolean;
  }): Promise<void> {
    if (
      input.skipIfAlreadyBuffered !== false &&
      (await this.hasBufferedReconnectRequestedLifecycleEvent())
    ) {
      return;
    }

    await this.bufferLifecycleEvent({
      eventType: 'extension.installation_reconnect_requested',
      occurredAt: input.occurredAt,
      payload: {
        reason: input.reason,
        ...(input.message ? { message: input.message } : {}),
        ...(typeof input.status === 'number' ? { status: input.status } : {}),
        ...(input.sourceEventType ? { sourceEventType: input.sourceEventType } : {}),
      },
    });
  }

  async connectToPlatform(input?: {
    requestId?: string;
    bridgeNonce?: string;
    flushBufferedEventsOnConnect?: boolean;
  }): Promise<ExtensionInstallationBindResult> {
    const { session: previousSession } = await this.resolveSessionState();
    const bootstrapCache = await this.options.state.getBootstrapCache();
    const bufferedEvents = await this.options.state.getBufferedEvents();
    const hasReconnectRequestBuffered = bufferedEvents.some(
      (event) => event.eventType === 'extension.installation_reconnect_requested',
    );
    const shouldEmitReconnectedEvent = !previousSession && (Boolean(bootstrapCache?.payload) || hasReconnectRequestBuffered);
    const result = await connectToPlatform({
      siteUrl: this.options.siteUrl,
      environment: this.options.environment,
      handshake: this.options.handshake,
      targetOrigin: this.options.targetOrigin,
      state: this.options.state,
      openBridge: this.options.openBridge,
      fetcher: this.options.fetcher,
      ...(input?.requestId ? { requestId: input.requestId } : {}),
      ...(input?.bridgeNonce ? { bridgeNonce: input.bridgeNonce } : {}),
    });

    if (shouldEmitReconnectedEvent) {
      await this.sendReconnectedEvent({
        extra: {
          source: 'connect_to_platform',
        },
      }).catch(() => undefined);
    }

    if (input?.flushBufferedEventsOnConnect !== false) {
      await this.flushBufferedEventsFromState().catch(() => undefined);
    }

    return result;
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

  async refreshInstallationSession(): Promise<ExtensionInstallationTokenSession> {
    const { session, expired } = await this.resolveSessionState();

    if (!session) {
      throw createReconnectRequiredError(expired ? 'expired' : 'missing');
    }

    try {
      return await refreshInstallationSessionRequest({
        apiUrl: this.options.apiUrl,
        token: session.token,
        state: this.options.state,
        fetcher: this.options.fetcher,
      });
    } catch (error) {
      if (error instanceof PlatformRequestError && error.status === 401) {
        await this.options.state.clearInstallationSession();
      }

      throw error;
    }
  }

  async refreshBootstrap(input?: {
    allowCacheFallback?: boolean;
    bufferLifecycleTelemetryOnFailure?: boolean;
  }): Promise<PlatformBootstrapRefreshResult> {
    const allowCacheFallback = input?.allowCacheFallback !== false;
    const bufferLifecycleTelemetryOnFailure = input?.bufferLifecycleTelemetryOnFailure !== false;
    const installationId = await this.options.state.getOrCreateInstallationId();
    const { session, expired } = await this.resolveSessionState();
    const cache = await this.options.state.getBootstrapCache();

    if (!session) {
      if (bufferLifecycleTelemetryOnFailure) {
        await this.bufferReconnectRequestedLifecycleEvent({
          reason: expired ? 'installation_session_expired' : 'installation_session_missing',
          message: expired
            ? 'Installation session expired. Reconnect required.'
            : 'Installation session is missing. Reconnect required.',
        }).catch(() => undefined);
      }

      if (allowCacheFallback && cache?.payload) {
        return {
          bootstrap: cache.payload,
          source: 'cache',
          reconnectRequired: true,
          backendUnavailable: false,
        };
      }

      throw createReconnectRequiredError(expired ? 'expired' : 'missing');
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

      if (bufferLifecycleTelemetryOnFailure) {
        const occurredAt = new Date().toISOString();

        await this.bufferLifecycleEvent({
          eventType: 'extension.bootstrap_refresh_failed',
          occurredAt,
          payload: {
            message: error.message,
            status: error.status,
            retryable: error.retryable,
          },
        }).catch(() => undefined);

        if (error.status === 401) {
          await this.bufferReconnectRequestedLifecycleEvent({
            occurredAt,
            reason: 'installation_session_invalid',
            message: error.message,
            status: error.status,
          }).catch(() => undefined);
        }
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
    bufferOnFailure?: boolean;
  }): Promise<UsageEventIngestResult> {
    const installationId = await this.options.state.getOrCreateInstallationId();
    const { session, expired } = await this.resolveSessionState();
    const shouldBuffer = input.bufferOnFailure !== false;
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const event: UsageEventPayload = {
      installationId,
      eventType: input.eventType,
      occurredAt,
      payload: input.payload,
    };

    if (!session) {
      if (shouldBuffer) {
        await this.options.state.appendBufferedEvent(event);
        await this.bufferReconnectRequestedLifecycleEvent({
          occurredAt,
          reason: expired ? 'installation_session_expired' : 'installation_session_missing',
          message: expired
            ? 'Installation session expired. Reconnect required.'
            : 'Installation session is missing. Reconnect required.',
          sourceEventType: event.eventType,
        }).catch(() => undefined);
      }

      throw createReconnectRequiredError(expired ? 'expired' : 'missing');
    }

    try {
      return await sendUsageEventRequest({
        apiUrl: this.options.apiUrl,
        token: session.token,
        event,
        fetcher: this.options.fetcher,
      });
    } catch (error) {
      if (error instanceof PlatformRequestError) {
        if (error.status === 401) {
          await this.options.state.clearInstallationSession();
        }

        if (shouldBuffer && (error.retryable || error.status === 401)) {
          await this.options.state.appendBufferedEvent(event);
        }

        if (shouldBuffer && error.status === 401) {
          await this.bufferReconnectRequestedLifecycleEvent({
            occurredAt: event.occurredAt,
            reason: 'installation_session_invalid',
            message: error.message,
            status: error.status,
            sourceEventType: event.eventType,
          }).catch(() => undefined);
        }

        throw error;
      }

      if (shouldBuffer) {
        await this.options.state.appendBufferedEvent(event);
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
    bufferOnFailure?: boolean;
  }): Promise<UsageEventIngestResult> {
    const installationId = await this.options.state.getOrCreateInstallationId();
    const { session, expired } = await this.resolveSessionState();
    const shouldBuffer = input.bufferOnFailure !== false;
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const event: UsageEventPayload = {
      installationId,
      eventType: 'extension.runtime_error',
      occurredAt,
      payload: {
        surface: input.surface,
        message: input.message,
        ...(input.stackPreview ? { stackPreview: input.stackPreview } : {}),
        ...(input.feature ? { feature: input.feature } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.extra ?? {}),
      },
    };

    if (!session) {
      if (shouldBuffer) {
        await this.options.state.appendBufferedEvent(event);
        await this.bufferReconnectRequestedLifecycleEvent({
          occurredAt,
          reason: expired ? 'installation_session_expired' : 'installation_session_missing',
          message: expired
            ? 'Installation session expired. Reconnect required.'
            : 'Installation session is missing. Reconnect required.',
          sourceEventType: event.eventType,
        }).catch(() => undefined);
      }

      throw createReconnectRequiredError(expired ? 'expired' : 'missing');
    }

    try {
      return await sendRuntimeErrorRequest({
        apiUrl: this.options.apiUrl,
        token: session.token,
        installationId,
        surface: input.surface,
        message: input.message,
        ...(input.stackPreview ? { stackPreview: input.stackPreview } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.feature ? { feature: input.feature } : {}),
        occurredAt,
        ...(input.extra ? { extra: input.extra } : {}),
        fetcher: this.options.fetcher,
      });
    } catch (error) {
      if (error instanceof PlatformRequestError) {
        if (error.status === 401) {
          await this.options.state.clearInstallationSession();
        }

        if (shouldBuffer && (error.retryable || error.status === 401)) {
          await this.options.state.appendBufferedEvent(event);
        }

        if (shouldBuffer && error.status === 401) {
          await this.bufferReconnectRequestedLifecycleEvent({
            occurredAt: event.occurredAt,
            reason: 'installation_session_invalid',
            message: error.message,
            status: error.status,
            sourceEventType: event.eventType,
          }).catch(() => undefined);
        }

        throw error;
      }

      if (shouldBuffer) {
        await this.options.state.appendBufferedEvent(event);
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
    const { session, expired } = await this.resolveSessionState();

    if (!session) {
      throw createReconnectRequiredError(expired ? 'expired' : 'missing');
    }

    return flushBufferedEventsRequest({
      apiUrl: this.options.apiUrl,
      token: session.token,
      events: input.events,
      fetcher: this.options.fetcher,
    });
  }

  async flushBufferedEventsFromState(): Promise<{
    delivered: Array<{
      event: UsageEventPayload;
      result: UsageEventIngestResult;
    }>;
    remaining: UsageEventPayload[];
  }> {
    const events = await this.options.state.getBufferedEvents();

    if (events.length === 0) {
      return {
        delivered: [],
        remaining: [],
      };
    }

    const flushed = await this.flushBufferedEvents({ events });

    await this.options.state.setBufferedEvents(flushed.remaining);

    return flushed;
  }

  async sendBootstrapRefreshFailedEvent(input: {
    message: string;
    status?: number;
    retryable?: boolean;
    occurredAt?: string;
    extra?: Record<string, unknown>;
  }): Promise<UsageEventIngestResult> {
    return this.sendUsageEvent({
      eventType: 'extension.bootstrap_refresh_failed',
      occurredAt: input.occurredAt,
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
    extra?: Record<string, unknown>;
  }): Promise<UsageEventIngestResult> {
    return this.sendUsageEvent({
      eventType: 'extension.installation_reconnect_requested',
      occurredAt: input?.occurredAt,
      payload: {
        ...(input?.reason ? { reason: input.reason } : {}),
        ...(input?.extra ?? {}),
      },
    });
  }

  async sendReconnectedEvent(input?: {
    occurredAt?: string;
    extra?: Record<string, unknown>;
  }): Promise<UsageEventIngestResult> {
    return this.sendUsageEvent({
      eventType: 'extension.installation_reconnected',
      occurredAt: input?.occurredAt,
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
