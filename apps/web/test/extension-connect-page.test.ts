import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeHttpOriginSearchParam,
  readStringListSearchParam,
  resolvePlatformOriginValidation,
  resolveStrictPlatformOriginMode,
  resolveAuthMode,
} from '../src/app/app/extension/connect/connect-query';

test('readStringListSearchParam parses JSON capability arrays from query params', () => {
  const parsed = readStringListSearchParam('["runtime.chat","runtime.answer","relay.query_payload"]');

  assert.deepEqual(parsed, ['runtime.chat', 'runtime.answer', 'relay.query_payload']);
});

test('readStringListSearchParam parses CSV capability values and normalizes bracketed tokens', () => {
  const parsed = readStringListSearchParam([
    '["runtime.chat","runtime.answer"]',
    'runtime.screenshot, "runtime.multicheck", [runtime.models.read], relay.query_payload',
  ]);

  assert.deepEqual(parsed, [
    'runtime.chat',
    'runtime.answer',
    'runtime.screenshot',
    'runtime.multicheck',
    'runtime.models.read',
    'relay.query_payload',
  ]);
});

test('resolveAuthMode supports signup mode and safely falls back to login', () => {
  assert.equal(resolveAuthMode('signup'), 'signup');
  assert.equal(resolveAuthMode('SIGNUP'), 'signup');
  assert.equal(resolveAuthMode('login'), 'login');
  assert.equal(resolveAuthMode('unsupported'), 'login');
  assert.equal(resolveAuthMode(undefined), 'login');
});

test('normalizeHttpOriginSearchParam normalizes only http(s) origins', () => {
  assert.equal(
    normalizeHttpOriginSearchParam('https://quizmind.app/app/extension/connect?mode=signup'),
    'https://quizmind.app',
  );
  assert.equal(normalizeHttpOriginSearchParam('chrome-extension://abcdefghijklmnopabcdefghijklmnop'), undefined);
  assert.equal(normalizeHttpOriginSearchParam('invalid origin'), undefined);
});

test('resolveStrictPlatformOriginMode defaults to production strict mode', () => {
  assert.equal(resolveStrictPlatformOriginMode(undefined, 'production'), true);
  assert.equal(resolveStrictPlatformOriginMode(undefined, 'development'), false);
  assert.equal(resolveStrictPlatformOriginMode('true', 'development'), true);
  assert.equal(resolveStrictPlatformOriginMode('false', 'production'), false);
});

test('resolvePlatformOriginValidation blocks mismatches in strict mode and warns in optional mode', () => {
  const strict = resolvePlatformOriginValidation({
    declaredPlatformOrigin: 'https://quizmind.app',
    configuredPlatformOrigin: 'https://staging.quizmind.app',
    strictMode: true,
  });

  assert.equal(strict.warning, null);
  assert.match(strict.securityIssue ?? '', /Bridge connect is blocked/i);

  const optional = resolvePlatformOriginValidation({
    declaredPlatformOrigin: 'https://quizmind.app',
    configuredPlatformOrigin: 'https://staging.quizmind.app',
    strictMode: false,
  });

  assert.equal(optional.securityIssue, null);
  assert.match(optional.warning ?? '', /Bridge URL declares platformOrigin=/i);

  const match = resolvePlatformOriginValidation({
    declaredPlatformOrigin: 'https://quizmind.app',
    configuredPlatformOrigin: 'https://quizmind.app',
    strictMode: true,
  });

  assert.equal(match.warning, null);
  assert.equal(match.securityIssue, null);
});
