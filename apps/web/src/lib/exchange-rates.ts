/**
 * Server-side exchange rate fetcher.
 * Uses CBR (Central Bank of Russia) daily JSON feed.
 * Rates give how many RUB equal 1 unit of the foreign currency.
 * In-memory cache with 1-hour TTL to avoid hammering the API.
 */

export interface ExchangeRateSnapshot {
  USD: number; // 1 USD = N RUB
  EUR: number; // 1 EUR = N RUB
}

interface CbrResponse {
  Valute: {
    USD: { Value: number; Nominal: number };
    EUR: { Value: number; Nominal: number };
  };
}

let _cache: (ExchangeRateSnapshot & { fetchedAt: number }) | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getExchangeRates(): Promise<ExchangeRateSnapshot | null> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return { USD: _cache.USD, EUR: _cache.EUR };
  }
  try {
    const res = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', {
      // Next.js fetch cache: revalidate every hour at the CDN/ISR level too
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CbrResponse;
    const usd = data.Valute.USD.Value / data.Valute.USD.Nominal;
    const eur = data.Valute.EUR.Value / data.Valute.EUR.Nominal;
    _cache = { USD: usd, EUR: eur, fetchedAt: Date.now() };
    return { USD: usd, EUR: eur };
  } catch {
    return null;
  }
}
