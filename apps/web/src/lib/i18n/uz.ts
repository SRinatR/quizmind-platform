import type { Translations } from './en';
import { en } from './en';
export const uz: Translations = {
  nav: { dashboardGroup: 'Panel', adminGroup: 'Admin', profile: 'Profilingiz', usage: 'Foydalanish', history: 'Tarix', installations: 'Qurilmalar', settings: 'Sozlamalar' },
  shell: { notSignedIn: 'Tizimga kirmagan', signIn: 'Kirish', openNav: 'Menyuni ochish', closeNav: 'Menyuni yopish', signOut: 'Chiqish', signingOut: 'Chiqilmoqda…' },
  auth: { ...en.auth,
    login: { ...en.auth.login, eyebrow: 'Kirish', heading: 'Xush kelibsiz', subheading: 'QuizMind hisobingizga kiring.', submitButton: 'Kirish', forgotPassword: 'Parolni unutdingizmi?', createAccount: 'Hisob yaratish', signOut: 'Chiqish' },
    register: { ...en.auth.register, eyebrow: 'Hisob yaratish', heading: 'QuizMind bilan boshlang', submitButton: 'Hisob yaratish', haveAccount: 'Kirish', signOut: 'Chiqish' },
    forgotPassword: { ...en.auth.forgotPassword, eyebrow: 'Parolni tiklash', heading: 'Tiklash havolasini so‘rash', submitButton: 'Havolani yuborish', backToSignIn: 'Kirishga qaytish' },
    resetPassword: { ...en.auth.resetPassword, eyebrow: 'Parolni tiklash', heading: 'Yangi parol tanlang', submitButton: 'Parolni yangilash', backToSignIn: 'Kirishga qaytish' },
  },
  settings: { ...en.settings, tabs: { ...en.settings.tabs, appearance: 'Ko‘rinish', security: 'Xavfsizlik' }, appearance: { ...en.settings.appearance, title: 'Ko‘rinish', desc: 'Interfeys va vizual sozlamalar.', themeSection: 'Mavzu', themeDesc: 'QuizMind ko‘rinishini tanlang.', themeLight: 'Yorug‘', themeDark: 'Qorong‘i', themeSystem: 'Tizim', languageTitle: 'Til', languageDescription: 'Ilova interfeysi uchun tilni tanlang.', languageLabel: 'Til', densitySection: 'Zichlik', densityDesc: 'Interfeys elementlari o‘lchami va oralig‘ini boshqaradi.', densityComfortable: 'Qulay', densityCompact: 'Ixcham', currencySection: 'Balans valyutasi', currencyDesc: 'Balans qanday ko‘rsatilishini tanlang.', languageNames: { en: 'English', ru: 'Русский', uz: 'O‘zbekcha', kk: 'Қазақша', tr: 'Türkçe', es: 'Español', 'pt-BR': 'Português (Brasil)' } } },
  billing: en.billing,
  installs: en.installs,
  dash: en.dash,
  usagePage: en.usagePage,
  historyPage: en.historyPage,
  publicPages: en.publicPages,
  admin: en.admin,
  profile: en.profile,
  aiRequestDetail: en.aiRequestDetail,
  common: { ...en.common, loading: 'Yuklanmoqda…', error: 'Xatolik yuz berdi.', retry: 'Qayta urinish', save: 'Saqlash', cancel: 'Bekor qilish', close: 'Yopish', back: 'Orqaga', signIn: 'Kirish', signOut: 'Chiqish' },
};
