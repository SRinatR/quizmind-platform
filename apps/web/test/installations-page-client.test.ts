import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app/app/installations/installations-page-client.tsx', import.meta.url), 'utf8');
const ruSource = readFileSync(new URL('../src/lib/i18n/ru.ts', import.meta.url), 'utf8');

test('installations page filters stale/offline installations from user-facing list', () => {
  assert.match(source, /connectionStatus === 'connected' \|\| installation\.connectionStatus === 'expiring_soon'/);
  assert.doesNotMatch(source, /connectionStatus !== 'reconnect_required'/);
});

test('installations page uses clean title/subtitle fallback formatting', () => {
  assert.match(source, /return `\$\{browserDisplay\} extension`;/);
  assert.match(source, /const parts: string\[] = \[`Extension \$\{installation\.extensionVersion\}`\];/);
  assert.doesNotMatch(source, /return `\$\{installation\.browser\} v\$\{installation\.extensionVersion\}`;/);
  assert.match(source, /if \(rawName === 'chrome'\) return 'Chrome';/);
});

test('installations page retains signed-in and session metadata rows', () => {
  assert.match(source, /ti\.signedIn/);
  assert.match(source, /ti\.sessionValidUntil/);
});

test('russian dictionary includes active-installation empty state and stale-extension copy', () => {
  assert.match(ruSource, /noInstallations: 'Нет активных подключений расширения'/);
  assert.match(ruSource, /removedExtensionsDisappear:/);
});
