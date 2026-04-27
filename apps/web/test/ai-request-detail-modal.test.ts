import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('history detail modal renders cost badge when estimatedCostUsd is positive', async () => {
  const source = await readFile(new URL('../src/app/app/history/ai-request-detail-modal.tsx', import.meta.url), 'utf8');
  assert.match(source, /detail\.estimatedCostUsd > 0/);
  assert.match(source, /formatUsdAmountByPreference\(detail\.estimatedCostUsd/);
});
