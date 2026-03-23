import test from 'node:test';
import assert from 'node:assert/strict';

import { createHandshake } from '../../testing/src';
import {
  buildExtensionBootstrap,
  compareSemver,
  evaluateCompatibility,
  resolveFeatureFlags,
  resolveRemoteConfig,
} from '@quizmind/extension';

test('compareSemver compares version strings with different segment counts', () => {
  assert.equal(compareSemver('1.10.0', '1.2.9'), 1);
  assert.equal(compareSemver('1.2', '1.2.0'), 0);
  assert.equal(compareSemver('1.2.0', '1.2.1'), -1);
});

test('evaluateCompatibility covers minimum version, schema mismatch, capability gap, and supported cases', () => {
  const policy = {
    minimumVersion: '1.4.0',
    recommendedVersion: '1.6.0',
    supportedSchemaVersions: ['2'],
    requiredCapabilities: ['quiz-capture'],
  };

  assert.equal(evaluateCompatibility(createHandshake({ extensionVersion: '1.3.9' }), policy).status, 'unsupported');
  assert.equal(evaluateCompatibility(createHandshake({ schemaVersion: '1' }), policy).status, 'supported_with_warnings');
  assert.equal(evaluateCompatibility(createHandshake({ capabilities: [] }), policy).status, 'deprecated');
  assert.equal(evaluateCompatibility(createHandshake({ extensionVersion: '1.6.0' }), policy).status, 'supported');
});

test('resolveFeatureFlags and resolveRemoteConfig apply targeting and priority order', () => {
  const flags = resolveFeatureFlags(
    [
      { key: 'alpha', status: 'active', description: 'alpha', enabled: true, allowPlans: ['pro'] },
      { key: 'beta', status: 'paused', description: 'beta', enabled: true },
      { key: 'gamma', status: 'active', description: 'gamma', enabled: true, minimumExtensionVersion: '2.0.0' },
    ],
    { planCode: 'pro', extensionVersion: '1.5.0' },
  );

  const config = resolveRemoteConfig(
    [
      { id: 'base', scope: 'global', priority: 1, values: { theme: 'light', polls: false } },
      { id: 'plan', scope: 'plan', priority: 2, conditions: { planCode: 'pro' }, values: { polls: true } },
    ],
    { planCode: 'pro' },
  );

  assert.deepEqual(flags, ['alpha']);
  assert.deepEqual(config, { values: { theme: 'light', polls: true }, appliedLayerIds: ['base', 'plan'] });
});

test('buildExtensionBootstrap combines compatibility, flags, and config', () => {
  const payload = buildExtensionBootstrap({
    handshake: createHandshake({ extensionVersion: '1.6.0' }),
    compatibilityPolicy: {
      minimumVersion: '1.4.0',
      recommendedVersion: '1.6.0',
      supportedSchemaVersions: ['2'],
    },
    flagDefinitions: [{ key: 'alpha', status: 'active', description: 'alpha', enabled: true }],
    remoteConfigLayers: [{ id: 'base', scope: 'global', priority: 1, values: { enabled: true } }],
    context: { workspaceId: 'ws_1', userId: 'user_1', planCode: 'pro' },
  });

  assert.equal(payload.compatibility.status, 'supported');
  assert.deepEqual(payload.featureFlags, ['alpha']);
  assert.deepEqual(payload.remoteConfig.appliedLayerIds, ['base']);
});
