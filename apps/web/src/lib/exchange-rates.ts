export interface ExchangeRateSnapshot {
  baseCurrency: 'RUB';
  rates: Record<string, number>;
  fetchedAt: number;
  source: 'cbr';
}

interface CbrValuteEntry { Value: number; Nominal: number; CharCode: string }
interface CbrResponse { Valute: Record<string, CbrValuteEntry> }

let _cache: ExchangeRateSnapshot | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function getExchangeRates(): Promise<ExchangeRateSnapshot | null> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) return _cache;
  try {
    const res = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as CbrResponse;
    const rates: Record<string, number> = { RUB: 1 };
    for (const valute of Object.values(data.Valute ?? {})) {
      const rate = valute.Value / valute.Nominal;
      if (Number.isFinite(rate) && rate > 0) rates[valute.CharCode] = rate;
    }
    if (!Number.isFinite(rates.USD) || rates.USD <= 0) return null;
    const snapshot: ExchangeRateSnapshot = { baseCurrency: 'RUB', rates, fetchedAt: Date.now(), source: 'cbr' };
    _cache = snapshot;
    return snapshot;
  } catch {
    return null;
  }
}
