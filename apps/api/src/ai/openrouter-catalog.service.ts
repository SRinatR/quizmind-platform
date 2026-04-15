import { Inject, Injectable } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import { type ProviderModelCatalogEntry } from '@quizmind/contracts';
import { decryptSecret, type EncryptedSecretEnvelope } from '@quizmind/secrets';

import { AiProxyRepository } from './ai-proxy.repository';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_FETCH_TIMEOUT_MS = 10_000;

interface OpenRouterModelEntry {
  id: string;
  name: string;
  description?: string;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModelEntry[];
}

interface CatalogCache {
  models: ProviderModelCatalogEntry[];
  fetchedAt: number;
}

function mapOpenRouterModel(entry: OpenRouterModelEntry): ProviderModelCatalogEntry {
  const inputModalities = entry.architecture?.input_modalities ?? [];
  const hasVision = inputModalities.includes('image');
  // Text is assumed when modalities are unspecified or text is listed
  const hasText = inputModalities.length === 0 || inputModalities.includes('text');

  const promptPrice = parseFloat(entry.pricing?.prompt ?? '0');
  const isFree = promptPrice === 0 || entry.id.endsWith(':free');

  const capabilityTags: string[] = [];
  if (hasText) capabilityTags.push('text');
  if (hasVision) capabilityTags.push('vision');
  if (isFree) capabilityTags.push('free');

  return {
    provider: 'openrouter',
    modelId: entry.id,
    displayName: entry.name,
    capabilityTags,
    availability: 'active',
    latencyClass: 'standard',
    planAvailability: ['free', 'pro', 'business'],
  };
}

function parseEncryptedEnvelope(value: unknown): EncryptedSecretEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    record.algorithm !== 'aes-256-gcm' ||
    record.keyVersion !== 'v1' ||
    typeof record.ciphertext !== 'string' ||
    typeof record.iv !== 'string' ||
    typeof record.authTag !== 'string'
  ) {
    return null;
  }

  return {
    algorithm: record.algorithm,
    keyVersion: record.keyVersion,
    ciphertext: record.ciphertext,
    iv: record.iv,
    authTag: record.authTag,
  };
}

@Injectable()
export class OpenRouterCatalogService {
  private readonly env = loadApiEnv();
  private cache: CatalogCache | null = null;

  constructor(
    @Inject(AiProxyRepository)
    private readonly aiProxyRepository: AiProxyRepository,
  ) {}

  /**
   * Resolves the platform-managed OpenRouter API key.
   * Mirrors the logic in AiProxyService.resolvePlatformKey for OpenRouter.
   * Returns null when no key is configured (rather than throwing), so callers
   * can fall back gracefully.
   */
  async resolvePlatformApiKey(): Promise<string | null> {
    const envKey = this.env.openRouterApiKey?.trim();

    if (envKey) {
      return envKey;
    }

    try {
      const credential = await this.aiProxyRepository.findLatestPlatformCredential({
        provider: 'openrouter',
      });

      if (!credential) {
        return null;
      }

      const envelope = parseEncryptedEnvelope(credential.encryptedSecretJson);

      if (!envelope) {
        return null;
      }

      return decryptSecret(envelope);
    } catch {
      return null;
    }
  }

  /**
   * Returns the live OpenRouter model catalog, cached for CACHE_TTL_MS.
   * Falls back to the previous cached value (or empty array) on fetch failure
   * so that a temporary OpenRouter outage does not break the platform.
   */
  async getLiveModels(): Promise<ProviderModelCatalogEntry[]> {
    const now = Date.now();

    if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.models;
    }

    const apiKey = await this.resolvePlatformApiKey();

    if (!apiKey) {
      // No platform key configured — cannot fetch live catalog.
      return this.cache?.models ?? [];
    }

    try {
      const response = await fetch(OPENROUTER_MODELS_URL, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(OPENROUTER_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.warn(
          JSON.stringify({
            eventType: 'openrouter_catalog.fetch_failed',
            status: response.status,
            occurredAt: new Date().toISOString(),
          }),
        );
        // Return stale cache if available.
        return this.cache?.models ?? [];
      }

      const body = (await response.json()) as OpenRouterModelsResponse;

      if (!Array.isArray(body?.data)) {
        return this.cache?.models ?? [];
      }

      const models = body.data
        .filter(
          (entry): entry is OpenRouterModelEntry =>
            typeof entry?.id === 'string' && entry.id.trim().length > 0,
        )
        .map(mapOpenRouterModel);

      this.cache = { models, fetchedAt: now };
      return models;
    } catch (error) {
      console.warn(
        JSON.stringify({
          eventType: 'openrouter_catalog.fetch_error',
          errorMessage: error instanceof Error ? error.message.slice(0, 256) : 'Unknown error',
          occurredAt: new Date().toISOString(),
        }),
      );
      // Return stale cache if available.
      return this.cache?.models ?? [];
    }
  }
}
