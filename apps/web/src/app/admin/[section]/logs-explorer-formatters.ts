import { type AdminLogEntry } from '@quizmind/contracts';
import { type ExchangeRateSnapshot } from '../../../lib/exchange-rates';
import { type BalanceDisplayCurrency } from '../../../lib/preferences';
import { formatUsdAmountByPreference } from '../../../lib/money';

export function shortId(value?: string | null): string {
  if (!value) return '—';
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function formatCost(
  usd?: number,
  currency: BalanceDisplayCurrency = 'USD',
  exchangeRates: ExchangeRateSnapshot | null = null,
): string {
  if (usd === undefined || usd === null) return '—';
  return formatUsdAmountByPreference(usd, currency, exchangeRates);
}

export function actorLabel(entry: AdminLogEntry): string {
  return entry.actor?.displayName ?? entry.actor?.email ?? shortId(entry.actor?.id) ?? '—';
}

export function targetLabel(entry: AdminLogEntry): string {
  if (entry.targetType === 'ai_request' || entry.category === 'ai') return 'AI request';
  if (entry.installationId || entry.targetType === 'installation' || entry.targetType === 'extension_installation') return 'Installation';
  if (entry.targetType === 'user') return 'User';
  if (entry.targetType === 'http_request' || entry.targetType === 'http') return 'HTTP request';
  if (entry.targetType) return entry.targetType.replaceAll('_', ' ');
  return '—';
}
