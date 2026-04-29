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
  assert.match(source, /td\.technicalMetadata/);
  assert.match(source, /td\.sourceRecordId/);
  assert.match(source, /td\.targetId/);
  assert.match(source, /td\.imageExpired/);
});

test('admin detail drawer uses RU/EN i18n keys for localized labels', async () => {
  const source = await readFile(new URL('../src/app/admin/[section]/logs-explorer-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /td\.aiRequestDetail/);
  assert.match(source, /td\.logDetail/);
  assert.match(source, /td\.requestQuestion/);
  assert.match(source, /td\.response/);
  assert.match(source, /td\.copy/);
});

test('admin logs page passes initial cursor to LogsExplorerClient filters', async () => {
  const source = await readFile(new URL('../src/app/admin/[section]/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /cursor: adminLogFilters\.cursor/);
});
