import { randomUUID } from 'node:crypto';

import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import {
  type AiModelsCatalogPayload,
  type AiProxyQuotaSnapshot,
  type AiProxyRequest,
  type AiProxyResult,
  type AiProvider,
} from '@quizmind/contracts';
import { type Prisma } from '@quizmind/database';
import { getProviderCatalog, listAvailableModelsForPlan, providerRegistry } from '@quizmind/providers';
import { decryptSecret, type EncryptedSecretEnvelope } from '@quizmind/secrets';
import { addUtcDays, evaluateUsageDecision, startOfUtcDay } from '@quizmind/usage';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { AiProviderPolicyService } from '../providers/ai-provider-policy.service';
import {
  AiProxyRepository,
  type AiProxyCredentialRecord,
  type AiProxyQuotaCounterRecord,
} from './ai-proxy.repository';

const aiRequestsQuotaKey = 'limit.requests_per_day';
const supportedProxyProviders = new Set<AiProvider>(['openrouter', 'openai', 'polza']);
const knownProviders = new Set<AiProvider>(providerRegistry.map((provider) => provider.provider));
const supportedMessageRoles = new Set(['system', 'user', 'assistant', 'tool']);
const openAiApiUrl = 'https://api.openai.com/v1';

type OpenRouterResponsePayload = Record<string, unknown>;
type AiProxyUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

interface NormalizedProxyRequest {
  workspaceId?: string;
  provider?: AiProvider;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }>;
  useOwnKey?: boolean;
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
}

interface PreparedProxyInvocation {
  session: CurrentSessionSnapshot;
  request: NormalizedProxyRequest;
  workspaceId: string;
  provider: AiProvider;
  keySource: 'platform' | 'user';
  apiKey: string;
  requestId: string;
  occurredAt: Date;
  quotaLimit?: number;
  quotaCounter: AiProxyQuotaCounterRecord;
}

interface OpenRouterStreamInvocationResult {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  abort: () => void;
}

interface OpenRouterStreamInspection {
  usage?: AiProxyUsage;
  responseId?: string;
  model?: string;
}

interface WorkspaceAiCatalog {
  planCode: string;
  providers: AiModelsCatalogPayload['providers'];
  models: AiModelsCatalogPayload['models'];
  defaultProvider?: AiProvider;
  defaultModel?: string;
  allowedModelTags: string[];
}

interface KeyMaterialResolution {
  keySource: 'platform' | 'user';
  apiKey: string;
}

export interface AiProxyStreamCompletion {
  requestId: string;
  workspaceId: string;
  provider: AiProvider;
  model: string;
  keySource: 'platform' | 'user';
  usage?: AiProxyUsage;
  responseId?: string;
  quota: AiProxyQuotaSnapshot;
}

export interface AiProxyStreamResult {
  requestId: string;
  workspaceId: string;
  provider: AiProvider;
  model: string;
  keySource: 'platform' | 'user';
  contentType: string;
  stream: ReadableStream<Uint8Array>;
  completion: Promise<AiProxyStreamCompletion>;
  abort: () => void;
}

function readRequiredString(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new BadRequestException(`${fieldName} is required.`);
  }

  return normalized;
}

function normalizeMessages(value: unknown): Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('messages must contain at least one item.');
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new BadRequestException(`messages[${index}] must be an object.`);
    }

    const role = typeof entry.role === 'string' ? entry.role.trim() : '';

    if (!supportedMessageRoles.has(role)) {
      throw new BadRequestException(
        `messages[${index}].role must be one of "system", "user", "assistant", or "tool".`,
      );
    }

    const content = typeof entry.content === 'string' ? entry.content.trim() : '';

    if (!content) {
      throw new BadRequestException(`messages[${index}].content is required.`);
    }

    const name = typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim() : undefined;

    return {
      role: role as 'system' | 'user' | 'assistant' | 'tool',
      content,
      ...(name ? { name } : {}),
    };
  });
}

