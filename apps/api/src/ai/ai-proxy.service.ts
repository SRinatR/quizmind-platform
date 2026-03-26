import { randomUUID } from 'node:crypto';

import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import { type AiProxyRequest, type AiProxyResult, type AiProvider } from '@quizmind/contracts';
import { type Prisma } from '@quizmind/database';
import { providerRegistry } from '@quizmind/providers';
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
const supportedProxyProviders = new Set<AiProvider>(['openrouter']);
const knownProviders = new Set<AiProvider>(providerRegistry.map((provider) => provider.provider));
const supportedMessageRoles = new Set(['system', 'user', 'assistant', 'tool']);

type OpenRouterResponsePayload = Record<string, unknown>;

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
    const normalizedRequest = this.normalizeRequest(request);
    const workspace = this.resolveWorkspace(session, normalizedRequest.workspaceId);
    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace(workspace.id);
    const provider = (normalizedRequest.provider ?? policy.defaultProvider ?? policy.providers[0] ?? 'openrouter') as AiProvider;

    if (!policy.providers.includes(provider)) {
      throw new ForbiddenException(`Provider "${provider}" is not enabled by the current AI policy.`);
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
    const keySource = normalizedRequest.useOwnKey ? 'user' : 'platform';

    const apiKey =
      keySource === 'user'
        ? await this.resolveUserKey({
            provider,
            session,
            workspaceId: workspace.id,
            policy,
          })
        : this.resolvePlatformKey({
            provider,
            policy,
          });

    if (keySource === 'platform') {
      const usageDecision = evaluateUsageDecision({
        consumed: quotaCounter.consumed,
        limit: quotaLimit,
        quotaKey: aiRequestsQuotaKey,
      });

      if (!usageDecision.accepted) {
        throw new ForbiddenException(usageDecision.message ?? 'Workspace quota has been exhausted.');
      }
    }

    const upstreamResponse = await this.invokeOpenRouter({
      apiKey,
      model: normalizedRequest.model,
      messages: normalizedRequest.messages,
      temperature: normalizedRequest.temperature,
      maxTokens: normalizedRequest.maxTokens,
    });
    const usage = extractUsage(upstreamResponse);
    const nextCounter = await this.aiProxyRepository.recordProxyEvent({
      workspaceId: workspace.id,
      userId: session.user.id,
      requestId,
      provider,
      model: normalizedRequest.model,
      keySource,
      messageCount: normalizedRequest.messages.length,
      usage,
      responseId: typeof upstreamResponse.id === 'string' ? upstreamResponse.id : undefined,
      quotaKey: aiRequestsQuotaKey,
      periodStart: quotaCounter.periodStart,
      periodEnd: quotaCounter.periodEnd,
      consumeQuota: keySource === 'platform',
      occurredAt,
    });
    const consumed = keySource === 'platform' ? (nextCounter?.consumed ?? quotaCounter.consumed + 1) : quotaCounter.consumed;
    const remaining = typeof quotaLimit === 'number' ? Math.max(quotaLimit - consumed, 0) : undefined;

    return {
      requestId,
      workspaceId: workspace.id,
      provider,
      model: typeof upstreamResponse.model === 'string' ? upstreamResponse.model : normalizedRequest.model,
      keySource,
      ...(usage ? { usage } : {}),
      quota: {
        key: aiRequestsQuotaKey,
        consumed,
        ...(typeof quotaLimit === 'number' ? { limit: quotaLimit } : {}),
        ...(typeof remaining === 'number' ? { remaining } : {}),
        periodStart: quotaCounter.periodStart.toISOString(),
        periodEnd: quotaCounter.periodEnd.toISOString(),
        decremented: keySource === 'platform',
      },
      response: upstreamResponse,
    };
  }

  private normalizeRequest(request?: Partial<AiProxyRequest>) {
    if (!request) {
      throw new BadRequestException('Request body is required.');
    }

    if (request.stream === true) {
      throw new BadRequestException('Streaming AI proxy responses are not implemented yet. Use stream=false.');
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
      useOwnKey: request.useOwnKey === true,
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
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

  private resolvePlatformKey(input: {
    provider: AiProvider;
    policy: Awaited<ReturnType<AiProviderPolicyService['resolvePolicyForWorkspace']>>;
  }): string {
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
      throw new ServiceUnavailableException(
        'Platform OpenRouter credentials are not configured. Add OPENROUTER_API_KEY or use useOwnKey=true.',
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
      signal: AbortSignal.timeout(this.env.openRouterTimeoutMs),
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
