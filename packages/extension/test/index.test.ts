import test from 'node:test';
import assert from 'node:assert/strict';

import { createHandshake } from '../../testing/src';
import {
  buildExtensionBootstrap,
  buildExtensionBootstrapV2,
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

test('buildExtensionBootstrapV2 adds entitlements, quota hints, and AI access policy', () => {
  const payload = buildExtensionBootstrapV2({
    installationId: 'inst_local_browser',
    workspaceId: 'ws_1',
    handshake: createHandshake({ extensionVersion: '1.6.0', schemaVersion: '2' }),
    compatibilityPolicy: {
      minimumVersion: '1.4.0',
      recommendedVersion: '1.6.0',
      supportedSchemaVersions: ['2'],
      requiredCapabilities: ['quiz-capture'],
    },
    flagDefinitions: [{ key: 'alpha', status: 'active', description: 'alpha', enabled: true }],
    remoteConfigLayers: [{ id: 'base', scope: 'global', priority: 1, values: { enabled: true } }],
    entitlements: [{ key: 'feature.text_answering', enabled: true }],
    quotaHints: [
      {
        key: 'limit.requests_per_day',
        label: 'Requests today',
        limit: 25,
        remaining: 10,
        status: 'healthy',
        enforcementMode: 'hard_limit',
      },
    ],
    aiAccessPolicy: {
      mode: 'platform_only',
      allowPlatformManaged: true,
      allowBringYourOwnKey: false,
      allowDirectProviderMode: false,
      providers: ['openrouter'],
      defaultProvider: 'openrouter',
      defaultModel: 'openrouter/auto',
    },
    context: { workspaceId: 'ws_1', userId: 'user_1', planCode: 'pro' },
    issuedAt: '2026-03-24T12:00:00.000Z',
    refreshAfterSeconds: 120,
  });

  assert.equal(payload.installationId, 'inst_local_browser');
  assert.equal(payload.compatibility.status, 'supported');
  assert.equal(payload.entitlements[0]?.key, 'feature.text_answering');
  assert.equal(payload.quotaHints[0]?.remaining, 10);
  assert.equal(payload.aiAccessPolicy.mode, 'platform_only');
  assert.equal(payload.refreshAfterSeconds, 120);
});
