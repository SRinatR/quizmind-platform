import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readStringListSearchParam,
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
