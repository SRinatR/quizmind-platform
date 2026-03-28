import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveNextPath, withNextPath } from '../src/app/auth/search-params';

test('resolveNextPath accepts only relative in-app paths', () => {
  assert.equal(resolveNextPath('/app/extension/connect?mode=signup'), '/app/extension/connect?mode=signup');
  assert.equal(resolveNextPath('//evil.example/redirect'), '/app');
  assert.equal(resolveNextPath('https://evil.example/redirect'), '/app');
  assert.equal(resolveNextPath(undefined), '/app');
});

test('withNextPath appends safe next query param', () => {
  assert.equal(
    withNextPath('/auth/login', '/app/extension/connect?mode=signup'),
    '/auth/login?next=%2Fapp%2Fextension%2Fconnect%3Fmode%3Dsignup',
  );
  assert.equal(
    withNextPath('/auth/login?source=verify', '/app/extension/connect'),
    '/auth/login?source=verify&next=%2Fapp%2Fextension%2Fconnect',
  );
});

test('withNextPath ignores unsafe next values', () => {
  assert.equal(withNextPath('/auth/login', 'https://evil.example'), '/auth/login');
  assert.equal(withNextPath('/auth/login', '//evil.example'), '/auth/login');
  assert.equal(withNextPath('/auth/login', ''), '/auth/login');
});
