import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('logs explorer Event column renders only summary in table rows', async () => {
  const source = await readFile(new URL('../src/app/admin/[section]/logs-explorer-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /<div style=\{\{ fontSize: '0\.76rem', lineHeight: 1\.25 \}\}>\{item\.summary\}<\/div>/);
  assert.doesNotMatch(source, /\{item\.eventType\}<\/div>/);
});

test('admin detail uses history prompt display and keeps technical metadata collapsed', async () => {
  const source = await readFile(new URL('../src/app/admin/[section]/logs-explorer-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /buildHistoryPromptDisplay\(\{/);
  assert.match(source, /prefs\.balanceDisplayCurrency/);
  assert.match(source, /formatCost\(item\.costUsd, prefs\.balanceDisplayCurrency, exchangeRates\)/);
  assert.match(source, /\{targetLabel\(item\)\}/);
  assert.match(source, /Technical log metadata/);
  assert.match(source, /Source record id/);
  assert.match(source, /Target id/);
  assert.match(source, /Image expired after retention window\./);
});

test('admin logs page passes initial cursor to LogsExplorerClient filters', async () => {
  const source = await readFile(new URL('../src/app/admin/[section]/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /cursor: adminLogFilters\.cursor/);
});
