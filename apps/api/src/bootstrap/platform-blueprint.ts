import { type FeatureFlagDefinition, type PlanDefinition, type RemoteConfigLayer } from '@quizmind/contracts';

export const starterPlans: PlanDefinition[] = [
  {
    id: 'plan_free',
    code: 'free',
    name: 'Free',
    description: 'Starter access for individual users.',
    entitlements: [
      { key: 'feature.text_answering', enabled: true },
      { key: 'limit.requests_per_day', enabled: true, limit: 25 },
    ],
  },
  {
    id: 'plan_pro',
    code: 'pro',
    name: 'Pro',
    description: 'Expanded limits and premium extension controls.',
    entitlements: [
      { key: 'feature.text_answering', enabled: true },
      { key: 'feature.screenshot_answering', enabled: true },
      { key: 'feature.remote_sync', enabled: true },
      { key: 'limit.requests_per_day', enabled: true, limit: 500 },
    ],
  },
];

export const starterFlags: FeatureFlagDefinition[] = [
  {
    key: 'beta.remote-config-v2',
    status: 'active',
    description: 'Enable the second-generation remote config payload.',
    enabled: true,
    allowPlans: ['pro'],
    minimumExtensionVersion: '1.5.0',
  },
  {
    key: 'ops.force-upgrade-banner',
    status: 'active',
    description: 'Show banner when a client is below the recommended version.',
    enabled: true,
  },
];

export const starterRemoteConfig: RemoteConfigLayer[] = [
  {
    id: 'global-default',
    scope: 'global',
    priority: 10,
    values: {
      defaultModel: 'gpt-4.1-mini',
      screenshotEnabled: false,
      historyRetentionDays: 30,
    },
  },
  {
    id: 'plan-pro',
    scope: 'plan',
    priority: 20,
    conditions: {
      planCode: 'pro',
    },
    values: {
      screenshotEnabled: true,
      historyRetentionDays: 90,
    },
  },
  {
    id: 'flag-remote-config-v2',
    scope: 'flag',
    priority: 30,
    conditions: {
      activeFlags: ['beta.remote-config-v2'],
    },
    values: {
      configSchemaVersion: '2',
      defaultModel: 'gpt-4.1',
    },
  },
];
