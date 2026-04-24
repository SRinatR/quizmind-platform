import { Inject, Injectable } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import { type ProviderModelCatalogEntry } from '@quizmind/contracts';
import { listModelsForProvider } from '@quizmind/providers';
import { decryptSecret, type EncryptedSecretEnvelope } from '@quizmind/secrets';

import { AiProxyRepository } from './ai-proxy.repository';

const CACHE_TTL_MS = 10 * 60 * 1000;
const ROUTERAI_FETCH_TIMEOUT_MS = 10_000;

interface RouterAiCatalogCache {
  models: ProviderModelCatalogEntry[];
  fetchedAt: number;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function parseEncryptedEnvelope(value: unknown): EncryptedSecretEnvelope | null {
  const record = readRecord(value);

  if (
    !record ||
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

export function normalizeRouterAiCatalogPayload(payload: unknown): ProviderModelCatalogEntry[] {
  const directArray = Array.isArray(payload) ? payload : null;
  const objectData = readRecord(payload)?.data;
  const nestedArrayData = Array.isArray(payload) ? readRecord(payload[0])?.data : undefined;
  const entries = (Array.isArray(objectData) ? objectData : null) ?? (Array.isArray(nestedArrayData) ? nestedArrayData : null) ?? directArray ?? [];

  const models: ProviderModelCatalogEntry[] = [];

  for (const rawEntry of entries) {
    const entry = readRecord(rawEntry);

    if (!entry) {
      continue;
    }

    const id = typeof entry.id === 'string' ? entry.id.trim() : '';

    if (!id) {
      continue;
    }

    const name = typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim() : id;
    const architecture = readRecord(entry.architecture);
    const inputModalities = readStringArray(architecture?.input_modalities).map((item) => item.toLowerCase());
    const outputModalities = readStringArray(architecture?.output_modalities).map((item) => item.toLowerCase());
    const modality = typeof architecture?.modality === 'string' ? architecture.modality.toLowerCase() : '';
    const supportedParameters = readStringArray(entry.supported_parameters).map((item) => item.toLowerCase());
    const searchText = `${id} ${name}`.toLowerCase();

    const hasVision =
      inputModalities.includes('image') ||
      outputModalities.includes('image') ||
      modality.includes('image') ||
      supportedParameters.some((parameter) => parameter.includes('image')) ||
      /\b(vision|vl|gemini|gpt-4o|claude-3\.5-sonnet)\b/.test(searchText);
    const hasText =
      inputModalities.length === 0 ||
      inputModalities.includes('text') ||
      modality.includes('text') ||
      outputModalities.includes('text');
    const capabilityTags: string[] = [];

    if (hasText) {
      capabilityTags.push('text');
    }

    if (hasVision) {
      capabilityTags.push('vision');
    }

    models.push({
      provider: 'routerai',
      modelId: id,
      displayName: name,
      capabilityTags,
      availability: 'active',
      latencyClass: 'standard',
      planAvailability: ['free', 'pro', 'business'],
    });
  }

  return models;
}

@Injectable()
export class RouterAiCatalogService {
  private readonly env = loadApiEnv();
  private cache: RouterAiCatalogCache | null = null;

  constructor(
    @Inject(AiProxyRepository)
    private readonly aiProxyRepository: AiProxyRepository,
  ) {}

  async resolvePlatformApiKey(): Promise<string | null> {
    const envKey = this.env.routerAiApiKey?.trim();

    if (envKey) {
      return envKey;
    }

    try {
      const credential = await this.aiProxyRepository.findLatestPlatformCredential({
        provider: 'routerai',
      });

      if (!credential) {
        return null;
      }

      const envelope = parseEncryptedEnvelope(credential.encryptedSecretJson);

      if (!envelope) {
        return null;
      }

      return decryptSecret({ envelope, secret: this.env.providerCredentialSecret });
    } catch {
      return null;
    }
  }

  async getLiveModels(): Promise<ProviderModelCatalogEntry[]> {
    const now = Date.now();

    if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.models;
    }

    try {
      const apiKey = await this.resolvePlatformApiKey();
      const response = await fetch(`${this.env.routerAiApiUrl.replace(/\/$/, '')}/models`, {
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(ROUTERAI_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.warn(
          JSON.stringify({
            eventType: 'routerai_catalog.fetch_failed',
            status: response.status,
            occurredAt: new Date().toISOString(),
          }),
        );
        return this.cache?.models ?? [];
      }

      const models = normalizeRouterAiCatalogPayload(await response.json());

      if (models.length === 0) {
        return this.cache?.models ?? [];
      }

      this.cache = { models, fetchedAt: now };
      return models;
    } catch (error) {
      console.warn(
        JSON.stringify({
          eventType: 'routerai_catalog.fetch_error',
          errorMessage: error instanceof Error ? error.message.slice(0, 256) : 'Unknown error',
          occurredAt: new Date().toISOString(),
        }),
      );
      return this.cache?.models ?? [];
    }
  }

  async getCredits(): Promise<number | null> {
    try {
      const apiKey = await this.resolvePlatformApiKey();

      if (!apiKey) {
        return null;
      }

      const response = await fetch(`${this.env.routerAiApiUrl.replace(/\/$/, '')}/credits`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(ROUTERAI_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        return null;
      }

      const body = readRecord(await response.json());
      const credits = body?.credits;

      return typeof credits === 'number' && Number.isFinite(credits) ? credits : null;
    } catch {
      return null;
    }
  }

  getFallbackModels(): ProviderModelCatalogEntry[] {
    return listModelsForProvider('routerai');
  }
}
