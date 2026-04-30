import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { formatBalanceFromKopecks, formatMinorCurrencyAmount } from '../src/lib/money';

test('balance formatter keeps kopeck precision for RUB wallet balances', () => {
  assert.equal(formatBalanceFromKopecks(273, 'RUB'), '2,73\u00a0₽');
  assert.equal(formatBalanceFromKopecks(27, 'RUB'), '0,27\u00a0₽');
  assert.equal(formatBalanceFromKopecks(300, 'RUB'), '3\u00a0₽');
  assert.equal(formatMinorCurrencyAmount(273, 'RUB'), '2,73\u00a0₽');
});

test('history timeline prefers charged RUB minor amount and falls back to estimate', async () => {
  const source = await readFile(new URL('../src/app/app/history/history-page-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /chargedCurrency === 'RUB'/);
  assert.match(source, /chargedAmountMinor/);
  assert.match(source, /estimatedLabel/);
  assert.match(source, /history-price-pill/);
  assert.match(source, /history-price-pill--charged/);
  assert.match(source, /history-price-pill--estimated/);
  assert.doesNotMatch(source, /priceMeta \? <span className="tag-soft tag-soft--gray">/);
});

test('detail modal renders charged RUB amount and explicit estimated fallback checks', async () => {
  const source = await readFile(new URL('../src/app/app/history/ai-request-detail-modal.tsx', import.meta.url), 'utf8');
  assert.match(source, /headerPill/);
  assert.match(source, /history-price-pill--charged/);
  assert.match(source, /history-price-pill--estimated/);
  assert.match(source, /ai-detail-billing-card/);
  assert.match(source, /td\.providerCost/);
  assert.match(source, /td\.platformFee/);
  assert.match(source, /td\.finalCharge|td\.estimatedTotal/);
});

test('russian billing labels exist for history and detail pricing', async () => {
  const source = await readFile(new URL('../src/lib/i18n/ru.ts', import.meta.url), 'utf8');
  assert.match(source, /chargedLabel: 'Списано'/);
  assert.match(source, /estimatedTotal: 'Оценка'/);
  assert.match(source, /billing: 'Расходы'/);
  assert.match(source, /providerCost: 'Стоимость провайдера'/);
  assert.match(source, /platformFee: 'Комиссия платформы'/);
  assert.match(source, /finalCharge: 'Итоговое списание'/);
});
