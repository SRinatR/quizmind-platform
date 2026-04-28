import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const pricingClientPath = path.resolve(process.cwd(), 'src/app/admin/[section]/pricing-billing-client.tsx');

test('pricing billing client uses absolute same-origin BFF endpoint constant', async () => {
  const source = await readFile(pricingClientPath, 'utf8');
  assert.match(source, /const AI_PRICING_SETTINGS_ENDPOINT = '\/bff\/admin\/settings\/ai-pricing';/);
  assert.doesNotMatch(source, /'\/app\/bff\/admin\/settings\/ai-pricing'/);
  assert.doesNotMatch(source, /fetch\('bff\/admin\/settings\/ai-pricing'/);
  assert.doesNotMatch(source, /fetch\('\.\/bff\/admin\/settings\/ai-pricing'/);
});

test('pricing billing client GET and PATCH call the same endpoint', async () => {
  const source = await readFile(pricingClientPath, 'utf8');
  assert.match(source, /fetch\(AI_PRICING_SETTINGS_ENDPOINT, \{ cache: 'no-store' \}\)/);
  assert.match(source, /fetch\(AI_PRICING_SETTINGS_ENDPOINT, \{\s*method: 'PATCH'/s);
});

test('pricing billing client renders form on successful GET payload', async () => {
  const source = await readFile(pricingClientPath, 'utf8');
  assert.match(source, /setState\(payload\.data\)/);
  assert.match(source, /setDraft\(payload\.data\.policy\)/);
  assert.match(source, /<h3>AI Request Pricing<\/h3>/);
});

test('pricing billing client surfaces visible error and retry when GET fails', async () => {
  const source = await readFile(pricingClientPath, 'utf8');
  assert.match(source, /if \(!res\.ok \|\| !payload\?\.ok \|\| !payload\.data\)/);
  assert.match(source, /setError\(toRequestErrorMessage\(res\.status, 'Failed to load pricing settings\.', payload\?\.error\?\.message\)\)/);
  assert.match(source, /Retry/);
  assert.match(source, /onClick=\{\(\) => void loadPricingSettings\(\)\}/);
});

test('pricing billing client always clears loading after failed fetch and malformed responses', async () => {
  const source = await readFile(pricingClientPath, 'utf8');
  assert.match(source, /try \{/);
  assert.match(source, /\} catch \{/);
  assert.match(source, /\} finally \{\s*setLoading\(false\);\s*\}/s);
  assert.match(source, /await res\.json\(\)\.catch\(\(\) => null\)/);
});
