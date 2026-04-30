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
  type AiProxyContentBlock,
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
      key !== 'installationId',
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

type ExtensionMessageContent = string | AiProxyContentBlock[];

interface ExtensionAiRuntimeMessage {
  role?: string;
  content?: ExtensionMessageContent;
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

interface ExtensionInstallationSelfDisconnectRequest {
  installationId?: string;
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
  const isFree = entry.capabilityTags.includes('free');

  return {
    id: entry.modelId,
    name: entry.displayName,
    type: hasVision ? 'image' : 'chat',
    short_description: `${entry.displayName} (${entry.provider})`,
    provider: entry.provider,
    availability: entry.availability,
    supportsVision: hasVision,
    isFree,
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

function normalizeExtensionMessage(entry: unknown, index: number): AiProxyRequest['messages'][number] {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new BadRequestException(`messages[${index}] must be an object.`);
  }

  const msg = entry as ExtensionAiRuntimeMessage;
  const role = typeof msg.role === 'string' ? msg.role.trim() : 'user';
  const supportedRoles = new Set(['system', 'user', 'assistant', 'tool']);

  if (!supportedRoles.has(role)) {
    throw new BadRequestException(
      `messages[${index}].role must be one of "system", "user", "assistant", or "tool".`,
    );
  }

  const content = msg.content;

  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException(`messages[${index}].content is required.`);
    return { role: role as AiProxyRequest['messages'][number]['role'], content: trimmed };
  }

  if (Array.isArray(content)) {
    if (content.length === 0) throw new BadRequestException(`messages[${index}].content array must not be empty.`);
    return {
      role: role as AiProxyRequest['messages'][number]['role'],
      content: content as AiProxyContentBlock[],
    };
  }

  throw new BadRequestException(`messages[${index}].content must be a string or array of content blocks.`);
}

function normalizeExtensionAiRequest(
  request: ExtensionAiRuntimeRequest | undefined,
): Partial<AiProxyRequest> {
  if (!Array.isArray(request?.messages) || request?.messages.length === 0) {
    throw new BadRequestException('messages must contain at least one item.');
  }

  const model = readString(request?.model) ?? undefined;

  if (!model) {
    throw new BadRequestException(
      'Extension AI request is missing a required model ID. The extension must send an explicit model for every request.',
    );
  }

  const provider = readString(request?.provider) as AiProvider | null;
  const useOwnKey = readOptionalBoolean(request?.useOwnKey) ?? readOptionalBoolean(request?.options?.useOwnKey);
  const temperature = readFiniteNumber(request?.options?.temperature ?? request?.temperature);
  const maxTokens = readPositiveInteger(
    request?.options?.max_tokens ?? request?.options?.maxTokens ?? request?.maxTokens,
  );
  const messages = request.messages.map((entry, index) => normalizeExtensionMessage(entry, index));

  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    messages,
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

  @Post('extension/installations/self-disconnect')
  async selfDisconnectInstallation(
    @Body() request?: ExtensionInstallationSelfDisconnectRequest,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.extensionControlService.selfDisconnectInstallationForCurrentSession(
        await this.requireConnectedSession(authorization),
        request,
      ),
    );
  }

  @Patch('extension/installations/:installationId/label')
  async updateInstallationLabel(
    @Param('installationId') installationId: string,
    @Body() request?: Partial<ExtensionInstallationLabelUpdateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.extensionControlService.updateInstallationLabelForCurrentSession(
        await this.requireConnectedSession(authorization),
        installationId,
        request?.deviceLabel,
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

  @Post('extension/session/refresh')
  async refreshInstallationSession(
    @Headers('authorization') authorization?: string,
  ) {
    return this.handleRefreshInstallationSession(authorization, '/extension/session/refresh');
  }

  @Post('extension/installations/session/refresh')
  async refreshInstallationSessionAlias(
    @Headers('authorization') authorization?: string,
  ) {
    return this.handleRefreshInstallationSession(authorization, '/extension/installations/session/refresh');
  }

  @Post('extension/bootstrap/v2')
  async bootstrapV2(
    @Body() request?: Partial<ExtensionBootstrapRequestV2>,
    @Headers('authorization') authorization?: string,
  ) {
    const installationSession = await this.requireInstallationSession(authorization, '/extension/bootstrap/v2');

    return ok(await this.extensionControlService.bootstrapInstallationSession(installationSession, request));
  }

  @Post('extension/usage-events/v2')
  async ingestUsageEventV2(
    @Body() eventEnvelope?: Partial<UsageEventPayload> & { events?: unknown[] },
    @Headers('authorization') authorization?: string,
  ) {
    const installationSession = await this.requireInstallationSession(authorization, '/extension/usage-events/v2');
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
    return ok(await this.proxyExtensionAiRuntime(request, authorization, '/extension/ai/answer'));
  }

  @Post('extension/ai/chat')
  async chatV2(
    @Body() request?: ExtensionAiRuntimeRequest,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.proxyExtensionAiRuntime(request, authorization, '/extension/ai/chat'));
  }

  @Post('extension/ai/screenshot')
  async screenshotV2(
    @Body() request?: ExtensionAiRuntimeRequest,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.proxyExtensionAiRuntime(request, authorization, '/extension/ai/screenshot'));
  }

