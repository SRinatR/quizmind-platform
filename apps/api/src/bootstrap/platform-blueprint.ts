import { type FeatureFlagDefinition, type RemoteConfigLayer } from '@quizmind/contracts';

export const starterFlags: FeatureFlagDefinition[] = [
  {
    key: 'beta.remote-config-v2',
    status: 'active',
    description: 'Enable the second-generation remote config payload.',
    enabled: true,
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
