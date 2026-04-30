import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app/app/installations/installations-page-client.tsx', import.meta.url), 'utf8');
const ruSource = readFileSync(new URL('../src/lib/i18n/ru.ts', import.meta.url), 'utf8');

test('installations page keeps offline installations visible while hiding reconnect_required', () => {
  assert.match(source, /connectionStatus !== 'reconnect_required'/);
  assert.doesNotMatch(source, /connectionStatus === 'connected' \|\| installation\.connectionStatus === 'expiring_soon'\) && installation\.requiresReconnect !== true/);
});

test('installations page renders title and subtitle on separate elements', () => {
  assert.match(source, /installation-row__device-title/);
  assert.match(source, /installation-row__device-subtitle/);
  assert.doesNotMatch(source, /installation-row__browser\}\<\/span>\s*<span className="installation-row__version"/);
});

test('russian dictionary includes rename copy', () => {
  assert.match(ruSource, /renameDevice:/);
  assert.match(ruSource, /deviceRenameHelp:/);
});
