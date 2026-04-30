import type { Translations } from './en';
import { en } from './en';

export const uz: Translations = {
  ...en,
  settings: {
    ...en.settings,
    appearance: {
      ...en.settings.appearance,
      languageTitle: 'Language',
      languageDescription: 'Choose the language used in the app interface.',
      languageLabel: 'Language',
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
