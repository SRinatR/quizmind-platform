import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { convertDisplayCurrencyToUsd, convertUsdToDisplayCurrency } from '../src/lib/money';

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

test('pricing billing client renders redesigned pricing sections', async () => {
  const source = await readFile(pricingClientPath, 'utf8');
  assert.match(source, /pricingT\.chargingTitle/);
  assert.match(source, /pricingT\.platformFeeTitle/);
  assert.match(source, /pricingT\.limitsTitle/);
  assert.match(source, /pricingT\.failedRequestsTitle/);
  assert.match(source, /pricingT\.byokTitle/);
  assert.match(source, /pricingT\.previewTitle/);
  assert.match(source, /pricing-preview/);
});

test('pricing billing client converts USD policy values to display currency and back to USD', async () => {
  const source = await readFile(pricingClientPath, 'utf8');
  assert.match(source, /setMoneyDraft\(toMoneyDraft\(payload\.data\.policy, currency, exchangeRates\)\)/);
  assert.match(source, /convertDisplayCurrencyToUsd\(parsed, currency, exchangeRates\)/);
  assert.match(source, /body: JSON\.stringify\(draft\)/);
});

test('pricing billing client handles missing exchange rates and API failures with visible states', async () => {
  const source = await readFile(pricingClientPath, 'utf8');
  assert.match(source, /const currencyConversionUnavailable = useMemo\(\(\) => \{/);
  assert.match(source, /disabled=\{currencyConversionUnavailable\}/);
  assert.match(source, /pricingT\.missingRate/);
  assert.match(source, /if \(!res\.ok \|\| !payload\?\.ok \|\| !payload\.data\)/);
  assert.match(source, /\} finally \{\s*setLoading\(false\);\s*\}/s);
  assert.match(source, /onClick=\{\(\) => void loadPricingSettings\(\)\}/);
});

test('pricing billing reset to defaults action uses ghost button style (not secondary)', async () => {
  const source = await readFile(pricingClientPath, 'utf8');
  assert.match(source, /<button className="btn-ghost" type="button" disabled=\{saving\} onClick=\{onResetDefaults\}>\{pricingT\.resetDefaults\}<\/button>/);
  assert.doesNotMatch(source, /<button className="btn-secondary" type="button" disabled=\{saving\} onClick=\{onResetDefaults\}>\{pricingT\.resetDefaults\}<\/button>/);
});

test('currency conversion helpers round-trip RUB/EUR display values through USD policy values', () => {
  const rates = { USD: 90, EUR: 100 };
  const rubFromUsd = convertUsdToDisplayCurrency(1, 'RUB', rates);
  assert.equal(rubFromUsd, 90);
  assert.equal(convertDisplayCurrencyToUsd(rubFromUsd ?? 0, 'RUB', rates), 1);

  const eurFromUsd = convertUsdToDisplayCurrency(1, 'EUR', rates);
  assert.equal(eurFromUsd, 0.9);
  assert.equal(convertDisplayCurrencyToUsd(eurFromUsd ?? 0, 'EUR', rates), 1);
});
