import type { ExchangeRateSnapshot } from './exchange-rates';

export type SupportedCurrency = 'RUB' | 'USD' | 'EUR';

function convertUsdAmount(
  usdAmount: number,
  currency: SupportedCurrency,
  rates: ExchangeRateSnapshot | null,
): number | null {
  if (!Number.isFinite(usdAmount)) {
    return null;
  }

  if (currency === 'USD') {
    return usdAmount;
  }

  if (!rates || !Number.isFinite(rates.USD) || !Number.isFinite(rates.EUR) || rates.USD <= 0 || rates.EUR <= 0) {
    return null;
  }

  if (currency === 'RUB') {
    return usdAmount * rates.USD;
  }

  return (usdAmount * rates.USD) / rates.EUR;
}

function fractionDigitsForAmount(value: number): { minimumFractionDigits: number; maximumFractionDigits: number } {
  const absValue = Math.abs(value);

  if (absValue >= 100) return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (absValue >= 1) return { minimumFractionDigits: 2, maximumFractionDigits: 4 };
  if (absValue >= 0.01) return { minimumFractionDigits: 2, maximumFractionDigits: 6 };
  return { minimumFractionDigits: 2, maximumFractionDigits: 8 };
}

function currencyLocale(currency: SupportedCurrency): string {
  if (currency === 'RUB') {
    return 'ru-RU';
  }

  return 'en-US';
}

function formatCurrencyAmount(value: number, currency: SupportedCurrency): string {
  const { minimumFractionDigits, maximumFractionDigits } = fractionDigitsForAmount(value);
  return new Intl.NumberFormat(currencyLocale(currency), {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

export function formatUsdAmountByPreference(
  usdAmount: number,
  currency: SupportedCurrency = 'USD',
  rates: ExchangeRateSnapshot | null = null,
): string {
  const converted = convertUsdAmount(usdAmount, currency, rates);

  if (converted === null) {
    return formatCurrencyAmount(usdAmount, 'USD');
  }

  return formatCurrencyAmount(converted, currency);
}

export function formatBalanceFromKopecks(
  kopecks: number,
  currency: SupportedCurrency = 'RUB',
  rates: ExchangeRateSnapshot | null = null,
): string {
  const rub = kopecks / 100;

  if (!Number.isFinite(rub)) {
    return formatCurrencyAmount(0, 'RUB');
  }

  if (currency === 'RUB') {
    return new Intl.NumberFormat(currencyLocale('RUB'), {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(rub);
  }

  if (!rates || !Number.isFinite(rates[currency]) || rates[currency] <= 0) {
    return formatCurrencyAmount(rub, 'RUB');
  }

  const converted = rub / rates[currency];
  return new Intl.NumberFormat(currencyLocale(currency), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(converted);
}
