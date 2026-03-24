import {
  type AiAccessPolicy,
  type AiAccessPolicyMode,
  type AiProvider,
  type BillingProvider,
  type ProviderModelCatalogEntry,
  type ProviderRegistryEntry,
} from '@quizmind/contracts';

export const providerRegistry: ProviderRegistryEntry[] = [
  {
    provider: 'openrouter',
    displayName: 'OpenRouter',
    availability: 'active',
    supportsProxy: true,
    supportsBringYourOwnKey: true,
  },
  {
    provider: 'openai',
    displayName: 'OpenAI',
    availability: 'active',
    supportsProxy: true,
    supportsBringYourOwnKey: true,
  },
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    availability: 'beta',
    supportsProxy: true,
    supportsBringYourOwnKey: true,
  },
  {
    provider: 'internal',
    displayName: 'QuizMind Gateway',
    availability: 'beta',
    supportsProxy: true,
    supportsBringYourOwnKey: false,
  },
];

export const providerModelCatalog: ProviderModelCatalogEntry[] = [
  {
    provider: 'openrouter',
    modelId: 'openrouter/auto',
    displayName: 'OpenRouter Auto',
    capabilityTags: ['text', 'routing'],
    availability: 'active',
    latencyClass: 'low',
    planAvailability: ['free', 'pro', 'business'],
  },
  {
    provider: 'openai',
    modelId: 'gpt-4.1-mini',
    displayName: 'GPT-4.1 Mini',
    capabilityTags: ['text', 'vision'],
    availability: 'active',
    latencyClass: 'standard',
    planAvailability: ['pro', 'business'],
  },
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4',
    displayName: 'Claude Sonnet 4',
    capabilityTags: ['text', 'vision'],
    availability: 'beta',
    latencyClass: 'standard',
    planAvailability: ['business'],
  },
];

export function listModelsForProvider(provider: AiProvider): ProviderModelCatalogEntry[] {
  return providerModelCatalog.filter((entry) => entry.provider === provider);
}

export function listAvailableModelsForPlan(planCode?: string): ProviderModelCatalogEntry[] {
  if (!planCode) {
    return providerModelCatalog;
  }

  return providerModelCatalog.filter((entry) => {
    if (!entry.planAvailability || entry.planAvailability.length === 0) {
      return true;
    }

    return entry.planAvailability.includes(planCode);
  });
}

export function buildDefaultAiAccessPolicy(input: {
  mode?: AiAccessPolicyMode;
  providers?: AiProvider[];
  defaultProvider?: AiProvider;
  defaultModel?: string;
  reason?: string;
} = {}): AiAccessPolicy {
  const mode = input.mode ?? 'platform_only';
  const providers = input.providers ?? ['openrouter'];

  return {
    mode,
    allowPlatformManaged: true,
    allowBringYourOwnKey: mode !== 'platform_only',
    allowDirectProviderMode: false,
    providers,
    defaultProvider: input.defaultProvider ?? providers[0],
    defaultModel: input.defaultModel,
    reason: input.reason,
  };
}

export function resolveBillingProvider(input: {
  requestedProvider?: BillingProvider;
  workspaceRegion?: string;
  currency?: string;
  manualInvoicing?: boolean;
}): BillingProvider {
  if (input.requestedProvider === 'manual' || input.manualInvoicing) {
    return 'manual';
  }

  if (input.requestedProvider === 'mock') {
    return 'mock';
  }

  if (input.currency?.toLowerCase() === 'invoice') {
    return 'manual';
  }

  return 'stripe';
}
