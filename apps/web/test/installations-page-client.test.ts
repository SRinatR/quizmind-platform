import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app/app/installations/installations-page-client.tsx', import.meta.url), 'utf8');

test('installations page supports offline and signed-in/session metadata UI', () => {
  assert.match(source, /connectionStatus === 'connected'/);
  assert.match(source, /statusOffline/);
  assert.match(source, /ti\.signedIn/);
  assert.match(source, /ti\.sessionValidUntil/);
  assert.match(source, /ti\.sessionAutoRefresh/);
  assert.match(source, /getInstallationTitle/);
  assert.doesNotMatch(source, /Connected<\/span>\s*;\s*}\s*if \(status === 'expiring_soon'\)/);
});
