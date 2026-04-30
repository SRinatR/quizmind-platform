import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('appearance settings renders expanded currency options and approximation helper', async () => {
  const source = await readFile(new URL('../src/app/components/settings/appearance-settings-panel.tsx', import.meta.url), 'utf8');
  assert.match(source, /SUPPORTED_DISPLAY_CURRENCIES/);
  assert.match(source, /currencyApproximateNote/);
  assert.match(source, /UZS/);
  assert.match(source, /KZT/);
  assert.match(source, /GBP/);
});
