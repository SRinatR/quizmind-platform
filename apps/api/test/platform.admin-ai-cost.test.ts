import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeAdminAiEstimatedCostUsd } from '../src/platform.service';

test('normalizeAdminAiEstimatedCostUsd preserves positive values', () => {
  assert.equal(normalizeAdminAiEstimatedCostUsd(0.003778), 0.003778);
});

test('normalizeAdminAiEstimatedCostUsd keeps missing/zero values absent', () => {
  assert.equal(normalizeAdminAiEstimatedCostUsd(undefined), undefined);
  assert.equal(normalizeAdminAiEstimatedCostUsd(null), undefined);
  assert.equal(normalizeAdminAiEstimatedCostUsd(0), undefined);
});
