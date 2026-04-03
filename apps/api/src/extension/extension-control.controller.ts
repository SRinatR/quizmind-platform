import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import {
  type AiProvider,
  type AiProxyRequest,
  type ApiSuccess,
  type ExtensionBootstrapRequestV2,
  type ExtensionInstallationDisconnectRequest,
  type ExtensionInstallationBindRequest,
  type ExtensionInstallationRotateSessionRequest,
  type ProviderModelCatalogEntry,
  type UsageEventPayload,
} from '@quizmind/contracts';

import { AuthService } from '../auth/auth.service';
import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { AiProxyService } from '../ai/ai-proxy.service';
import { ExtensionControlService } from './extension-control.service';

function ok<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOccurredAt(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  return new Date().toISOString();
}

function normalizeIncomingUsageEvent(rawEvent: unknown): Partial<UsageEventPayload> {
  if (!isRecord(rawEvent)) {
    return {};
  }

  const eventType = readString(rawEvent.eventType) ?? readString(rawEvent.event) ?? undefined;
  const payloadFromEnvelope = isRecord(rawEvent.payload) ? rawEvent.payload : {};
  const metaPayloadEntries = Object.entries(rawEvent).filter(
    ([key]) =>
      key !== 'event' &&
      key !== 'eventType' &&
      key !== 'occurredAt' &&
      key !== 'ts' &&
      key !== 'timestamp' &&
      key !== 'payload' &&
      key !== 'installationId' &&
      key !== 'workspaceId',
  );
  const payloadFromEnvelopeMeta = Object.fromEntries(metaPayloadEntries);
  const payload = {
    ...payloadFromEnvelopeMeta,
    ...payloadFromEnvelope,
  };

  return {
    ...(eventType ? { eventType } : {}),
    occurredAt: normalizeOccurredAt(rawEvent.occurredAt ?? rawEvent.ts ?? rawEvent.timestamp),
    ...(Object.keys(payload).length > 0 ? { payload } : {}),
  };
}

interface ExtensionAiRuntimeRequest {
  provider?: string;
  model?: string;
  messages?: unknown;
  useOwnKey?: boolean;
  options?: {
    useOwnKey?: boolean;
    temperature?: number;
    max_tokens?: number;
    maxTokens?: number;
  };
  temperature?: number;
  maxTokens?: number;
}

type InstallationSessionSnapshot = Awaited<ReturnType<ExtensionControlService['resolveInstallationSession']>>;

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value !== 'boolean') {
    return undefined;
  }

  return value;
}

function mapProviderModelToExtensionShape(entry: ProviderModelCatalogEntry) {
  const hasVision = entry.capabilityTags.includes('vision') || entry.capabilityTags.includes('image');
  const hasText = entry.capabilityTags.includes('text');

  return {
    id: entry.modelId,
    name: entry.displayName,
    type: hasVision ? 'image' : 'chat',
    short_description: `${entry.displayName} (${entry.provider})`,
    provider: entry.provider,
    availability: entry.availability,
    architecture: hasVision
      ? {
          modality: hasText ? 'image+text->text' : 'image->text',
          input_modalities: hasText ? ['text', 'image'] : ['image'],
          output_modalities: ['text'],
        }
      : {
          modality: 'text->text',
          input_modalities: ['text'],
          output_modalities: ['text'],
        },
  };
}

function buildInstallationRuntimeSession(
  installationSession: InstallationSessionSnapshot,
): CurrentSessionSnapshot {
  return {
    personaKey: 'extension-installation',
    personaLabel: 'Extension Installation',
    notes: ['installation-session'],
    user: {
      id: installationSession.installation.userId,
      email: `installation+${installationSession.installation.userId}@quizmind.local`,
    },
    principal: {
      userId: installationSession.installation.userId,
      email: `installation+${installationSession.installation.userId}@quizmind.local`,
      systemRoles: [],
      entitlements: [],
      featureFlags: [],
    },
    permissions: [],
  };
}

