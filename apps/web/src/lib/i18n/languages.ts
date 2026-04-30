import type { Translations } from './en';
import { en } from './en';
import { es } from './es';
import { kk } from './kk';
import { ptBR } from './pt-BR';
import { ru } from './ru';
import { tr } from './tr';
import { uz } from './uz';

export const SUPPORTED_LOCALES = ['en', 'ru', 'uz', 'kk', 'tr', 'es', 'pt-BR'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

const DICTIONARIES: Record<SupportedLocale, Translations> = {
  en,
  ru,
  uz,
  kk,
  tr,
  es,
  'pt-BR': ptBR,
};

export function isSupportedLocale(value: string): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function resolveLocale(value: string | null | undefined): SupportedLocale {
  return value && isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function getTranslations(locale: string | null | undefined): Translations {
  return DICTIONARIES[resolveLocale(locale)];
}

