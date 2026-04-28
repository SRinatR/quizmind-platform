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
  type ProviderModelCatalogEntry,
} from '@quizmind/contracts';
import { type Prisma } from '@quizmind/database';
import { getProviderCatalog, listAvailableModelsForPlan, providerRegistry } from '@quizmind/providers';
import { decryptSecret, type EncryptedSecretEnvelope } from '@quizmind/secrets';
import { addUtcDays, evaluateUsageDecision, startOfUtcDay } from '@quizmind/usage';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { AiHistoryService, estimateRequestCostUsd, extractProviderCostUsd } from '../history/ai-history.service';
import { AiProviderPolicyService } from '../providers/ai-provider-policy.service';
import {
  AiProxyRepository,
  type AiProxyCredentialRecord,
  type AiProxyQuotaCounterRecord,
} from './ai-proxy.repository';
import { OpenRouterCatalogService } from './openrouter-catalog.service';
import { RouterAiCatalogService } from './routerai-catalog.service';
import { WalletRepository } from '../wallet/wallet.repository';
import { AiPricingService } from './ai-pricing.service';

const aiRequestsQuotaKey = 'limit.requests_per_day';
const supportedProxyProviders = new Set<AiProvider>(['openrouter', 'routerai', 'openai', 'polza']);
const knownProviders = new Set<AiProvider>(providerRegistry.map((provider) => provider.provider));
const supportedMessageRoles = new Set(['system', 'user', 'assistant', 'tool']);
const openAiApiUrl = 'https://api.openai.com/v1';

type OpenRouterResponsePayload = Record<string, unknown>;
type AiProxyUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

interface BillingResult {
  providerCostUsd: number;
  platformFeeUsd: number;
  chargedCostUsd: number;
  chargedCurrency: string | null;
  chargedAmountMinor: number | null;
  pricingSource: 'provider' | 'estimated';
  pricingPolicySnapshotJson: Prisma.InputJsonValue;
  walletLedgerEntryId: string | null;
}

function createTooManyRequestsException(message: string): HttpException {
  return new HttpException(message, 429);
}

type NormalizedMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail?: string } }
    >;

interface NormalizedProxyRequest {
  provider?: AiProvider;
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: NormalizedMessageContent; name?: string }>;
  useOwnKey?: boolean;
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
}

interface PreparedProxyInvocation {
  session: CurrentSessionSnapshot;
  request: NormalizedProxyRequest;
  resolvedModel: string;
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
  provider: AiProvider;
  model: string;
  keySource: 'platform' | 'user';
  usage?: AiProxyUsage;
  responseId?: string;
  quota: AiProxyQuotaSnapshot;
}

export interface AiProxyStreamResult {
  requestId: string;
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

function normalizeContentBlock(
  block: unknown,
  msgIndex: number,
  blockIndex: number,
): { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: string } } {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    throw new BadRequestException(`messages[${msgIndex}].content[${blockIndex}] must be an object.`);
  }

  const b = block as Record<string, unknown>;

  if (b.type === 'text') {
    const text = typeof b.text === 'string' ? b.text : '';
    if (!text.trim()) {
      throw new BadRequestException(`messages[${msgIndex}].content[${blockIndex}].text is required.`);
    }
    return { type: 'text', text: text.trim() };
  }

  if (b.type === 'image_url') {
    const imageUrlObj = b.image_url && typeof b.image_url === 'object' && !Array.isArray(b.image_url)
      ? (b.image_url as Record<string, unknown>)
      : null;
    const url = imageUrlObj && typeof imageUrlObj.url === 'string' ? imageUrlObj.url.trim() : '';
    if (!url) {
      throw new BadRequestException(`messages[${msgIndex}].content[${blockIndex}].image_url.url is required.`);
    }
    const detail = typeof imageUrlObj?.detail === 'string' &&
      (imageUrlObj.detail === 'auto' || imageUrlObj.detail === 'low' || imageUrlObj.detail === 'high')
      ? imageUrlObj.detail
      : undefined;
    return { type: 'image_url', image_url: { url, ...(detail ? { detail } : {}) } };
  }

  throw new BadRequestException(
    `messages[${msgIndex}].content[${blockIndex}].type must be "text" or "image_url".`,
  );
}

