import assert from 'node:assert/strict';
import test from 'node:test';

import { mapFeatureFlagRecordToDefinition } from '../src/services/feature-flags-service';

test('mapFeatureFlagRecordToDefinition exposes enabled user and workspace overrides as allow-lists', () => {
  const definition = mapFeatureFlagRecordToDefinition({
    key: 'beta.remote-config-v2',
    status: 'active',
    description: 'Enable the second-generation remote config payload.',
    enabled: true,
    rolloutPercentage: 100,
    allowRolesJson: ['admin', 'workspace_owner', 'invalid_role'],
    allowPlansJson: ['pro', 'business', 'pro'],
    minimumExtensionVersion: '1.5.0',
    overrides: [
      {
        id: 'override_user',
        featureFlagId: 'flag_1',
        userId: 'user_1',
        workspaceId: null,
        enabled: true,
        createdAt: new Date('2026-03-24T08:00:00.000Z'),
      },
      {
        id: 'override_workspace',
        featureFlagId: 'flag_1',
        userId: null,
        workspaceId: 'ws_1',
        enabled: true,
        createdAt: new Date('2026-03-24T08:00:00.000Z'),
      },
      {
        id: 'override_disabled',
        featureFlagId: 'flag_1',
        userId: 'user_2',
        workspaceId: 'ws_2',
        enabled: false,
        createdAt: new Date('2026-03-24T08:00:00.000Z'),
      },
    ],
  } as any);

  assert.deepEqual(definition.allowRoles, ['admin', 'workspace_owner']);
  assert.deepEqual(definition.allowPlans, ['pro', 'business']);
  assert.deepEqual(definition.allowUsers, ['user_1']);
  assert.deepEqual(definition.allowWorkspaces, ['ws_1']);
});