  @Post('extension/ai/multicheck')
  async multicheckV2(
    @Body() request?: ExtensionAiRuntimeRequest,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.proxyExtensionAiRuntime(request, authorization, '/extension/ai/multicheck'));
  }

  @Get('extension/ai/models')
  async listExtensionModels(
    @Query('type') type?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const installationSession = await this.requireInstallationSession(authorization, '/extension/ai/models');

    try {
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
        userId: installationSession.installation.userId,
        input: {
          type,
        },
        error,
      });
      throw error;
    }
  }

  private async handleRefreshInstallationSession(authorization: string | undefined, endpoint: string) {
    const installationSession = await this.requireInstallationSession(authorization, endpoint);

    return ok(await this.extensionControlService.refreshInstallationSessionForToken(installationSession));
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

  private async requireInstallationSession(authorization: string | undefined, endpoint: string) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing installation bearer token.');
    }

    return this.extensionControlService.resolveInstallationSession(accessToken, { endpoint });
  }

  private async proxyExtensionAiRuntime(
    request: ExtensionAiRuntimeRequest | undefined,
    authorization: string | undefined,
    endpoint: string,
  ) {
    const installationSession = await this.requireInstallationSession(authorization, endpoint);

    try {
      const session = buildInstallationRuntimeSession(installationSession);
      const normalizedRequest = normalizeExtensionAiRequest(request);
      const proxyResult = await this.aiProxyService.proxyForCurrentSession(session, normalizedRequest);

      this.logExtensionAiRequest({
        installationId: installationSession.installation.installationId,
        userId: installationSession.installation.userId,
        requestedModel: request?.model,
        resolvedModel: proxyResult.model,
        provider: proxyResult.provider,
        messageCount: Array.isArray(request?.messages) ? request.messages.length : 0,
      });

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
        userId: installationSession.installation.userId,
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

  private logExtensionAiRequest(input: {
    installationId: string;
    userId: string;
    requestedModel: string | undefined;
    resolvedModel: string;
    provider: string;
    messageCount: number;
  }): void {
    console.info(
      JSON.stringify({
        eventType: 'extension.ai_request_ok',
        installationId: input.installationId,
        userId: input.userId,
        requestedModel: input.requestedModel ?? null,
        resolvedModel: input.resolvedModel,
        provider: input.provider,
        modelWasMissing: !input.requestedModel,
        messageCount: input.messageCount,
        occurredAt: new Date().toISOString(),
      }),
    );
  }

  private logExtensionAiFailure(input: {
    action: 'models' | 'proxy';
    installationId: string;
    userId: string;
    input?: Record<string, unknown>;
    error: unknown;
  }): void {
    const status = input.error instanceof HttpException ? input.error.getStatus() : undefined;
    const message =
      input.error instanceof Error
        ? input.error.message.trim().slice(0, 512)
        : 'Unknown extension AI error.';
    const rawModel =
      input.action === 'proxy' && typeof input.input?.model === 'string'
        ? input.input.model.trim()
        : null;

    console.warn(
      JSON.stringify({
        eventType: input.action === 'models' ? 'extension.ai_models_failed' : 'extension.ai_request_failed',
        action: input.action,
        installationId: input.installationId,
        userId: input.userId,
        ...(input.input ? { input: input.input } : {}),
        ...(input.action === 'proxy' ? { modelWasMissing: !rawModel } : {}),
        errorMessage: message,
        ...(typeof status === 'number' ? { status } : {}),
        occurredAt: new Date().toISOString(),
      }),
    );

    void this.extensionControlService.recordAiFailureSafely({
      installationId: input.installationId,
      userId: input.userId,
      action: input.action,
      requestData: input.input,
      error: input.error,
    });
  }
}