function normalizeMessageContent(content: unknown, index: number): NormalizedMessageContent {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException(`messages[${index}].content is required.`);
    }
    return trimmed;
  }

  if (Array.isArray(content)) {
    if (content.length === 0) {
      throw new BadRequestException(`messages[${index}].content array must not be empty.`);
    }
    return content.map((block, blockIndex) => normalizeContentBlock(block, index, blockIndex));
  }

  throw new BadRequestException(`messages[${index}].content must be a string or an array of content blocks.`);
}

function normalizeMessages(value: unknown): Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: NormalizedMessageContent; name?: string }> {
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

    const content = normalizeMessageContent(entry.content, index);
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
    @Inject(AiHistoryService)
    private readonly aiHistoryService: AiHistoryService,
    @Inject(OpenRouterCatalogService)
    private readonly openRouterCatalogService: OpenRouterCatalogService,
    @Inject(RouterAiCatalogService)
    private readonly routerAiCatalogService: RouterAiCatalogService,
    @Inject(WalletRepository)
    private readonly walletRepository: WalletRepository,
    @Inject(AiPricingService)
    private readonly aiPricingService?: AiPricingService,
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
              model: invocation.resolvedModel,
              messages: invocation.request.messages,
              temperature: invocation.request.temperature,
              maxTokens: invocation.request.maxTokens,
            })
          : invocation.provider === 'routerai'
            ? await this.invokeRouterAi({
                apiKey: invocation.apiKey,
                model: invocation.resolvedModel,
                messages: invocation.request.messages,
                temperature: invocation.request.temperature,
                maxTokens: invocation.request.maxTokens,
              })
          : invocation.provider === 'openai'
            ? await this.invokeOpenAi({
                apiKey: invocation.apiKey,
                model: invocation.resolvedModel,
                messages: invocation.request.messages,
                temperature: invocation.request.temperature,
                maxTokens: invocation.request.maxTokens,
              })
            : invocation.provider === 'polza'
              ? await this.invokePolza({
                  apiKey: invocation.apiKey,
                  model: invocation.resolvedModel,
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
      const billing = await this.calculateAndDebitForInvocation({
        invocation,
        usage,
        upstreamResponse,
        status: 'success',
      });
      const quotaSnapshot = await this.recordProxyCompletion({
        invocation,
        usage,
        responseId: typeof upstreamResponse.id === 'string' ? upstreamResponse.id : undefined,
      });

      // Persist prompt/response content for history (fire-and-forget).
      this.persistHistoryContentSafely({
        invocation,
        messages: invocation.request.messages,
        upstreamResponse,
        usage,
        billing,
      });

      return {
        requestId: invocation.requestId,
        provider: invocation.provider,
        model: typeof upstreamResponse.model === 'string' ? upstreamResponse.model : invocation.resolvedModel,
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
  ): Promise<AiModelsCatalogPayload> {
    try {
      const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace();
      const catalog = await this.resolveWorkspaceCatalog(policy);

      if (catalog.providers.length === 0 || catalog.models.length === 0) {
        console.warn(
          JSON.stringify({
            eventType: 'ai_proxy.models_catalog_empty',
            occurredAt: new Date().toISOString(),
            userId: session.user.id,
            policyMode: policy.mode,
            policyProviders: policy.providers,
            allowedModelTags: policy.allowedModelTags ?? [],
            providerCount: catalog.providers.length,
            modelCount: catalog.models.length,
          }),
        );
      }

      return {
        providers: catalog.providers,
        models: catalog.models,
        workspaceId: policy.workspaceId ?? undefined,
        planCode: (await (this.aiProxyRepository as any).findWorkspacePlanCode?.()) ?? undefined,
        ...(catalog.defaultProvider ? { defaultProvider: catalog.defaultProvider } : {}),
        ...(catalog.defaultModel ? { defaultModel: catalog.defaultModel } : {}),
        ...(catalog.allowedModelTags.length > 0 ? { allowedModelTags: catalog.allowedModelTags } : {}),
      } as AiModelsCatalogPayload;
    } catch (error) {
      this.logProxyPreflightFailure({
        surface: 'models',
        session,
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
              model: invocation.resolvedModel,
              messages: invocation.request.messages,
              temperature: invocation.request.temperature,
              maxTokens: invocation.request.maxTokens,
            })
          : invocation.provider === 'routerai'
            ? await this.invokeRouterAiStream({
                apiKey: invocation.apiKey,
                model: invocation.resolvedModel,
                messages: invocation.request.messages,
                temperature: invocation.request.temperature,
                maxTokens: invocation.request.maxTokens,
              })
          : invocation.provider === 'openai'
            ? await this.invokeOpenAiStream({
                apiKey: invocation.apiKey,
                model: invocation.resolvedModel,
                messages: invocation.request.messages,
                temperature: invocation.request.temperature,
                maxTokens: invocation.request.maxTokens,
              })
            : invocation.provider === 'polza'
              ? await this.invokePolzaStream({
                  apiKey: invocation.apiKey,
                  model: invocation.resolvedModel,
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
        fallbackModel: invocation.resolvedModel,
      });

      return {
        requestId: invocation.requestId,
        provider: invocation.provider,
        model: invocation.resolvedModel,
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
    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace();
    const catalog = await this.resolveWorkspaceCatalog(policy);
    const provider = (normalizedRequest.provider ?? catalog.defaultProvider ?? policy.providers[0] ?? 'openrouter') as AiProvider;

    if (!policy.providers.includes(provider)) {
      throw new ForbiddenException(`Provider "${provider}" is not enabled by the current AI policy.`);
    }

    const resolvedModel = normalizedRequest.model ?? catalog.defaultModel;

    if (!resolvedModel) {
      throw new ForbiddenException(
        'No model specified and no default model is configured in the AI provider policy.',
      );
    }

    const selectedModel = catalog.models.find((model) => model.modelId === resolvedModel);

    if (!selectedModel) {
      throw new ForbiddenException(
        `Model "${resolvedModel}" is not available for the current plan and AI provider policy.`,
      );
    }

    if (selectedModel.provider !== provider) {
      throw new ForbiddenException(
        `Model "${resolvedModel}" is not available for the current plan and AI provider policy (provider "${provider}").`,
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
    const quotaLimit = (await (this.aiProxyRepository as any).findUsageLimit?.(aiRequestsQuotaKey)) as number | undefined;
    const quotaCounter =
      ((await (this.aiProxyRepository as any).findActiveQuotaCounter?.(aiRequestsQuotaKey, periodStart, periodEnd)) as
        | AiProxyQuotaCounterRecord
        | null
        | undefined) ?? {
        id: 'ai-proxy-fallback',
        key: aiRequestsQuotaKey,
        consumed: 0,
        periodStart,
        periodEnd,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };

    if (provider !== 'openrouter' && provider !== 'routerai' && !policy.allowDirectProviderMode) {
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
      policy,
      requestId,
      model: resolvedModel,
      requestedUseOwnKey: normalizedRequest.useOwnKey,
    });
    const keySource = keyMaterial.keySource;
    const apiKey = keyMaterial.apiKey;

    if (provider !== 'openrouter' && provider !== 'routerai' && keySource !== 'user') {
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

    // ── Wallet balance gate for platform-managed OpenRouter ──────────────────
    // Only enforced in connected mode (wallets exist) and when the platform key
    // is being used (user-key requests are not subject to this gate).
    if (this.env.runtimeMode === 'connected') {
      const pricingPolicy = this.aiPricingService
        ? await this.aiPricingService.getEffectivePolicy()
        : { enabled: false, chargeUserKeyRequests: 'never' as const };
      const isFreeModel = selectedModel.capabilityTags.includes('free');
      const balanceKopecks = isFreeModel
        ? null // skip DB lookup entirely for free models
        : await this.walletRepository.findBalanceForUser(session.user.id);
      const effectiveBalance = balanceKopecks ?? 0;
      const shouldEnforce = pricingPolicy.enabled && (keySource === 'platform' || pricingPolicy.chargeUserKeyRequests !== 'never');
      const blocked = shouldEnforce && !isFreeModel && effectiveBalance <= 0;

      console.log(
        JSON.stringify({
          eventType: 'ai_proxy.wallet_gate',
          modelId: selectedModel.modelId,
          isFreeModel,
          balanceKopecks: isFreeModel ? null : effectiveBalance,
          decision: blocked ? 'blocked' : 'allowed',
          keySource,
          pricingEnabled: pricingPolicy.enabled,
          userId: session.user.id,
          occurredAt: new Date().toISOString(),
        }),
      );

      if (blocked) {
        throw new ForbiddenException(
          'Insufficient balance for paid model. Top up your balance or choose a free model.',
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const invocation: PreparedProxyInvocation = {
      session,
      request: normalizedRequest,
      resolvedModel,
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
    policy: Awaited<ReturnType<AiProviderPolicyService['resolvePolicyForWorkspace']>>;
    requestId: string;
    model: string;
    requestedUseOwnKey?: boolean;
  }): Promise<KeyMaterialResolution> {
    if (input.provider !== 'openrouter' && input.provider !== 'routerai' && !input.policy.allowDirectProviderMode) {
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

    if (input.provider !== 'openrouter' && input.provider !== 'routerai') {
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
    policy: Awaited<ReturnType<AiProviderPolicyService['resolvePolicyForWorkspace']>>,
  ): Promise<WorkspaceAiCatalog> {
    const allowedModelTags = Array.from(
      new Set(
        (policy.allowedModelTags ?? [])
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    );
    const providerCatalog = getProviderCatalog();
    const providers = providerCatalog.providers.filter((entry) => policy.providers.includes(entry.provider));

    const isOpenRouterPlatformManaged =
      policy.providers.includes('openrouter') && policy.allowPlatformManaged;

    let allModels: ProviderModelCatalogEntry[];

    const isRouterAiPlatformManaged =
      policy.providers.includes('routerai') && policy.allowPlatformManaged;

    if (isOpenRouterPlatformManaged || isRouterAiPlatformManaged) {
      // Fetch the live OpenRouter catalog. Falls back to [] on failure so the
      // static fallback below keeps things working.
      const [liveOpenRouterModels, liveRouterAiModels] = await Promise.all([
        isOpenRouterPlatformManaged ? this.openRouterCatalogService.getLiveModels() : Promise.resolve([]),
        isRouterAiPlatformManaged ? this.routerAiCatalogService.getLiveModels() : Promise.resolve([]),
      ]);
      const liveModels = [...liveOpenRouterModels, ...liveRouterAiModels];

      if (liveModels.length > 0) {
        // Ensure openrouter/auto (virtual routing entry) is always present.
        const hasAutoEntry = liveOpenRouterModels.some((m) => m.modelId === 'openrouter/auto');
        const extraEntries: ProviderModelCatalogEntry[] = !isOpenRouterPlatformManaged || hasAutoEntry
          ? []
          : [
              {
                provider: 'openrouter',
                modelId: 'openrouter/auto',
                displayName: 'OpenRouter Auto',
                capabilityTags: ['text', 'routing'],
                availability: 'active',
                latencyClass: 'low',
                planAvailability: ['free', 'pro', 'business'],
              },
            ];

        // Providers without a live catalog response still come from the static catalog.
        const providersWithLiveModels = new Set(liveModels.map((entry) => entry.provider));
        const staticModels = listAvailableModelsForPlan().filter(
          (entry) => !providersWithLiveModels.has(entry.provider) && policy.providers.includes(entry.provider),
        );

        allModels = [...extraEntries, ...liveModels, ...staticModels];
      } else {
        // Live fetch failed or no key configured — fall back to static catalog.
        allModels = listAvailableModelsForPlan().filter((entry) => policy.providers.includes(entry.provider));
      }
    } else {
      allModels = listAvailableModelsForPlan().filter((entry) => policy.providers.includes(entry.provider));
    }

    const models =
      allowedModelTags.length > 0
        ? allModels.filter((entry) => entry.capabilityTags.some((tag) => allowedModelTags.includes(tag)))
        : allModels;
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

    const providerValue = request.provider;
    const provider =
      typeof providerValue === 'string' && providerValue.trim().length > 0
        ? (providerValue.trim() as AiProvider)
        : undefined;
    const model =
      typeof request.model === 'string' && request.model.trim().length > 0
        ? request.model.trim()
        : undefined;
    const messages = normalizeMessages(request.messages);
    const temperature = readNumber(request.temperature, 'temperature');
    const maxTokens = readInteger(request.maxTokens, 'maxTokens');

    if (provider && !knownProviders.has(provider)) {
      throw new BadRequestException(`provider must be one of: ${Array.from(knownProviders).join(', ')}.`);
    }

    return {
      provider,
      model,
      messages,
      ...(typeof request.useOwnKey === 'boolean' ? { useOwnKey: request.useOwnKey } : {}),
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
      stream: request.stream === true,
    };
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

    const apiKey = input.provider === 'routerai'
      ? this.env.routerAiApiKey?.trim()
      : input.provider === 'openrouter'
        ? this.env.openRouterApiKey?.trim()
        : undefined;

    if (!apiKey) {
      const persistedPlatformCredential = await this.aiProxyRepository.findLatestPlatformCredential({
        provider: input.provider,
      });

      if (persistedPlatformCredential) {
        return this.decryptCredential(persistedPlatformCredential);
      }

      if (input.provider === 'routerai') {
        throw new ServiceUnavailableException(
          'Platform RouterAI credentials are not configured. Add ROUTERAI_API_KEY or store a platform credential.',
        );
      }

      if (input.provider !== 'openrouter') {
        throw new BadRequestException(`Platform-managed key routing is not configured for provider "${input.provider}".`);
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
    policy: Awaited<ReturnType<AiProviderPolicyService['resolvePolicyForWorkspace']>>;
  }): Promise<string> {
    if (!input.policy.allowBringYourOwnKey) {
      throw new ForbiddenException(
        input.policy.reason ?? 'Bring-your-own-key is disabled by the current AI provider policy.',
      );
    }

    if (input.policy.requireAdminApproval) {
      throw new ForbiddenException(
        input.policy.reason ?? 'Bring-your-own-key currently requires admin approval.',
      );
    }

    const credential = await this.aiProxyRepository.findBestUserCredential({
      provider: input.provider,
      userId: input.session.user.id,
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
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: NormalizedMessageContent; name?: string }>;
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

      if (response.status === 429) {
        throw createTooManyRequestsException(
          `OpenRouter provider rate limit exceeded${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
        );
      }

      throw new BadGatewayException(
        `OpenRouter request failed with status ${response.status}${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadGatewayException('OpenRouter returned a non-object response payload.');
    }

    return payload as OpenRouterResponsePayload;
  }

  private async invokeRouterAi(input: {
    apiKey: string;
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: NormalizedMessageContent; name?: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<OpenRouterResponsePayload> {
    const endpoint = `${trimTrailingSlash(this.env.routerAiApiUrl)}/chat/completions`;
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
        timeoutMs: this.env.routerAiTimeoutMs,
      }),
    });
    const rawResponseText = await response.text();
    const payload: unknown = rawResponseText.length > 0 ? this.tryParseJson(rawResponseText) : {};

    if (!response.ok) {
      const responseErrorMessage = readResponseErrorMessage(payload);

      if (response.status === 429) {
        throw createTooManyRequestsException(
          `RouterAI provider rate limit exceeded${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
        );
      }

      throw new BadGatewayException(
        `RouterAI request failed with status ${response.status}${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadGatewayException('RouterAI returned a non-object response payload.');
    }

    return payload as OpenRouterResponsePayload;
  }

  private async invokeOpenAi(input: {
    apiKey: string;
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: NormalizedMessageContent; name?: string }>;
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

      if (response.status === 429) {
        throw createTooManyRequestsException(
          `OpenAI provider rate limit exceeded${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
        );
      }

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
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: NormalizedMessageContent; name?: string }>;
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

      if (response.status === 429) {
        throw createTooManyRequestsException(
          `Polza provider rate limit exceeded${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
        );
      }

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
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: NormalizedMessageContent; name?: string }>;
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

      if (response.status === 429) {
        throw createTooManyRequestsException(
          `OpenRouter provider rate limit exceeded${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
        );
      }

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
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: NormalizedMessageContent; name?: string }>;
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

      if (response.status === 429) {
        throw createTooManyRequestsException(
          `OpenAI provider rate limit exceeded${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
        );
      }

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

  private async invokeRouterAiStream(input: {
    apiKey: string;
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: NormalizedMessageContent; name?: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<OpenRouterStreamInvocationResult> {
    const endpoint = `${trimTrailingSlash(this.env.routerAiApiUrl)}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
      stream: true,
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
        timeoutMs: this.env.routerAiTimeoutMs,
        abortController,
      }),
    });

    if (!response.ok) {
      const rawResponseText = await response.text();
      const payload: unknown = rawResponseText.length > 0 ? this.tryParseJson(rawResponseText) : {};
      const responseErrorMessage = readResponseErrorMessage(payload);

      if (response.status === 429) {
        throw createTooManyRequestsException(
          `RouterAI provider rate limit exceeded${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
        );
      }

      throw new BadGatewayException(
        `RouterAI request failed with status ${response.status}${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
      );
    }

    if (!response.body) {
      throw new BadGatewayException('RouterAI returned an empty streaming payload.');
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
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: NormalizedMessageContent; name?: string }>;
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

      if (response.status === 429) {
        throw createTooManyRequestsException(
          `Polza provider rate limit exceeded${responseErrorMessage ? `: ${responseErrorMessage}` : '.'}`,
        );
      }

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
      const billing = await this.calculateAndDebitForInvocation({
        invocation: input.invocation,
        usage: inspection.usage,
        upstreamResponse: undefined,
        status: 'success',
      });
      const quota = await this.recordProxyCompletion({
        invocation: input.invocation,
        usage: inspection.usage,
        responseId: inspection.responseId,
      });

      this.persistHistoryContentSafely({
        invocation: input.invocation,
        messages: input.invocation.request.messages,
        usage: inspection.usage,
        status: 'success',
        billing,
      });

      return {
        requestId: input.invocation.requestId,
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
      userId: input.invocation.session.user.id,
      requestId: input.invocation.requestId,
      provider: input.invocation.provider,
      model: input.invocation.resolvedModel,
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
    let billing: BillingResult | null = null;
    if (input.errorCode !== 'insufficient_balance') {
      try {
        billing = await this.calculateAndDebitForInvocation({
          invocation: input.invocation,
          status: input.status,
        });
      } catch (error) {
        console.warn('[ai-proxy] Failed to calculate/debit failure billing.', error);
      }
    }

    try {
      await this.aiProxyRepository.recordProxyFailure({
        userId: input.invocation.session.user.id,
        requestId: input.invocation.requestId,
        provider: input.invocation.provider,
        model: input.invocation.resolvedModel,
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

    // Also persist prompt content for failed requests (history must cover errors).
    this.persistHistoryContentSafely({
      invocation: input.invocation,
      messages: input.invocation.request.messages,
      status: input.status,
      errorCode: input.errorCode,
      billing: billing ?? undefined,
    });
  }

  private persistHistoryContentSafely(input: {
    invocation: PreparedProxyInvocation;
    messages: NormalizedProxyRequest['messages'];
    upstreamResponse?: Record<string, unknown>;
    usage?: AiProxyUsage;
    status?: 'success' | 'error' | 'quota_exceeded';
    errorCode?: string;
    billing?: BillingResult;
  }): void {
    const { invocation, messages, upstreamResponse, usage, status, errorCode, billing } = input;
    const hasImage = messages.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'image_url'),
    );
    const requestType: 'text' | 'image' = hasImage ? 'image' : 'text';

    this.aiHistoryService
      .persistContent({
        requestId: invocation.requestId,
        userId: invocation.session.user.id,
        provider: invocation.provider,
        model: invocation.resolvedModel,
        requestType,
        keySource: invocation.keySource,
        status: status ?? 'success',
        errorCode,
        occurredAt: invocation.occurredAt,
        durationMs: this.resolveDurationMs(invocation.occurredAt),
        promptContent: messages,
        responseContent: upstreamResponse,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        providerCostUsd: billing?.providerCostUsd,
        platformFeeUsd: billing?.platformFeeUsd,
        chargedCostUsd: billing?.chargedCostUsd,
        chargedCurrency: billing?.chargedCurrency,
        chargedAmountMinor: billing?.chargedAmountMinor,
        pricingSource: billing?.pricingSource,
        pricingPolicySnapshotJson: billing?.pricingPolicySnapshotJson,
        walletLedgerEntryId: billing?.walletLedgerEntryId,
      })
      .catch((err) => {
        console.error('[ai-proxy] Failed to persist history content.', err);
      });
  }

  private async calculateAndDebitForInvocation(input: {
    invocation: PreparedProxyInvocation;
    usage?: AiProxyUsage;
    upstreamResponse?: Record<string, unknown>;
    status: 'success' | 'error' | 'quota_exceeded';
  }): Promise<BillingResult> {
    const providerCostFromUsage = extractProviderCostUsd(input.upstreamResponse);
    const estimatedProviderCost = estimateRequestCostUsd(
      input.invocation.resolvedModel,
      input.usage?.promptTokens ?? 0,
      input.usage?.completionTokens ?? 0,
    );
    const providerCostUsd = providerCostFromUsage ?? estimatedProviderCost;
    const pricingSource: 'provider' | 'estimated' = providerCostFromUsage !== null ? 'provider' : 'estimated';
    const breakdown = this.aiPricingService
      ? await this.aiPricingService.calculate({
        providerCostUsd,
        pricingSource,
        keySource: input.invocation.keySource,
        status: input.status,
      })
      : {
        providerCostUsd,
        platformFeeUsd: 0,
        chargedCostUsd: 0,
        pricingSource,
        policySnapshot: {
          enabled: false,
          markupPercent: 0,
          minimumFeeUsd: 0,
          roundingUsd: 0.000001,
          maxChargeUsd: null,
          chargeFailedRequests: 'never',
          chargeUserKeyRequests: 'never',
          displayEstimatedPriceToUser: false,
        },
        chargeable: false,
      };

    if (!breakdown.chargeable) {
      return {
        providerCostUsd: breakdown.providerCostUsd,
        platformFeeUsd: breakdown.platformFeeUsd,
        chargedCostUsd: 0,
        chargedCurrency: null,
        chargedAmountMinor: null,
        pricingSource: breakdown.pricingSource,
        pricingPolicySnapshotJson: breakdown.policySnapshot as unknown as Prisma.InputJsonValue,
        walletLedgerEntryId: null,
      };
    }

    const wallet = await this.walletRepository.findOrCreateWalletForUser(input.invocation.session.user.id);
    const conversion = this.convertUsdToWalletMinor({
      usdAmount: breakdown.chargedCostUsd,
      currency: wallet.currency,
    });
    const pricingPolicySnapshotJson: Prisma.InputJsonObject = {
      ...breakdown.policySnapshot,
      conversion: {
        walletCurrency: wallet.currency,
        chargedAmountMinor: conversion.chargedAmountMinor,
        usdToRubRate: conversion.usdToRubRate,
        source: conversion.source,
      },
    };

    let walletLedgerEntryId: string | null = null;
    if (breakdown.chargeable && conversion.chargedAmountMinor > 0) {
      if (wallet.balanceKopecks < conversion.chargedAmountMinor) {
        throw new ForbiddenException('Insufficient balance to settle AI usage charge.');
      }

      const debit = await this.walletRepository.debitUsage({
        userId: input.invocation.session.user.id,
        amountKopecks: conversion.chargedAmountMinor,
        currency: wallet.currency,
        description: `AI usage debit for request ${input.invocation.requestId}`,
        idempotencyKey: `ai-usage:${input.invocation.requestId}`,
        metadataJson: {
          provider: input.invocation.provider,
          model: input.invocation.resolvedModel,
          providerCostUsd: breakdown.providerCostUsd,
          platformFeeUsd: breakdown.platformFeeUsd,
          chargedCostUsd: breakdown.chargedCostUsd,
          chargedCurrency: wallet.currency,
          chargedAmountMinor: conversion.chargedAmountMinor,
          usdToRubRate: conversion.usdToRubRate,
          conversionSource: conversion.source,
        },
      });
      walletLedgerEntryId = debit.ledgerEntryId;
    }

    return {
      providerCostUsd: breakdown.providerCostUsd,
      platformFeeUsd: breakdown.platformFeeUsd,
      chargedCostUsd: breakdown.chargedCostUsd,
      chargedCurrency: wallet.currency,
      chargedAmountMinor: conversion.chargedAmountMinor,
      pricingSource: breakdown.pricingSource,
      pricingPolicySnapshotJson,
      walletLedgerEntryId,
    };
  }

  private convertUsdToWalletMinor(input: {
    usdAmount: number;
    currency: string;
  }): { chargedAmountMinor: number; usdToRubRate: number | null; source: 'env' | 'default' | 'identity' } {
    if (input.usdAmount <= 0) {
      return { chargedAmountMinor: 0, usdToRubRate: null, source: 'identity' };
    }

    if (input.currency === 'RUB') {
      const envRateRaw = process.env.BILLING_USD_TO_RUB_RATE;
      const parsed = envRateRaw ? Number(envRateRaw) : Number.NaN;
      const usdToRubRate = Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
      const source = Number.isFinite(parsed) && parsed > 0 ? 'env' : 'default';
      return {
        chargedAmountMinor: Math.ceil(input.usdAmount * usdToRubRate * 100),
        usdToRubRate,
        source,
      };
    }

    if (input.currency === 'USD') {
      return {
        chargedAmountMinor: Math.ceil(input.usdAmount * 100),
        usdToRubRate: null,
        source: 'identity',
      };
    }

    throw new BadRequestException(`Unsupported wallet currency for AI usage billing: ${input.currency}`);
  }

  private resolveProxyFailureCode(error: unknown): string {
    if (error instanceof HttpException && error.getStatus() === 429) {
      return 'provider_rate_limited';
    }

    if (error instanceof BadGatewayException) {
      return 'upstream_bad_gateway';
    }

    if (error instanceof ServiceUnavailableException) {
      return 'upstream_unavailable';
    }

    if (error instanceof ForbiddenException) {
      if (error.message.toLowerCase().includes('insufficient balance')) {
        return 'insufficient_balance';
      }
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
