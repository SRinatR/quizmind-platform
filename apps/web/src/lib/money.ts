import type { ExchangeRateSnapshot } from './exchange-rates';

export const SUPPORTED_DISPLAY_CURRENCIES = [
  'RUB',
  'USD',
  'EUR',
  'UZS',
  'KZT',
  'TRY',
  'AED',
  'GEL',
  'AMD',
  'KGS',
  'CNY',
  'GBP',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_DISPLAY_CURRENCIES)[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_DISPLAY_CURRENCIES as readonly string[]).includes(value);
}

function getRate(currency: SupportedCurrency, rates: ExchangeRateSnapshot | null): number | null {
  if (!rates) return null;
  const rate = rates.rates[currency];
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function convertUsdToDisplayCurrency(usdAmount: number, currency: SupportedCurrency, rates: ExchangeRateSnapshot | null): number | null {
  if (!Number.isFinite(usdAmount)) return null;
  if (currency === 'USD') return usdAmount;
  const usdRate = getRate('USD', rates);
  const targetRate = getRate(currency, rates);
  if (usdRate === null || targetRate === null) return null;
  return (usdAmount * usdRate) / targetRate;
}

export function convertDisplayCurrencyToUsd(value: number, currency: SupportedCurrency, rates: ExchangeRateSnapshot | null): number | null {
  if (!Number.isFinite(value)) return null;
  if (currency === 'USD') return value;
  const usdRate = getRate('USD', rates);
  const sourceRate = getRate(currency, rates);
  if (usdRate === null || sourceRate === null) return null;
  return (value * sourceRate) / usdRate;
}

function fractionDigitsForAmount(value: number): { minimumFractionDigits: number; maximumFractionDigits: number } {
  const absValue = Math.abs(value);
  if (absValue >= 100) return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (absValue >= 1) return { minimumFractionDigits: 2, maximumFractionDigits: 4 };
  if (absValue >= 0.01) return { minimumFractionDigits: 2, maximumFractionDigits: 6 };
  return { minimumFractionDigits: 2, maximumFractionDigits: 8 };
}

function currencyLocale(currency: SupportedCurrency): string {
  return currency === 'RUB' ? 'ru-RU' : 'en-US';
}

export function formatDisplayCurrencyAmount(value: number, currency: SupportedCurrency): string {
  const { minimumFractionDigits, maximumFractionDigits } = fractionDigitsForAmount(value);
  try {
    return new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency, minimumFractionDigits, maximumFractionDigits }).format(value);
  } catch {
    return `${currency} ${value.toFixed(Math.min(maximumFractionDigits, 2))}`;
  }
}

export function formatUsdAmountByPreference(usdAmount: number, currency: SupportedCurrency = 'USD', rates: ExchangeRateSnapshot | null = null): string {
  const converted = convertUsdToDisplayCurrency(usdAmount, currency, rates);
  if (converted === null) return formatDisplayCurrencyAmount(usdAmount, 'USD');
  return formatDisplayCurrencyAmount(converted, currency);
}

export function formatMinorCurrencyAmount(minorUnits: number, currency: SupportedCurrency = 'RUB'): string {
  const major = minorUnits / 100;
  if (!Number.isFinite(major)) return formatDisplayCurrencyAmount(0, currency);
  const isWhole = Math.abs(minorUnits) % 100 === 0;
  return new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency, minimumFractionDigits: isWhole ? 0 : 2, maximumFractionDigits: 2 }).format(major);
}

export function formatBalanceFromKopecks(kopecks: number, currency: SupportedCurrency = 'RUB', rates: ExchangeRateSnapshot | null = null): string {
  const rub = kopecks / 100;
  if (!Number.isFinite(rub)) return formatDisplayCurrencyAmount(0, 'RUB');
  if (currency === 'RUB') return formatMinorCurrencyAmount(kopecks, 'RUB');
  const targetRate = getRate(currency, rates);
  if (targetRate === null) return formatDisplayCurrencyAmount(rub, 'RUB');
  return new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rub / targetRate);
}


export function formatDisplayMoneyFromRubMinor({
  amountMinor,
  displayCurrency = 'RUB',
  rates = null,
}: {
  amountMinor: number;
  displayCurrency?: SupportedCurrency;
  rates?: ExchangeRateSnapshot | null;
}): string {
  if (!Number.isFinite(amountMinor)) return formatDisplayCurrencyAmount(0, 'RUB');
  if (displayCurrency === 'RUB') return formatMinorCurrencyAmount(amountMinor, 'RUB');
  const rub = amountMinor / 100;
  const targetRate = getRate(displayCurrency, rates);
  if (targetRate === null) return formatDisplayCurrencyAmount(rub, 'RUB');
  return formatDisplayCurrencyAmount(rub / targetRate, displayCurrency);
}
