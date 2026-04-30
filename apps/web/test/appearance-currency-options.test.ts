import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('appearance settings currency labels come from i18n and no hardcoded english labels remain', async () => {
  const source = await readFile(new URL('../src/app/components/settings/appearance-settings-panel.tsx', import.meta.url), 'utf8');
  assert.match(source, /SUPPORTED_DISPLAY_CURRENCIES/);
  assert.match(source, /s\.currencyNames\[code\]/);
  assert.doesNotMatch(source, /Russian ruble/);
  assert.doesNotMatch(source, /US dollar/);
  assert.doesNotMatch(source, /British pound/);
});

test('ru i18n defines natural currency labels', async () => {
  const ru = await readFile(new URL('../src/lib/i18n/ru.ts', import.meta.url), 'utf8');
  assert.match(ru, /currencyNames:/);
  assert.match(ru, /RUB — российский рубль/);
  assert.match(ru, /USD — доллар США/);
  assert.match(ru, /KZT — казахстанский тенге/);
  assert.match(ru, /GBP — британский фунт/);
});


test('appearance currency selector uses a compact dropdown select', async () => {
  const source = await readFile(new URL('../src/app/components/settings/appearance-settings-panel.tsx', import.meta.url), 'utf8');
  assert.match(source, /className="currency-select"/);
  assert.match(source, /<select/);
  assert.doesNotMatch(source, /type="radio"\s*name="balanceCurrency"/);
});
