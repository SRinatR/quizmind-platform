import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { formatHistoryDuration } from '../src/app/app/history/history-duration';

test('history detail modal renders billing card and keeps charge out of header tag row', async () => {
  const source = await readFile(new URL('../src/app/app/history/ai-request-detail-modal.tsx', import.meta.url), 'utf8');
  assert.match(source, /ai-detail-billing-card/);
  assert.match(source, /td\.billing/);
  assert.match(source, /td\.providerCost/);
  assert.match(source, /td\.platformFee/);
  assert.match(source, /td\.finalCharge/);
  assert.match(source, /td\.estimatedTotal/);
  assert.doesNotMatch(source, /tag-soft tag-soft--gray\">\{td\.chargedLabel/);
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
