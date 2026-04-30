import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { formatHistoryDuration } from '../src/app/app/history/history-duration';

test('history detail modal renders charged/approximate price chip in header tag row', async () => {
  const source = await readFile(new URL('../src/app/app/history/ai-request-detail-modal.tsx', import.meta.url), 'utf8');
  assert.match(source, /ai-detail-price-chip/);
  assert.match(source, /ai-detail-price-chip--charged/);
  assert.match(source, /ai-detail-price-chip--approximate/);
  assert.match(source, /td\.chargedLabel/);
  assert.match(source, /td\.approximateLabel/);
});

test('history detail modal no longer renders large cost card or helper texts', async () => {
  const source = await readFile(new URL('../src/app/app/history/ai-request-detail-modal.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /ai-detail-cost-card/);
  assert.doesNotMatch(source, /td\.cost/);
  assert.doesNotMatch(source, /td\.chargedToBalance/);
  assert.doesNotMatch(source, /td\.finalAmountHelper/);
  assert.doesNotMatch(source, /td\.notChargedHelper/);
});

test('history detail modal keeps provider/platform internals hidden', async () => {
  const source = await readFile(new URL('../src/app/app/history/ai-request-detail-modal.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /td\.providerCost/);
  assert.doesNotMatch(source, /td\.platformFee/);
  assert.doesNotMatch(source, /td\.finalCharge|td\.estimatedTotal/);
});

test('globals include price chip classes', async () => {
  const source = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  assert.match(source, /\.ai-detail-price-chip\s*\{/);
  assert.match(source, /\.ai-detail-price-chip--charged\s*\{/);
  assert.match(source, /\.ai-detail-price-chip--approximate\s*\{/);
});

test('formats durationMs as compact seconds for AI history', () => {
  assert.equal(formatHistoryDuration(10256), '10.3s');
  assert.equal(formatHistoryDuration(27500), '27.5s');
  assert.equal(formatHistoryDuration(0), '0s');
});

test('formats sub-second durations in seconds, not raw milliseconds', () => {
  assert.equal(formatHistoryDuration(500), '0.5s');
  assert.equal(formatHistoryDuration(1), '0.1s');
});

test('null or undefined duration returns null so badge is omitted', () => {
  assert.equal(formatHistoryDuration(null), null);
  assert.equal(formatHistoryDuration(undefined), null);
});

test('history detail modal no longer renders raw ms duration badge', async () => {
  const source = await readFile(new URL('../src/app/app/history/ai-request-detail-modal.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /durationMs\}\s*ms/);
  assert.match(source, /formattedDuration != null/);
});
