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
  assert.match(source, /approximateLabel/);
  assert.match(source, /history-price-pill/);
  assert.match(source, /history-price-pill--charged/);
  assert.match(source, /history-price-pill--estimated/);
  assert.doesNotMatch(source, /priceMeta \? <span className="tag-soft tag-soft--gray">/);
});

test('detail modal renders user-facing charged and approximate cost without internal breakdown rows', async () => {
  const source = await readFile(new URL('../src/app/app/history/ai-request-detail-modal.tsx', import.meta.url), 'utf8');
  assert.match(source, /costMeta/);
  assert.match(source, /ai-detail-cost-card/);
  assert.match(source, /td\.chargedToBalance/);
  assert.match(source, /td\.approximateCost/);
  assert.match(source, /td\.notChargedHelper/);
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
