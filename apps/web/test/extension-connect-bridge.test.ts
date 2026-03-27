import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeBridgeMode,
  normalizeBridgeNonce,
  normalizeRelayUrl,
  normalizeTargetOrigin,
  resolveBridgeIssues,
} from '../src/app/app/extension/connect/connect-bridge';

test('normalizeTargetOrigin supports extension and https origins', () => {
  assert.equal(normalizeTargetOrigin('https://quizmind.app/path?x=1'), 'https://quizmind.app');
  assert.equal(
    normalizeTargetOrigin('chrome-extension://eeepcibgelnbhbnebmemabobdcnoliap/relay.html'),
    'chrome-extension://eeepcibgelnbhbnebmemabobdcnoliap',
  );
  assert.equal(normalizeTargetOrigin('javascript:alert(1)'), null);
});

test('normalizeBridgeNonce enforces length and charset', () => {
  assert.equal(normalizeBridgeNonce('nonce_12345'), 'nonce_12345');
  assert.equal(normalizeBridgeNonce('short'), null);
  assert.equal(normalizeBridgeNonce('nonce with spaces'), null);
});

test('normalizeBridgeMode falls back to bind_result', () => {
  assert.equal(normalizeBridgeMode('fallback_code'), 'fallback_code');
  assert.equal(normalizeBridgeMode('BIND_RESULT'), 'bind_result');
  assert.equal(normalizeBridgeMode('unsupported'), 'bind_result');
});

test('normalizeRelayUrl requires target origin and exact extension origin match', () => {
  const targetOrigin = 'chrome-extension://eeepcibgelnbhbnebmemabobdcnoliap';
  assert.equal(
    normalizeRelayUrl('chrome-extension://eeepcibgelnbhbnebmemabobdcnoliap/relay.html?mode=bind', targetOrigin),
    'chrome-extension://eeepcibgelnbhbnebmemabobdcnoliap/relay.html?mode=bind',
  );
  assert.equal(
    normalizeRelayUrl('chrome-extension://otherextensionid/relay.html', targetOrigin),
    null,
  );
  assert.equal(
    normalizeRelayUrl('chrome-extension://eeepcibgelnbhbnebmemabobdcnoliap/relay.html'),
    null,
  );
});

test('resolveBridgeIssues flags missing secure headers when relay is requested', () => {
  const result = resolveBridgeIssues({
    hasBridgeTarget: false,
    rawRelayUrl: 'chrome-extension://eeepcibgelnbhbnebmemabobdcnoliap/relay.html',
    resolvedRelayUrl: null,
    resolvedTargetOrigin: null,
    resolvedBridgeNonce: null,
  });

  assert.equal(result.bridgeSecurityIssue, 'Secure bridge requires a valid targetOrigin query parameter.');
  assert.equal(result.bridgeReturnChannelIssue, null);
});

test('resolveBridgeIssues reports no return channel when opener and relay are absent', () => {
  const result = resolveBridgeIssues({
    hasBridgeTarget: false,
    rawRelayUrl: undefined,
    resolvedRelayUrl: null,
    resolvedTargetOrigin: null,
    resolvedBridgeNonce: null,
  });

  assert.equal(result.bridgeSecurityIssue, null);
  assert.equal(
    result.bridgeReturnChannelIssue,
    'No bridge return channel detected. Configure extension launcher to keep opener/parent access or provide relayUrl.',
  );
});

test('resolveBridgeIssues passes when secure relay context is complete', () => {
  const result = resolveBridgeIssues({
    hasBridgeTarget: false,
    rawRelayUrl: 'chrome-extension://eeepcibgelnbhbnebmemabobdcnoliap/relay.html',
    resolvedRelayUrl: 'chrome-extension://eeepcibgelnbhbnebmemabobdcnoliap/relay.html',
    resolvedTargetOrigin: 'chrome-extension://eeepcibgelnbhbnebmemabobdcnoliap',
    resolvedBridgeNonce: 'nonce_12345',
  });

  assert.equal(result.bridgeSecurityIssue, null);
  assert.equal(result.bridgeReturnChannelIssue, null);
});
