import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { formatBalanceFromKopecks, formatDisplayMoneyFromRubMinor, formatMinorCurrencyAmount } from '../src/lib/money';

test('balance formatter keeps kopeck precision for RUB wallet balances', () => {
  assert.equal(formatBalanceFromKopecks(273, 'RUB'), '2,73\u00a0₽');
  assert.equal(formatBalanceFromKopecks(27, 'RUB'), '0,27\u00a0₽');
  assert.equal(formatBalanceFromKopecks(300, 'RUB'), '3\u00a0₽');
  assert.equal(formatMinorCurrencyAmount(273, 'RUB'), '2,73\u00a0₽');
});



test('charged display conversion from RUB minor respects selected display currency', () => {
  const rates = { base: 'RUB', timestamp: '2026-01-01T00:00:00.000Z', rates: { RUB: 1, UZS: 0.01, USD: 80 } };
  assert.equal(formatDisplayMoneyFromRubMinor({ amountMinor: 27, displayCurrency: 'RUB', rates }), '0,27 ₽');
  const uzs = formatDisplayMoneyFromRubMinor({ amountMinor: 27, displayCurrency: 'UZS', rates });
  assert.match(uzs, /UZS|soʻm|сум/);
  assert.doesNotMatch(uzs, /₽/);
});

test('history timeline prefers charged RUB minor amount and falls back to estimate', async () => {
  const source = await readFile(new URL('../src/app/app/history/history-page-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /chargedCurrency === 'RUB'/);
  assert.match(source, /formatDisplayMoneyFromRubMinor/);
  assert.match(source, /chargedAmountMinor/);
  assert.match(source, /approximateLabel/);
  assert.match(source, /history-price-pill/);
  assert.match(source, /history-price-pill--charged/);
  assert.match(source, /history-price-pill--estimated/);
  assert.doesNotMatch(source, /priceMeta \? <span className="tag-soft tag-soft--gray">/);
});

test('detail modal renders user-facing charged and approximate cost without internal breakdown rows', async () => {
  const source = await readFile(new URL('../src/app/app/history/ai-request-detail-modal.tsx', import.meta.url), 'utf8');
  assert.match(source, /costMeta/);
  assert.match(source, /ai-detail-price-chip/);
  assert.match(source, /td\.chargedLabel/);
  assert.match(source, /td\.approximateLabel/);
  assert.doesNotMatch(source, /td\.providerCost/);
  assert.doesNotMatch(source, /td\.platformFee/);
});

test('russian billing labels exist for history and detail pricing', async () => {
  const source = await readFile(new URL('../src/lib/i18n/ru.ts', import.meta.url), 'utf8');
  assert.match(source, /chargedLabel: 'Списано'/);
  assert.match(source, /approximateLabel: 'Примерно'/);
  assert.match(source, /cost: 'Стоимость'/);
  assert.match(source, /chargedToBalance: 'Списано с баланса'/);
  assert.match(source, /approximateCost: 'Примерная стоимость'/);
  assert.match(source, /notChargedHelper: 'По этому запросу списание с баланса не создавалось\.'/);
});
