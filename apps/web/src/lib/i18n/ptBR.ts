import type { Translations } from './en';
import { en } from './en';

export const ptBR: Translations = {
  ...en,
  settings: {
    ...en.settings,
    appearance: {
      ...en.settings.appearance,
      languageTitle: 'Idioma',
      languageDescription: 'Escolha o idioma usado na interface do app.',
      languageLabel: 'Idioma',
      languageNames: {
        en: 'English',
        ru: 'Русский',
        uz: 'O‘zbekcha',
        kk: 'Қазақша',
        tr: 'Türkçe',
        es: 'Español',
        'pt-BR': 'Português (Brasil)',
      },
    },
  },
};