function normalizeExtensionAiRequest(
  request: ExtensionAiRuntimeRequest | undefined,
  workspaceId: string,
): Partial<AiProxyRequest> {
  const model = readString(request?.model);

  if (!model) {
    throw new BadRequestException('model is required.');
  }

  if (!Array.isArray(request?.messages) || request?.messages.length === 0) {
    throw new BadRequestException('messages must contain at least one item.');
  }

  const provider = readString(request?.provider) as AiProvider | null;
  const useOwnKey = readOptionalBoolean(request?.useOwnKey) ?? readOptionalBoolean(request?.options?.useOwnKey);
  const temperature = readFiniteNumber(request?.options?.temperature ?? request?.temperature);
  const maxTokens = readPositiveInteger(
    request?.options?.max_tokens ?? request?.options?.maxTokens ?? request?.maxTokens,
  );

  return {
    workspaceId,
    ...(provider ? { provider } : {}),
    model,
    messages: request.messages as AiProxyRequest['messages'],
    ...(typeof useOwnKey === 'boolean' ? { useOwnKey } : {}),
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
    stream: false,
  };
}

@Controller()
export class ExtensionControlController {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(ExtensionControlService)
    private readonly extensionControlService: ExtensionControlService,
    @Inject(AiProxyService)
    private readonly aiProxyService: AiProxyService,
  ) {}

  @Post('extension/installations/bind')
  async bindInstallation(
    @Body() request?: Partial<ExtensionInstallationBindRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.extensionControlService.bindInstallationForCurrentSession(
        await this.requireConnectedSession(authorization),
        request,
      ),
    );
  }

  @Get('extension/installations')
  async listInstallations(
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.extensionControlService.listInstallationsForCurrentSession(
        await this.requireConnectedSession(authorization),
      ),
    );
  }

  @Post('extension/installations/disconnect')
  async disconnectInstallation(
    @Body() request?: Partial<ExtensionInstallationDisconnectRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.extensionControlService.disconnectInstallationForCurrentSession(
        await this.requireConnectedSession(authorization),
        request,
      ),
    );
  }

  @Post('extension/installations/rotate-session')
  async rotateInstallationSession(
    @Body() request?: Partial<ExtensionInstallationRotateSessionRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.extensionControlService.rotateInstallationSessionForCurrentSession(
        await this.requireConnectedSession(authorization),
        request,
      ),
    );
  }

  @Post('extension/bootstrap/v2')
  async bootstrapV2(
    @Body() request?: Partial<ExtensionBootstrapRequestV2>,
    @Headers('authorization') authorization?: string,
  ) {
    const installationSession = await this.requireInstallationSession(authorization);

    return ok(await this.extensionControlService.bootstrapInstallationSession(installationSession, request));
  }

  @Post('extension/usage-events/v2')
  async ingestUsageEventV2(
    @Body() eventEnvelope?: Partial<UsageEventPayload> & { events?: unknown[] },
    @Headers('authorization') authorization?: string,
  ) {
    const installationSession = await this.requireInstallationSession(authorization);
    const rawEvents = Array.isArray(eventEnvelope?.events) ? eventEnvelope.events : [eventEnvelope];
    const normalizedEvents = rawEvents.map((rawEvent) => normalizeIncomingUsageEvent(rawEvent));

    const results = await Promise.all(
      normalizedEvents.map((normalizedEvent) =>
        this.extensionControlService.ingestUsageEventForInstallationSession(installationSession, normalizedEvent),
      ),
    );

    if (results.length === 1) {
      return ok(results[0]);
    }

    return ok({
      queued: true,
      count: results.length,
      items: results.map((result) => ({
        queue: result.queue,
        job: result.job,
        handler: result.handler,
        logEvent: result.logEvent,
      })),
    });
  }

  @Post('extension/ai/answer')
  async answerV2(
    @Body() request?: ExtensionAiRuntimeRequest,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.proxyExtensionAiRuntime(request, authorization));
  }

  @Post('extension/ai/chat')
  async chatV2(
    @Body() request?: ExtensionAiRuntimeRequest,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.proxyExtensionAiRuntime(request, authorization));
  }

  @Post('extension/ai/screenshot')
  async screenshotV2(
    @Body() request?: ExtensionAiRuntimeRequest,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.proxyExtensionAiRuntime(request, authorization));
  }

  @Post('extension/ai/multicheck')
  async multicheckV2(
    @Body() request?: ExtensionAiRuntimeRequest,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.proxyExtensionAiRuntime(request, authorization));
  }

  @Get('extension/ai/models')
  async listExtensionModels(
    @Query('type') type?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const installationSession = await this.requireInstallationSession(authorization);
    const workspaceId = installationSession.installation.workspaceId;

    try {
      if (!workspaceId) {
        throw new UnauthorizedException(
          'Installation is not bound to a workspace yet. Reconnect from extension settings.',
        );
      }

      const session = buildInstallationRuntimeSession(installationSession);
      const catalog = await this.aiProxyService.listModelsForCurrentSession(session);
      const typeFilter = (type ?? '').trim().toLowerCase();
      const filtered = catalog.models.filter((entry) => {
        if (typeFilter === 'image') {
          return entry.capabilityTags.includes('vision') || entry.capabilityTags.includes('image');
        }

        if (typeFilter === 'chat') {
          return entry.capabilityTags.includes('text');
        }

        return true;
      });

      return ok({
        models: filtered.map((entry) => mapProviderModelToExtensionShape(entry)),
      });
    } catch (error) {
      this.logExtensionAiFailure({
        action: 'models',
        installationId: installationSession.installation.installationId,
        workspaceId,
        input: {
          type,
        },
        error,
      });
      throw error;
    }
  }

  private async requireConnectedSession(authorization?: string): Promise<CurrentSessionSnapshot> {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Extension installation binding requires QUIZMIND_RUNTIME_MODE=connected.');
    }

    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return this.authService.getCurrentSession(accessToken);
  }

  private async requireInstallationSession(authorization?: string) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing installation bearer token.');
    }

    return this.extensionControlService.resolveInstallationSession(accessToken);
  }

  private async proxyExtensionAiRuntime(request: ExtensionAiRuntimeRequest | undefined, authorization?: string) {
    const installationSession = await this.requireInstallationSession(authorization);
    const workspaceId = installationSession.installation.workspaceId;

    try {
      if (!workspaceId) {
        throw new UnauthorizedException(
          'Installation is not bound to a workspace yet. Reconnect from extension settings.',
        );
      }

      const session = buildInstallationRuntimeSession(installationSession);
      const normalizedRequest = normalizeExtensionAiRequest(request, workspaceId);
      const proxyResult = await this.aiProxyService.proxyForCurrentSession(session, normalizedRequest);
      const upstreamResponse =
        proxyResult.response && typeof proxyResult.response === 'object'
          ? (proxyResult.response as Record<string, unknown>)
          : {};
      const choices = Array.isArray(upstreamResponse.choices) ? upstreamResponse.choices : [];
      const usage =
        upstreamResponse.usage && typeof upstreamResponse.usage === 'object'
          ? upstreamResponse.usage
          : proxyResult.usage;

      return {
        id:
          typeof upstreamResponse.id === 'string' && upstreamResponse.id.trim().length > 0
            ? upstreamResponse.id
            : proxyResult.requestId,
        model:
          typeof upstreamResponse.model === 'string' && upstreamResponse.model.trim().length > 0
            ? upstreamResponse.model
            : proxyResult.model,
        provider: proxyResult.provider,
        keySource: proxyResult.keySource,
        choices,
        ...(usage ? { usage } : {}),
        quota: proxyResult.quota,
      };
    } catch (error) {
      this.logExtensionAiFailure({
        action: 'proxy',
        installationId: installationSession.installation.installationId,
        workspaceId,
        input: {
          provider: request?.provider,
          model: request?.model,
          useOwnKey: request?.useOwnKey ?? request?.options?.useOwnKey,
          messageCount: Array.isArray(request?.messages) ? request?.messages.length : undefined,
        },
        error,
      });
      throw error;
    }
  }

  private logExtensionAiFailure(input: {
    action: 'models' | 'proxy';
    installationId: string;
    workspaceId?: string | null;
    input?: Record<string, unknown>;
    error: unknown;
  }): void {
    const status = input.error instanceof HttpException ? input.error.getStatus() : undefined;
    const message =
      input.error instanceof Error
        ? input.error.message.trim().slice(0, 512)
        : 'Unknown extension AI error.';

    console.warn(
      JSON.stringify({
        eventType: 'extension.ai_request_failed',
        action: input.action,
        installationId: input.installationId,
        workspaceId: input.workspaceId ?? null,
        ...(input.input ? { input: input.input } : {}),
        errorMessage: message,
        ...(typeof status === 'number' ? { status } : {}),
        occurredAt: new Date().toISOString(),
      }),
    );
  }
}