function readNumber(value: unknown, fieldName: string): number | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${fieldName} must be a finite number.`);
  }

  return value;
}

function readInteger(value: unknown, fieldName: string): number | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new BadRequestException(`${fieldName} must be a positive integer.`);
  }

  return value;
}

function readJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readEncryptedSecretEnvelope(value: Prisma.JsonValue): EncryptedSecretEnvelope {
  const parsed = readJsonObject(value);

  if (!parsed) {
    throw new ServiceUnavailableException('Stored provider credential is malformed.');
  }

  const algorithm = parsed.algorithm;
  const keyVersion = parsed.keyVersion;
  const ciphertext = parsed.ciphertext;
  const iv = parsed.iv;
  const authTag = parsed.authTag;

  if (
    algorithm !== 'aes-256-gcm' ||
    keyVersion !== 'v1' ||
    typeof ciphertext !== 'string' ||
    typeof iv !== 'string' ||
    typeof authTag !== 'string'
  ) {
    throw new ServiceUnavailableException('Stored provider credential envelope is invalid.');
  }

  return {
    algorithm,
    keyVersion,
    ciphertext,
    iv,
    authTag,
  };
}

function extractUsage(payload: OpenRouterResponsePayload): {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
} | undefined {
  const usage = payload.usage;

  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return undefined;
  }

  const usageRecord = usage as Record<string, unknown>;

  const promptTokens =
    typeof usageRecord.prompt_tokens === 'number' && Number.isFinite(usageRecord.prompt_tokens)
      ? usageRecord.prompt_tokens
      : undefined;
  const completionTokens =
    typeof usageRecord.completion_tokens === 'number' && Number.isFinite(usageRecord.completion_tokens)
      ? usageRecord.completion_tokens
      : undefined;
  const totalTokens =
    typeof usageRecord.total_tokens === 'number' && Number.isFinite(usageRecord.total_tokens)
      ? usageRecord.total_tokens
      : undefined;

  if (
    typeof promptTokens === 'undefined' &&
    typeof completionTokens === 'undefined' &&
    typeof totalTokens === 'undefined'
  ) {
    return undefined;
  }

  return {
    ...(typeof promptTokens === 'number' ? { promptTokens } : {}),
    ...(typeof completionTokens === 'number' ? { completionTokens } : {}),
    ...(typeof totalTokens === 'number' ? { totalTokens } : {}),
  };
}

function readResponseErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const error = payloadRecord.error;

  if (!error || typeof error !== 'object' || Array.isArray(error)) {
    return undefined;
  }

  const errorRecord = error as Record<string, unknown>;

  return typeof errorRecord.message === 'string' && errorRecord.message.trim().length > 0
    ? errorRecord.message.trim()
    : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function resolveProviderModelForUpstream(provider: AiProvider, model: string): string {
  const normalized = model.trim();

  if (provider === 'polza' && normalized.toLowerCase().startsWith('polza/')) {
    return normalized.slice('polza/'.length);
  }

  return normalized;
}

function modelSupportsVision(model: AiModelsCatalogPayload['models'][number]): boolean {
  return model.capabilityTags.some((tag) => tag === 'vision');
}

function createRequestAbortSignal(input: {
  timeoutMs: number;
  abortController?: AbortController;
}): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(input.timeoutMs);

  if (!input.abortController) {
    return timeoutSignal;
  }

  const abortSignalStatics = AbortSignal as typeof AbortSignal & {
    any?: (signals: AbortSignal[]) => AbortSignal;
  };

  if (typeof abortSignalStatics.any === 'function') {
    return abortSignalStatics.any([input.abortController.signal, timeoutSignal]);
  }

  const fallbackController = new AbortController();
  const abortFromSignal = (signal: AbortSignal) => {
    if (!fallbackController.signal.aborted) {
      fallbackController.abort(signal.reason);
    }
  };

  for (const signal of [input.abortController.signal, timeoutSignal]) {
    if (signal.aborted) {
      abortFromSignal(signal);
      break;
    }

    signal.addEventListener('abort', () => abortFromSignal(signal), { once: true });
  }

  return fallbackController.signal;
}

@Injectable()
export class AiProxyService {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(AiProviderPolicyService)
    private readonly aiProviderPolicyService: AiProviderPolicyService,
    @Inject(AiProxyRepository)
    private readonly aiProxyRepository: AiProxyRepository,
  ) {}

  async proxyForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<AiProxyRequest>,
  ): Promise<AiProxyResult> {
    let invocation: PreparedProxyInvocation;

    try {
      invocation = await this.prepareProxyInvocation(session, request);
    } catch (error) {
      this.logProxyPreflightFailure({
        surface: 'proxy',
        session,
        request,
        error,
      });
      throw error;
    }

    if (invocation.request.stream) {
      throw new BadRequestException('Use stream=true only when handling an SSE response transport.');
    }

    try {
      const upstreamResponse =
        invocation.provider === 'openrouter'
          ? await this.invokeOpenRouter({
              apiKey: invocation.apiKey,
              model: invocation.request.model,
              messages: invocation.request.messages,
              temperature: invocation.request.temperature,
              maxTokens: invocation.request.maxTokens,
            })
          : invocation.provider === 'openai'
            ? await this.invokeOpenAi({
                apiKey: invocation.apiKey,
                model: invocation.request.model,
                messages: invocation.request.messages,
                temperature: invocation.request.temperature,
                maxTokens: invocation.request.maxTokens,
              })
            : invocation.provider === 'polza'
              ? await this.invokePolza({
                  apiKey: invocation.apiKey,
                  model: invocation.request.model,
                  messages: invocation.request.messages,
                  temperature: invocation.request.temperature,
                  maxTokens: invocation.request.maxTokens,
                })
            : (() => {
                throw new BadRequestException(
                  `Provider "${invocation.provider}" proxy routing is not supported yet.`,
                );
              })();
      const usage = extractUsage(upstreamResponse);
      const quotaSnapshot = await this.recordProxyCompletion({
        invocation,
        usage,
        responseId: typeof upstreamResponse.id === 'string' ? upstreamResponse.id : undefined,
      });

      return {
        requestId: invocation.requestId,
        workspaceId: invocation.workspaceId,
        provider: invocation.provider,
        model: typeof upstreamResponse.model === 'string' ? upstreamResponse.model : invocation.request.model,
        keySource: invocation.keySource,
        ...(usage ? { usage } : {}),
        quota: quotaSnapshot,
        response: upstreamResponse,
      };
    } catch (error) {
      await this.recordProxyFailureSafely({
        invocation,
        status: 'error',
        errorCode: this.resolveProxyFailureCode(error),
        errorMessage: this.resolveProxyFailureMessage(error),
      });

      throw error;
    }
  }

  async listModelsForCurrentSession(
    session: CurrentSessionSnapshot,
    workspaceId?: string,
  ): Promise<AiModelsCatalogPayload> {
    try {
      const workspace = this.resolveWorkspace(session, workspaceId?.trim() || undefined);
      const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace(workspace.id);
      const catalog = await this.resolveWorkspaceCatalog(workspace.id, policy);

      if (catalog.providers.length === 0 || catalog.models.length === 0) {
        console.warn(
          JSON.stringify({
            eventType: 'ai_proxy.models_catalog_empty',
            occurredAt: new Date().toISOString(),
            userId: session.user.id,
            workspaceId: workspace.id,
            planCode: catalog.planCode,
            policyMode: policy.mode,
            policyProviders: policy.providers,
            allowedModelTags: policy.allowedModelTags ?? [],
            providerCount: catalog.providers.length,
            modelCount: catalog.models.length,
          }),
        );
      }

      return {
        workspaceId: workspace.id,
        planCode: catalog.planCode,
        providers: catalog.providers,
        models: catalog.models,
        ...(catalog.defaultProvider ? { defaultProvider: catalog.defaultProvider } : {}),
        ...(catalog.defaultModel ? { defaultModel: catalog.defaultModel } : {}),
        ...(catalog.allowedModelTags.length > 0 ? { allowedModelTags: catalog.allowedModelTags } : {}),
      };
    } catch (error) {
      this.logProxyPreflightFailure({
        surface: 'models',
        session,
        request: workspaceId ? { workspaceId } : undefined,
        error,
      });
      throw error;
    }
  }

  async proxyStreamForCurrentSession(
    session: CurrentSessionSnapshot,
    request?: Partial<AiProxyRequest>,
  ): Promise<AiProxyStreamResult> {
    let invocation: PreparedProxyInvocation;

    try {
      invocation = await this.prepareProxyInvocation(session, request);
    } catch (error) {
      this.logProxyPreflightFailure({
        surface: 'stream',
        session,
        request,
        error,
      });
      throw error;
    }

    if (!invocation.request.stream) {
      throw new BadRequestException('stream=true is required for streaming AI proxy responses.');
    }

    try {
      const upstream =
        invocation.provider === 'openrouter'
          ? await this.invokeOpenRouterStream({
              apiKey: invocation.apiKey,
              model: invocation.request.model,
              messages: invocation.request.messages,
              temperature: invocation.request.temperature,
              maxTokens: invocation.request.maxTokens,
            })
          : invocation.provider === 'openai'
            ? await this.invokeOpenAiStream({
                apiKey: invocation.apiKey,
                model: invocation.request.model,
                messages: invocation.request.messages,
                temperature: invocation.request.temperature,
                maxTokens: invocation.request.maxTokens,
              })
            : invocation.provider === 'polza'
              ? await this.invokePolzaStream({
                  apiKey: invocation.apiKey,
                  model: invocation.request.model,
                  messages: invocation.request.messages,
                  temperature: invocation.request.temperature,
                  maxTokens: invocation.request.maxTokens,
                })
            : (() => {
                throw new BadRequestException(
                  `Provider "${invocation.provider}" proxy routing is not supported yet.`,
                );
              })();
      const [clientStream, inspectionStream] = upstream.stream.tee();
      const completion = this.consumeOpenRouterStream({
        invocation,
        stream: inspectionStream,
        fallbackModel: invocation.request.model,
      });

      return {
        requestId: invocation.requestId,
        workspaceId: invocation.workspaceId,
        provider: invocation.provider,
        model: invocation.request.model,
        keySource: invocation.keySource,
        contentType: upstream.contentType,
        stream: clientStream,
        completion,
        abort: upstream.abort,
      };
    } catch (error) {
      await this.recordProxyFailureSafely({
        invocation,
        status: 'error',
        errorCode: this.resolveProxyFailureCode(error),
        errorMessage: this.resolveProxyFailureMessage(error),
      });

      throw error;
    }
  }

  private async prepareProxyInvocation(
    session: CurrentSessionSnapshot,
    request?: Partial<AiProxyRequest>,
  ): Promise<PreparedProxyInvocation> {
    const normalizedRequest = this.normalizeRequest(request);
    const workspace = this.resolveWorkspace(session, normalizedRequest.workspaceId);
    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace(workspace.id);
    const catalog = await this.resolveWorkspaceCatalog(workspace.id, policy);
    const provider = (normalizedRequest.provider ?? catalog.defaultProvider ?? policy.providers[0] ?? 'openrouter') as AiProvider;

    if (!policy.providers.includes(provider)) {
      throw new ForbiddenException(`Provider "${provider}" is not enabled by the current AI policy.`);
    }

    const selectedModel = catalog.models.find((model) => model.modelId === normalizedRequest.model);

    if (!selectedModel) {
      throw new ForbiddenException(
        `Model "${normalizedRequest.model}" is not available for the current plan and AI provider policy.`,
      );
    }

    if (selectedModel.provider !== provider) {
      throw new ForbiddenException(
        `Model "${normalizedRequest.model}" is not available for provider "${provider}" under the current AI policy.`,
      );
    }

    if (!supportedProxyProviders.has(provider)) {
      throw new BadRequestException(
        `Provider "${provider}" proxy routing is not supported yet. Supported providers: ${Array.from(supportedProxyProviders).join(', ')}.`,
      );
    }

    const requestId = randomUUID();
    const occurredAt = new Date();
    const periodStart = startOfUtcDay(occurredAt);
    const periodEnd = addUtcDays(periodStart, 1);
    const quotaCounterFallback: AiProxyQuotaCounterRecord = {
      id: 'ai-proxy-fallback',
      workspaceId: workspace.id,
      key: aiRequestsQuotaKey,
      consumed: 0,
      periodStart,
      periodEnd,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    const [quotaLimit, activeCounter] = await Promise.all([
      this.aiProxyRepository.findUsageLimit(workspace.id, aiRequestsQuotaKey),
      this.aiProxyRepository.findActiveQuotaCounter(workspace.id, aiRequestsQuotaKey, occurredAt),
    ]);
    const quotaCounter = activeCounter ?? quotaCounterFallback;

    if (provider !== 'openrouter' && !policy.allowDirectProviderMode) {
      throw new ForbiddenException(
        policy.reason ?? `Direct provider mode is disabled for provider "${provider}".`,
      );
    }

    if (policy.mode === 'user_key_required' && normalizedRequest.useOwnKey !== true) {
      throw new ForbiddenException(
        policy.reason ?? 'This workspace requires bring-your-own-key for AI proxy requests.',
      );
    }

    if (
      normalizedRequest.useOwnKey === true &&
      modelSupportsVision(selectedModel) &&
      !policy.allowVisionOnUserKeys
    ) {
      throw new ForbiddenException(
        policy.reason ?? `Model "${selectedModel.modelId}" requires vision support that is disabled for user keys.`,
      );
    }

    const keyMaterial = await this.resolveKeyMaterial({
      provider,
      session,
      workspaceId: workspace.id,
      policy,
      requestId,
      model: normalizedRequest.model,
      requestedUseOwnKey: normalizedRequest.useOwnKey,
    });
    const keySource = keyMaterial.keySource;
    const apiKey = keyMaterial.apiKey;

    if (provider !== 'openrouter' && keySource !== 'user') {
      throw new BadRequestException(
        `Provider "${provider}" requires useOwnKey=true because platform-managed direct routing is not configured.`,
      );
    }

    if (policy.mode === 'user_key_required' && keySource !== 'user') {
      throw new ForbiddenException(
        policy.reason ?? 'This workspace requires bring-your-own-key for AI proxy requests.',
      );
    }

    if (keySource === 'user' && modelSupportsVision(selectedModel) && !policy.allowVisionOnUserKeys) {
      throw new ForbiddenException(
        policy.reason ?? `Model "${selectedModel.modelId}" requires vision support that is disabled for user keys.`,
      );
    }

    const invocation: PreparedProxyInvocation = {
      session,
      request: normalizedRequest,
      workspaceId: workspace.id,
      provider,
      keySource,
      apiKey,
      requestId,
      occurredAt,
      quotaLimit,
      quotaCounter,
    };

    if (keySource === 'platform') {
      const usageDecision = evaluateUsageDecision({
        consumed: quotaCounter.consumed,
        limit: quotaLimit,
        quotaKey: aiRequestsQuotaKey,
      });

      if (!usageDecision.accepted) {
        await this.recordProxyFailureSafely({
          invocation,
          status: 'quota_exceeded',
          errorCode: 'quota_exhausted',
          errorMessage: usageDecision.message ?? 'Workspace quota has been exhausted.',
        });

        throw new ForbiddenException(usageDecision.message ?? 'Workspace quota has been exhausted.');
      }
    }

    return invocation;
  }

  private async resolveKeyMaterial(input: {
    provider: AiProvider;
    session: CurrentSessionSnapshot;
    workspaceId: string;
    policy: Awaited<ReturnType<AiProviderPolicyService['resolvePolicyForWorkspace']>>;
    requestId: string;
    model: string;
    requestedUseOwnKey?: boolean;
  }): Promise<KeyMaterialResolution> {
    if (input.provider !== 'openrouter' && !input.policy.allowDirectProviderMode) {
      throw new ForbiddenException(
        input.policy.reason ?? `Direct provider mode is disabled for provider "${input.provider}".`,
      );
    }

    const attempted: Array<{
      keySource: 'platform' | 'user';
      error: unknown;
    }> = [];
    const requestedUseOwnKey = input.requestedUseOwnKey;
    const attemptOrder = this.resolveKeyAttemptOrder({
      provider: input.provider,
      policy: input.policy,
      requestedUseOwnKey,
    });

    for (const keySource of attemptOrder) {
      try {
        const apiKey =
          keySource === 'user'
            ? await this.resolveUserKey({
                provider: input.provider,
                session: input.session,
                workspaceId: input.workspaceId,
                policy: input.policy,
              })
            : await this.resolvePlatformKey({
                provider: input.provider,
                policy: input.policy,
              });

        if (attempted.length > 0) {
          this.logKeySourceFallback({
            requestId: input.requestId,
            userId: input.session.user.id,
            workspaceId: input.workspaceId,
            provider: input.provider,
            model: input.model,
            requestedUseOwnKey,
            resolvedKeySource: keySource,
            attempted,
          });
        } else {
          this.logKeySourceResolution({
            requestId: input.requestId,
            userId: input.session.user.id,
            workspaceId: input.workspaceId,
            provider: input.provider,
            model: input.model,
            requestedUseOwnKey,
            resolvedKeySource: keySource,
            attemptCount: 1,
          });
        }

        return {
          keySource,
          apiKey,
        };
      } catch (error) {
        attempted.push({
          keySource,
          error,
        });

        if (!this.canTryNextKeySource(error)) {
          throw error;
        }
      }
    }

    this.logKeySourceFallback({
      requestId: input.requestId,
      userId: input.session.user.id,
      workspaceId: input.workspaceId,
      provider: input.provider,
      model: input.model,
      requestedUseOwnKey,
      resolvedKeySource: null,
      attempted,
    });

    throw (attempted[attempted.length - 1]?.error ??
      new ServiceUnavailableException('Unable to resolve provider credentials for this request.'));
  }

  private resolveKeyAttemptOrder(input: {
    provider: AiProvider;
    policy: Awaited<ReturnType<AiProviderPolicyService['resolvePolicyForWorkspace']>>;
    requestedUseOwnKey?: boolean;
  }): Array<'platform' | 'user'> {
    if (typeof input.requestedUseOwnKey === 'boolean') {
      return [input.requestedUseOwnKey ? 'user' : 'platform'];
    }

    const canTryUserKey = input.policy.allowBringYourOwnKey && !input.policy.requireAdminApproval;

    if (input.policy.mode === 'user_key_required') {
      return ['user'];
    }

    if (input.provider !== 'openrouter') {
      return ['user'];
    }

    if (!input.policy.allowPlatformManaged) {
      return canTryUserKey ? ['user'] : ['platform'];
    }

    if (canTryUserKey) {
      return ['user', 'platform'];
    }

    return ['platform'];
  }

  private canTryNextKeySource(error: unknown): boolean {
    return (
      error instanceof NotFoundException ||
      error instanceof ForbiddenException ||
      error instanceof ServiceUnavailableException
    );
  }

  private logKeySourceResolution(input: {
    requestId: string;
    userId: string;
    workspaceId: string;
    provider: AiProvider;
    model: string;
    requestedUseOwnKey?: boolean;
    resolvedKeySource: 'platform' | 'user';
    attemptCount: number;
  }): void {
    console.info(
      JSON.stringify({
        eventType: 'ai_proxy.key_source_resolved',
        occurredAt: new Date().toISOString(),
        requestId: input.requestId,
        userId: input.userId,
        workspaceId: input.workspaceId,
        provider: input.provider,
        model: input.model,
        requestedUseOwnKey:
          typeof input.requestedUseOwnKey === 'boolean' ? input.requestedUseOwnKey : null,
        resolvedKeySource: input.resolvedKeySource,
        attemptCount: input.attemptCount,
      }),
    );
  }

  private logKeySourceFallback(input: {
    requestId: string;
    userId: string;
    workspaceId: string;
    provider: AiProvider;
    model: string;
    requestedUseOwnKey?: boolean;
    resolvedKeySource: 'platform' | 'user' | null;
    attempted: Array<{
      keySource: 'platform' | 'user';
      error: unknown;
    }>;
  }): void {
    const attempts = input.attempted.map((attempt) => ({
      keySource: attempt.keySource,
      errorCode: this.resolveProxyFailureCode(attempt.error),
      errorMessage: this.resolveProxyFailureMessage(attempt.error),
      status: attempt.error instanceof HttpException ? attempt.error.getStatus() : undefined,
    }));

    console.warn(
      JSON.stringify({
        eventType: 'ai_proxy.key_source_fallback',
        occurredAt: new Date().toISOString(),
        requestId: input.requestId,
        userId: input.userId,
        workspaceId: input.workspaceId,
        provider: input.provider,
        model: input.model,
        requestedUseOwnKey:
          typeof input.requestedUseOwnKey === 'boolean' ? input.requestedUseOwnKey : null,
        resolvedKeySource: input.resolvedKeySource,
        attempts,
      }),
    );
  }

  private async resolveWorkspaceCatalog(
    workspaceId: string,
    policy: Awaited<ReturnType<AiProviderPolicyService['resolvePolicyForWorkspace']>>,
  ): Promise<WorkspaceAiCatalog> {
    const resolvedPlanCode = (await this.aiProxyRepository.findWorkspacePlanCode(workspaceId)) ?? 'free';
    const planCode = resolvedPlanCode.trim().toLowerCase() || 'free';
    const allowedModelTags = Array.from(
      new Set(
        (policy.allowedModelTags ?? [])
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    );
    const providerCatalog = getProviderCatalog();
    const providers = providerCatalog.providers.filter((entry) => policy.providers.includes(entry.provider));
    const planModels = listAvailableModelsForPlan(planCode).filter((entry) => policy.providers.includes(entry.provider));
    const models =
      allowedModelTags.length > 0
        ? planModels.filter((entry) => entry.capabilityTags.some((tag) => allowedModelTags.includes(tag)))
        : planModels;
    const defaultProvider =
      policy.defaultProvider && providers.some((entry) => entry.provider === policy.defaultProvider)
        ? policy.defaultProvider
        : providers[0]?.provider;
    const defaultModel =
      typeof policy.defaultModel === 'string' &&
      models.some((entry) => entry.modelId === policy.defaultModel)
        ? policy.defaultModel
        : models[0]?.modelId;

    return {
      planCode,
      providers,
      models,
      ...(defaultProvider ? { defaultProvider } : {}),
      ...(defaultModel ? { defaultModel } : {}),
      allowedModelTags,
    };
  }

  private normalizeRequest(request?: Partial<AiProxyRequest>): NormalizedProxyRequest {
    if (!request) {
      throw new BadRequestException('Request body is required.');
    }

    const workspaceId = request.workspaceId?.trim() || undefined;
    const providerValue = request.provider;
    const provider =
      typeof providerValue === 'string' && providerValue.trim().length > 0
        ? (providerValue.trim() as AiProvider)
        : undefined;
    const model = readRequiredString(typeof request.model === 'string' ? request.model : undefined, 'model');
    const messages = normalizeMessages(request.messages);
    const temperature = readNumber(request.temperature, 'temperature');
    const maxTokens = readInteger(request.maxTokens, 'maxTokens');

    if (provider && !knownProviders.has(provider)) {
      throw new BadRequestException(`provider must be one of: ${Array.from(knownProviders).join(', ')}.`);
    }

    return {
      workspaceId,
      provider,
      model,
      messages,
      ...(typeof request.useOwnKey === 'boolean' ? { useOwnKey: request.useOwnKey } : {}),
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
      stream: request.stream === true,
    };
  }

  private resolveWorkspace(session: CurrentSessionSnapshot, requestedWorkspaceId?: string) {
    const workspace =
      (requestedWorkspaceId
        ? session.workspaces.find((entry) => entry.id === requestedWorkspaceId)
        : session.workspaces[0]) ?? null;

    if (!workspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    return workspace;
  }

  private async resolvePlatformKey(input: {
    provider: AiProvider;
    policy: Awaited<ReturnType<AiProviderPolicyService['resolvePolicyForWorkspace']>>;
  }): Promise<string> {
    if (!input.policy.allowPlatformManaged) {
      throw new ForbiddenException(
        input.policy.reason ?? 'Platform-managed provider routing is disabled for this workspace.',
      );
    }

    if (input.provider !== 'openrouter') {
      throw new BadRequestException(`Platform-managed key routing is not configured for provider "${input.provider}".`);
    }

    const apiKey = this.env.openRouterApiKey?.trim();

    if (!apiKey) {
      const persistedPlatformCredential = await this.aiProxyRepository.findLatestPlatformCredential({
        provider: input.provider,
      });

      if (persistedPlatformCredential) {
        return this.decryptCredential(persistedPlatformCredential);
      }

      throw new ServiceUnavailableException(
        'Platform OpenRouter credentials are not configured. Add OPENROUTER_API_KEY, store a platform credential, or use useOwnKey=true.',
      );
    }

    return apiKey;
  }

  private async resolveUserKey(input: {
    provider: AiProvider;
    session: CurrentSessionSnapshot;
    workspaceId: string;
    policy: Awaited<ReturnType<AiProviderPolicyService['resolvePolicyForWorkspace']>>;
  }): Promise<string> {
    if (!input.policy.allowBringYourOwnKey) {
      throw new ForbiddenException(
        input.policy.reason ?? 'Bring-your-own-key is disabled by the current AI provider policy.',
      );
    }

    if (input.policy.requireAdminApproval) {
      throw new ForbiddenException(
        input.policy.reason ?? 'Bring-your-own-key currently requires admin approval for this workspace.',
      );
    }

    const credential = await this.aiProxyRepository.findBestUserCredential({
      provider: input.provider,
      userId: input.session.user.id,
      workspaceId: input.workspaceId,
      allowWorkspaceShared: input.policy.allowWorkspaceSharedCredentials ?? false,
    });

    if (!credential) {
      throw new NotFoundException(
        `No active ${input.provider} credential is available for BYOK in this workspace context.`,
      );
    }

    return this.decryptCredential(credential);
  }

  private decryptCredential(credential: AiProxyCredentialRecord): string {
    const envelope = readEncryptedSecretEnvelope(credential.encryptedSecretJson);

    return decryptSecret({
      envelope,
      secret: this.env.providerCredentialSecret,
    });
  }

  private async invokeOpenRouter(input: {
    apiKey: string;
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<OpenRouterResponsePayload> {
    const endpoint = `${trimTrailingSlash(this.env.openRouterApiUrl)}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
      stream: false,
      ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
      ...(typeof input.maxTokens === 'number' ? { max_tokens: input.maxTokens } : {}),
    };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.env.appUrl,
        'X-Title': this.env.openRouterAppName,
      },
      body: JSON.stringify(requestBody),
      signal: createRequestAbortSignal({
        timeoutMs: this.env.openRouterTimeoutMs,
      }),
    });
    const rawResponseText = await response.text();
    const payload: unknown = rawResponseText.length > 0 ? this.tryParseJson(rawResponseText) : {};

    if (!response.ok) {
      const responseErrorMessage = readResponseErrorMessage(payload);

      throw new BadGatewayException(
        `OpenRouter request failed with status ${response.status}${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadGatewayException('OpenRouter returned a non-object response payload.');
    }

    return payload as OpenRouterResponsePayload;
  }

  private async invokeOpenAi(input: {
    apiKey: string;
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<OpenRouterResponsePayload> {
    const endpoint = `${trimTrailingSlash(openAiApiUrl)}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
      stream: false,
      ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
      ...(typeof input.maxTokens === 'number' ? { max_tokens: input.maxTokens } : {}),
    };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: createRequestAbortSignal({
        timeoutMs: this.env.openRouterTimeoutMs,
      }),
    });
    const rawResponseText = await response.text();
    const payload: unknown = rawResponseText.length > 0 ? this.tryParseJson(rawResponseText) : {};

    if (!response.ok) {
      const responseErrorMessage = readResponseErrorMessage(payload);

      throw new BadGatewayException(
        `OpenAI request failed with status ${response.status}${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadGatewayException('OpenAI returned a non-object response payload.');
    }

    return payload as OpenRouterResponsePayload;
  }

  private async invokePolza(input: {
    apiKey: string;
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<OpenRouterResponsePayload> {
    const endpoint = `${trimTrailingSlash(this.env.polzaApiUrl)}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model: resolveProviderModelForUpstream('polza', input.model),
      messages: input.messages,
      stream: false,
      ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
      ...(typeof input.maxTokens === 'number' ? { max_tokens: input.maxTokens } : {}),
    };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: createRequestAbortSignal({
        timeoutMs: this.env.polzaTimeoutMs,
      }),
    });
    const rawResponseText = await response.text();
    const payload: unknown = rawResponseText.length > 0 ? this.tryParseJson(rawResponseText) : {};

    if (!response.ok) {
      const responseErrorMessage = readResponseErrorMessage(payload);

      throw new BadGatewayException(
        `Polza request failed with status ${response.status}${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadGatewayException('Polza returned a non-object response payload.');
    }

    return payload as OpenRouterResponsePayload;
  }

  private async invokeOpenRouterStream(input: {
    apiKey: string;
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<OpenRouterStreamInvocationResult> {
    const endpoint = `${trimTrailingSlash(this.env.openRouterApiUrl)}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
      stream: true,
      stream_options: {
        include_usage: true,
      },
      ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
      ...(typeof input.maxTokens === 'number' ? { max_tokens: input.maxTokens } : {}),
    };
    const abortController = new AbortController();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.env.appUrl,
        'X-Title': this.env.openRouterAppName,
      },
      body: JSON.stringify(requestBody),
      signal: createRequestAbortSignal({
        timeoutMs: this.env.openRouterTimeoutMs,
        abortController,
      }),
    });

    if (!response.ok) {
      const rawResponseText = await response.text();
      const payload: unknown = rawResponseText.length > 0 ? this.tryParseJson(rawResponseText) : {};
      const responseErrorMessage = readResponseErrorMessage(payload);

      throw new BadGatewayException(
        `OpenRouter request failed with status ${response.status}${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
      );
    }

    if (!response.body) {
      throw new BadGatewayException('OpenRouter returned an empty streaming payload.');
    }

    return {
      stream: response.body,
      contentType: response.headers.get('content-type')?.trim() || 'text/event-stream; charset=utf-8',
      abort: () => {
        if (!abortController.signal.aborted) {
          abortController.abort('stream-aborted');
        }
      },
    };
  }

  private async invokeOpenAiStream(input: {
    apiKey: string;
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<OpenRouterStreamInvocationResult> {
    const endpoint = `${trimTrailingSlash(openAiApiUrl)}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
      stream: true,
      stream_options: {
        include_usage: true,
      },
      ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
      ...(typeof input.maxTokens === 'number' ? { max_tokens: input.maxTokens } : {}),
    };
    const abortController = new AbortController();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: createRequestAbortSignal({
        timeoutMs: this.env.openRouterTimeoutMs,
        abortController,
      }),
    });

    if (!response.ok) {
      const rawResponseText = await response.text();
      const payload: unknown = rawResponseText.length > 0 ? this.tryParseJson(rawResponseText) : {};
      const responseErrorMessage = readResponseErrorMessage(payload);

      throw new BadGatewayException(
        `OpenAI request failed with status ${response.status}${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
      );
    }

    if (!response.body) {
      throw new BadGatewayException('OpenAI returned an empty streaming payload.');
    }

    return {
      stream: response.body,
      contentType: response.headers.get('content-type')?.trim() || 'text/event-stream; charset=utf-8',
      abort: () => {
        if (!abortController.signal.aborted) {
          abortController.abort('stream-aborted');
        }
      },
    };
  }

  private async invokePolzaStream(input: {
    apiKey: string;
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<OpenRouterStreamInvocationResult> {
    const endpoint = `${trimTrailingSlash(this.env.polzaApiUrl)}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model: resolveProviderModelForUpstream('polza', input.model),
      messages: input.messages,
      stream: true,
      stream_options: {
        include_usage: true,
      },
      ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
      ...(typeof input.maxTokens === 'number' ? { max_tokens: input.maxTokens } : {}),
    };
    const abortController = new AbortController();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: createRequestAbortSignal({
        timeoutMs: this.env.polzaTimeoutMs,
        abortController,
      }),
    });

    if (!response.ok) {
      const rawResponseText = await response.text();
      const payload: unknown = rawResponseText.length > 0 ? this.tryParseJson(rawResponseText) : {};
      const responseErrorMessage = readResponseErrorMessage(payload);

      throw new BadGatewayException(
        `Polza request failed with status ${response.status}${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
      );
    }

    if (!response.body) {
      throw new BadGatewayException('Polza returned an empty streaming payload.');
    }

    return {
      stream: response.body,
      contentType: response.headers.get('content-type')?.trim() || 'text/event-stream; charset=utf-8',
      abort: () => {
        if (!abortController.signal.aborted) {
          abortController.abort('stream-aborted');
        }
      },
    };
  }

  private async consumeOpenRouterStream(input: {
    invocation: PreparedProxyInvocation;
    stream: ReadableStream<Uint8Array>;
    fallbackModel: string;
  }): Promise<AiProxyStreamCompletion> {
    try {
      const inspection = await this.inspectOpenRouterSseStream(input.stream);
      const quota = await this.recordProxyCompletion({
        invocation: input.invocation,
        usage: inspection.usage,
        responseId: inspection.responseId,
      });

      return {
        requestId: input.invocation.requestId,
        workspaceId: input.invocation.workspaceId,
        provider: input.invocation.provider,
        model: inspection.model ?? input.fallbackModel,
        keySource: input.invocation.keySource,
        ...(inspection.usage ? { usage: inspection.usage } : {}),
        ...(inspection.responseId ? { responseId: inspection.responseId } : {}),
        quota,
      };
    } catch (error) {
      await this.recordProxyFailureSafely({
        invocation: input.invocation,
        status: 'error',
        errorCode: this.resolveProxyFailureCode(error),
        errorMessage: this.resolveProxyFailureMessage(error),
      });

      throw error;
    }
  }

  private async inspectOpenRouterSseStream(stream: ReadableStream<Uint8Array>): Promise<OpenRouterStreamInspection> {
    const inspection: OpenRouterStreamInspection = {};
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of this.readStreamChunks(stream)) {
      buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');

      let separatorIndex = buffer.indexOf('\n\n');

      while (separatorIndex >= 0) {
        const eventBlock = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        this.inspectSseEventBlock(eventBlock, inspection);
        separatorIndex = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode().replace(/\r\n/g, '\n');

    if (buffer.trim().length > 0) {
      this.inspectSseEventBlock(buffer, inspection);
    }

    return inspection;
  }

  private inspectSseEventBlock(rawEvent: string, inspection: OpenRouterStreamInspection) {
    const dataLines = rawEvent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());

    if (dataLines.length === 0) {
      return;
    }

    const eventPayload = dataLines.join('\n');

    if (!eventPayload || eventPayload === '[DONE]') {
      return;
    }

    const parsedPayload = this.tryParseJson(eventPayload);

    if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
      return;
    }

    const payload = parsedPayload as OpenRouterResponsePayload;

    if (typeof payload.id === 'string' && payload.id.trim().length > 0) {
      inspection.responseId = payload.id.trim();
    }

    if (typeof payload.model === 'string' && payload.model.trim().length > 0) {
      inspection.model = payload.model.trim();
    }

    const usage = extractUsage(payload);

    if (usage) {
      inspection.usage = usage;
    }
  }

  private async *readStreamChunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
    const reader = stream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (value) {
          yield value;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async recordProxyCompletion(input: {
    invocation: PreparedProxyInvocation;
    usage?: AiProxyUsage;
    responseId?: string;
  }): Promise<AiProxyQuotaSnapshot> {
    const nextCounter = await this.aiProxyRepository.recordProxyEvent({
      workspaceId: input.invocation.workspaceId,
      userId: input.invocation.session.user.id,
      requestId: input.invocation.requestId,
      provider: input.invocation.provider,
      model: input.invocation.request.model,
      keySource: input.invocation.keySource,
      messageCount: input.invocation.request.messages.length,
      usage: input.usage,
      responseId: input.responseId,
      quotaKey: aiRequestsQuotaKey,
      periodStart: input.invocation.quotaCounter.periodStart,
      periodEnd: input.invocation.quotaCounter.periodEnd,
      consumeQuota: input.invocation.keySource === 'platform',
      occurredAt: input.invocation.occurredAt,
      durationMs: this.resolveDurationMs(input.invocation.occurredAt),
    });

    return this.buildQuotaSnapshot({
      invocation: input.invocation,
      nextCounter,
    });
  }

  private async recordProxyFailureSafely(input: {
    invocation: PreparedProxyInvocation;
    status: 'error' | 'quota_exceeded';
    errorCode: string;
    errorMessage?: string;
  }) {
    try {
      await this.aiProxyRepository.recordProxyFailure({
        workspaceId: input.invocation.workspaceId,
        userId: input.invocation.session.user.id,
        requestId: input.invocation.requestId,
        provider: input.invocation.provider,
        model: input.invocation.request.model,
        keySource: input.invocation.keySource,
        messageCount: input.invocation.request.messages.length,
        status: input.status,
        errorCode: input.errorCode,
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
        occurredAt: input.invocation.occurredAt,
        durationMs: this.resolveDurationMs(input.invocation.occurredAt),
      });
    } catch (error) {
      console.error('[ai-proxy] Failed to persist proxy failure event.', error);
    }
  }

  private resolveProxyFailureCode(error: unknown): string {
    if (error instanceof BadGatewayException) {
      return 'upstream_bad_gateway';
    }

    if (error instanceof ServiceUnavailableException) {
      return 'upstream_unavailable';
    }

    if (error instanceof ForbiddenException) {
      return 'forbidden';
    }

    if (error instanceof NotFoundException) {
      return 'not_found';
    }

    if (error instanceof BadRequestException) {
      return 'bad_request';
    }

    return 'proxy_error';
  }

  private resolveProxyFailureMessage(error: unknown): string | undefined {
    if (error instanceof Error) {
      return error.message.trim().slice(0, 512) || undefined;
    }

    return undefined;
  }

  private logProxyPreflightFailure(input: {
    surface: 'proxy' | 'stream' | 'models';
    session: CurrentSessionSnapshot;
    request?: Partial<AiProxyRequest>;
    error: unknown;
  }): void {
    const requestedWorkspaceId =
      typeof input.request?.workspaceId === 'string' ? input.request.workspaceId.trim() : undefined;
    const requestedProvider =
      typeof input.request?.provider === 'string' ? input.request.provider.trim() : undefined;
    const requestedModel =
      typeof input.request?.model === 'string' ? input.request.model.trim() : undefined;
    const messageCount = Array.isArray(input.request?.messages) ? input.request?.messages.length : undefined;
    const status =
      input.error instanceof HttpException ? input.error.getStatus() : undefined;

    console.warn(
      JSON.stringify({
        eventType: 'ai_proxy.preflight_failed',
        surface: input.surface,
        occurredAt: new Date().toISOString(),
        userId: input.session.user.id,
        sessionPersona: input.session.personaKey,
        requestedWorkspaceId,
        requestedProvider,
        requestedModel,
        useOwnKeyRequested:
          typeof input.request?.useOwnKey === 'boolean' ? input.request.useOwnKey : null,
        messageCount,
        errorCode: this.resolveProxyFailureCode(input.error),
        errorMessage: this.resolveProxyFailureMessage(input.error),
        ...(typeof status === 'number' ? { status } : {}),
      }),
    );
  }

  private resolveDurationMs(startedAt: Date): number {
    const elapsedMs = Date.now() - startedAt.getTime();

    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      return 0;
    }

    return Math.trunc(elapsedMs);
  }

  private buildQuotaSnapshot(input: {
    invocation: PreparedProxyInvocation;
    nextCounter: AiProxyQuotaCounterRecord | null;
  }): AiProxyQuotaSnapshot {
    const consumed =
      input.invocation.keySource === 'platform'
        ? (input.nextCounter?.consumed ?? input.invocation.quotaCounter.consumed + 1)
        : input.invocation.quotaCounter.consumed;
    const remaining =
      typeof input.invocation.quotaLimit === 'number' ? Math.max(input.invocation.quotaLimit - consumed, 0) : undefined;

    return {
      key: aiRequestsQuotaKey,
      consumed,
      ...(typeof input.invocation.quotaLimit === 'number' ? { limit: input.invocation.quotaLimit } : {}),
      ...(typeof remaining === 'number' ? { remaining } : {}),
      periodStart: input.invocation.quotaCounter.periodStart.toISOString(),
      periodEnd: input.invocation.quotaCounter.periodEnd.toISOString(),
      decremented: input.invocation.keySource === 'platform',
    };
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return {
        raw: value,
      };
    }
  }
}
