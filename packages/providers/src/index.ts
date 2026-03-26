import {
  type AiAccessPolicy,
  type AiAccessPolicyMode,
  type AiProvider,
  type BillingProvider,
  type ProviderModelCatalogEntry,
  type ProviderCatalogPayload,
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

export interface ProviderSecretValidationResult {
  valid: boolean;
  normalizedSecret?: string;
  reason?: string;
}

export function getProviderCatalog(): ProviderCatalogPayload {
  return {
    providers: providerRegistry,
    models: providerModelCatalog,
  };
}

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
  allowWorkspaceSharedCredentials?: boolean;
  requireAdminApproval?: boolean;
  allowVisionOnUserKeys?: boolean;
  allowedModelTags?: string[];
  reason?: string;
} = {}): AiAccessPolicy {
  const mode = input.mode ?? 'platform_only';
  const providers = input.providers ?? ['openrouter'];

  return {
    mode,
    allowPlatformManaged: true,
    allowBringYourOwnKey: mode !== 'platform_only',
    allowDirectProviderMode: false,
    allowWorkspaceSharedCredentials: input.allowWorkspaceSharedCredentials ?? false,
    requireAdminApproval: input.requireAdminApproval ?? mode === 'admin_approved_user_key',
    allowVisionOnUserKeys: input.allowVisionOnUserKeys ?? false,
    providers,
    allowedModelTags: [...(input.allowedModelTags ?? [])].sort(),
    defaultProvider: input.defaultProvider ?? providers[0],
    defaultModel: input.defaultModel,
    reason: input.reason,
  };
}

export function validateProviderSecretShape(
  provider: AiProvider,
  secret: string,
): ProviderSecretValidationResult {
  const normalizedSecret = secret.trim();

  if (!normalizedSecret) {
    return {
      valid: false,
      reason: 'Provider secret is required.',
    };
  }

  if (normalizedSecret.length < 12) {
    return {
      valid: false,
      reason: 'Provider secret looks too short to be valid.',
    };
  }

  if (provider === 'internal') {
    return {
      valid: false,
      reason: 'Internal gateway credentials are platform-managed only.',
    };
  }

  if (provider === 'openai' && !normalizedSecret.startsWith('sk-')) {
    return {
      valid: false,
      reason: 'OpenAI keys usually start with "sk-".',
    };
  }

  if (provider === 'anthropic' && !normalizedSecret.startsWith('sk-ant-')) {
    return {
      valid: false,
      reason: 'Anthropic keys usually start with "sk-ant-".',
    };
  }

  if (provider === 'openrouter' && !normalizedSecret.startsWith('sk-or-')) {
    return {
      valid: false,
      reason: 'OpenRouter keys usually start with "sk-or-".',
    };
  }

  return {
    valid: true,
    normalizedSecret,
    reason: 'Provider secret passed local shape validation.',
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

  if (input.requestedProvider === 'yookassa') {
    return 'yookassa';
  }

  if (input.requestedProvider === 'paddle') {
    return 'paddle';
  }

  if (input.workspaceRegion === 'RU' || input.workspaceRegion === 'KZ' || input.workspaceRegion === 'UZ') {
    return 'yookassa';
  }

  if (input.currency?.toLowerCase() === 'invoice') {
    return 'manual';
  }

  if (input.currency?.toLowerCase() === 'rub') {
    return 'yookassa';
  }

  if (input.currency?.toLowerCase() === 'eur') {
    return 'paddle';
  }

  return 'stripe';
}
