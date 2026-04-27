import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { formatHistoryDuration } from '../src/app/app/history/history-duration';

test('usage latency formatter renders compact seconds', () => {
  assert.equal(formatHistoryDuration(13553), '13.6s');
  assert.equal(formatHistoryDuration(5640), '5.6s');
  assert.equal(formatHistoryDuration(20071), '20.1s');
  assert.equal(formatHistoryDuration(0), '0s');
  assert.equal(formatHistoryDuration(null), null);
});

test('usage page model latency column renders compact seconds', async () => {
  const source = await readFile(new URL('../src/app/app/usage/usage-page-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /formatHistoryDuration\(row\.avgDurationMs\) \?\? '—'/);
  assert.match(source, /formatHistoryDuration\(filteredTotals\.avgDurationMs\) \?\? '—'/);
});

test('usage page does not render raw ms latency text', async () => {
  const source = await readFile(new URL('../src/app/app/usage/usage-page-client.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /avgDurationMs\)}ms/);
  assert.doesNotMatch(source, /row\.avgDurationMs\)}ms/);
});
