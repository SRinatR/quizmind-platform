import assert from 'node:assert/strict';
import test from 'node:test';
import { getExchangeRates } from '../src/lib/exchange-rates';

test('exchange rates parser supports CBR nominal values for multiple currencies', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    Valute: {
      USD: { CharCode: 'USD', Value: 90, Nominal: 1 },
      EUR: { CharCode: 'EUR', Value: 102, Nominal: 1 },
      KZT: { CharCode: 'KZT', Value: 18, Nominal: 100 },
      UZS: { CharCode: 'UZS', Value: 70, Nominal: 10000 },
    },
  }), { status: 200 })) as typeof fetch;

  const rates = await getExchangeRates();
  globalThis.fetch = originalFetch;

  assert.ok(rates);
  assert.equal(rates?.baseCurrency, 'RUB');
  assert.equal(rates?.rates.RUB, 1);
  assert.equal(rates?.rates.KZT, 0.18);
  assert.equal(rates?.rates.UZS, 0.007);
});
