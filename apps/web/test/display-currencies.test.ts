import assert from 'node:assert/strict';
import test from 'node:test';
import { convertUsdToDisplayCurrency, formatBalanceFromKopecks, isSupportedCurrency } from '../src/lib/money';

const rates = {
  baseCurrency: 'RUB' as const,
  source: 'cbr' as const,
  fetchedAt: Date.now(),
  rates: { RUB: 1, USD: 90, EUR: 100, UZS: 0.007, KZT: 0.2, GBP: 120 },
};

test('supports extended display currencies', () => {
  assert.equal(isSupportedCurrency('UZS'), true);
  assert.equal(isSupportedCurrency('ABC'), false);
});

test('converts USD to extended display currencies', () => {
  assert.equal(convertUsdToDisplayCurrency(1, 'UZS', rates), 90 / 0.007);
  assert.equal(convertUsdToDisplayCurrency(1, 'KZT', rates), 90 / 0.2);
});

test('formatBalanceFromKopecks converts RUB wallet to USD display', () => {
  assert.equal(formatBalanceFromKopecks(273, 'USD', rates), '$0.03');
});

test('missing rates falls back safely to RUB display', () => {
  assert.equal(formatBalanceFromKopecks(273, 'GBP', null), '2,73\u00a0₽');
});
