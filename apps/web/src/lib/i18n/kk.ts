import type { Translations } from './en';
import { en } from './en';
export const kk: Translations = {
  nav: { dashboardGroup: 'Панель', adminGroup: 'Әкімші', profile: 'Сіздің профиліңіз', usage: 'Пайдалану', history: 'Тарих', installations: 'Орнатулар', settings: 'Баптаулар' },
  shell: { notSignedIn: 'Жүйеге кірмеген', signIn: 'Кіру', openNav: 'Мәзірді ашу', closeNav: 'Мәзірді жабу', signOut: 'Шығу', signingOut: 'Шығуда…' },
  auth: { ...en.auth,
    login: { ...en.auth.login, eyebrow: 'Кіру', heading: 'Қош келдіңіз', subheading: 'QuizMind тіркелгіңізге кіріңіз.', submitButton: 'Кіру', forgotPassword: 'Құпиясөзді ұмыттыңыз ба?', createAccount: 'Тіркелгі жасау', signOut: 'Шығу' },
    register: { ...en.auth.register, eyebrow: 'Тіркелгі жасау', heading: 'QuizMind-пен бастау', submitButton: 'Тіркелгі жасау', haveAccount: 'Кіру', signOut: 'Шығу' },
    forgotPassword: { ...en.auth.forgotPassword, eyebrow: 'Құпиясөзді қалпына келтіру', heading: 'Қалпына келтіру сілтемесін сұрау', submitButton: 'Сілтемені жіберу', backToSignIn: 'Кіруге оралу' },
    resetPassword: { ...en.auth.resetPassword, eyebrow: 'Құпиясөзді қалпына келтіру', heading: 'Жаңа құпиясөзді таңдаңыз', submitButton: 'Құпиясөзді жаңарту', backToSignIn: 'Кіруге оралу' },
  },
  settings: { ...en.settings, tabs: { ...en.settings.tabs, appearance: 'Көрініс', security: 'Қауіпсіздік' }, appearance: { ...en.settings.appearance, title: 'Көрініс', desc: 'Интерфейс пен визуал баптаулар.', themeSection: 'Тақырып', themeDesc: 'QuizMind көрінісін таңдаңыз.', themeLight: 'Жарық', themeDark: 'Қараңғы', themeSystem: 'Жүйе', languageTitle: 'Тіл', languageDescription: 'Қосымша интерфейсінің тілін таңдаңыз.', languageLabel: 'Тіл', densitySection: 'Тығыздық', densityDesc: 'Интерфейстегі аралықтар мен өлшемдерді басқарады.', densityComfortable: 'Ыңғайлы', densityCompact: 'Ықшам', currencySection: 'Баланс валютасы', currencyDesc: 'Шот балансының көрсетілу валютасын таңдаңыз.', languageNames: { en: 'English', ru: 'Русский', uz: 'O‘zbekcha', kk: 'Қазақша', tr: 'Türkçe', es: 'Español', 'pt-BR': 'Português (Brasil)' } } },
  billing: en.billing,
  installs: en.installs,
  dash: en.dash,
  usagePage: en.usagePage,
  historyPage: en.historyPage,
  publicPages: en.publicPages,
  admin: en.admin,
  profile: en.profile,
  aiRequestDetail: en.aiRequestDetail,
  common: { ...en.common, loading: 'Жүктелуде…', error: 'Қате орын алды.', retry: 'Қайталау', save: 'Сақтау', cancel: 'Болдырмау', close: 'Жабу', back: 'Артқа', signIn: 'Кіру', signOut: 'Шығу' },
};
