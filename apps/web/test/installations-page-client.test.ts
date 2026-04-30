import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app/app/installations/installations-page-client.tsx', import.meta.url), 'utf8');
const ruSource = readFileSync(new URL('../src/lib/i18n/ru.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

test('installations page keeps offline installations visible while hiding reconnect_required', () => {
  assert.match(source, /connectionStatus !== 'reconnect_required'/);
  assert.match(source, /visibleItems = liveSnapshot\.items\.filter\(isVisibleInstallation\)/);
});

test('installations page renders title and subtitle on separate elements', () => {
  assert.match(source, /installation-row__device-title/);
  assert.match(source, /installation-row__device-subtitle/);
  assert.doesNotMatch(source, /installation-row__browser\}\<\/span>\s*<span className="installation-row__version"/);
});


test('installations layout uses stacked title/subtitle and keeps badge visible', () => {
  assert.match(source, /installation-row__device-info/);
  assert.match(source, /installation-row__device-title/);
  assert.match(source, /installation-row__device-subtitle/);
  assert.match(cssSource, /\.installation-row__device-info\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(cssSource, /\.installation-row__device-info\s*\{[\s\S]*min-width:\s*0/);
  assert.match(cssSource, /\.installation-row__badges\s*\{[\s\S]*flex-shrink:\s*0/);
});

test('installations title/subtitle are not concatenated into a single fallback string', () => {
  assert.doesNotMatch(source, /installation-row__device-title[^\n]*Extension\s*\$\{/);
});

test('russian dictionary includes rename copy', () => {
  assert.match(ruSource, /renameDevice:/);
  assert.match(ruSource, /deviceRenameHelp:/);
});

test('rename UI uses BFF label route and PATCH body', () => {
  assert.match(source, /\/bff\/extension\/installations\/\$\{installation\.installationId\}\/label/);
  assert.match(source, /method: 'PATCH'/);
  assert.match(source, /body: JSON\.stringify\(\{ deviceLabel: nextLabel \}\)/);
  assert.match(source, /saveRename\(installation, true\)/);
  assert.match(source, /deviceLabel: payload\.data\?\.deviceLabel \?\? undefined/);
});

test('rename UI does not use browser prompt and keeps title\/subtitle classes', () => {
  assert.doesNotMatch(source, /window\.prompt/);
  assert.match(source, /installation-row__device-title/);
  assert.match(source, /installation-row__device-subtitle/);
});
