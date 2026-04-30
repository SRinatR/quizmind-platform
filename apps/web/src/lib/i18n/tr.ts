import type { Translations } from './en';
import { en } from './en';
export const tr: Translations = {
  nav: { dashboardGroup: 'Panel', adminGroup: 'Yönetim', profile: 'Profilin', usage: 'Kullanım', history: 'Geçmiş', installations: 'Kurulumlar', settings: 'Ayarlar' },
  shell: { notSignedIn: 'Giriş yapılmadı', signIn: 'Giriş yap', openNav: 'Menüyü aç', closeNav: 'Menüyü kapat', signOut: 'Çıkış yap', signingOut: 'Çıkış yapılıyor…' },
  auth: { ...en.auth,
    login: { ...en.auth.login, eyebrow: 'Giriş yap', heading: 'Tekrar hoş geldin', subheading: 'QuizMind hesabına giriş yap.', submitButton: 'Giriş yap', forgotPassword: 'Şifreni mi unuttun?', createAccount: 'Hesap oluştur', signOut: 'Çıkış yap' },
    register: { ...en.auth.register, eyebrow: 'Hesap oluştur', heading: 'QuizMind ile başla', submitButton: 'Hesap oluştur', haveAccount: 'Giriş yap', signOut: 'Çıkış yap' },
    forgotPassword: { ...en.auth.forgotPassword, eyebrow: 'Şifremi unuttum', heading: 'Sıfırlama bağlantısı iste', submitButton: 'Bağlantıyı gönder', backToSignIn: 'Girişe dön' },
    resetPassword: { ...en.auth.resetPassword, eyebrow: 'Şifreyi sıfırla', heading: 'Yeni bir şifre seç', submitButton: 'Şifreyi sıfırla', backToSignIn: 'Girişe dön' },
  },
  settings: { ...en.settings, tabs: { ...en.settings.tabs, appearance: 'Görünüm', security: 'Güvenlik' }, appearance: { ...en.settings.appearance, title: 'Görünüm', desc: 'Görsel tercihleri ve arayüz ayarları.', themeSection: 'Tema', themeDesc: 'QuizMind görünümünü seçin.', themeLight: 'Açık', themeDark: 'Koyu', themeSystem: 'Sistem', languageTitle: 'Dil', languageDescription: 'Uygulama arayüzünde kullanılacak dili seçin.', languageLabel: 'Dil', densitySection: 'Yoğunluk', densityDesc: 'Arayüzdeki boşluk ve boyutları kontrol eder.', densityComfortable: 'Rahat', densityCompact: 'Kompakt', currencySection: 'Bakiye para birimi', currencyDesc: 'Hesap bakiyesinin nasıl gösterileceğini seçin.', languageNames: { en: 'English', ru: 'Русский', uz: 'O‘zbekcha', kk: 'Қазақша', tr: 'Türkçe', es: 'Español', 'pt-BR': 'Português (Brasil)' } } },
  billing: en.billing,
  installs: en.installs,
  dash: en.dash,
  usagePage: en.usagePage,
  historyPage: en.historyPage,
  publicPages: en.publicPages,
  admin: en.admin,
  profile: en.profile,
  aiRequestDetail: en.aiRequestDetail,
  common: { ...en.common, loading: 'Yükleniyor…', error: 'Bir hata oluştu.', retry: 'Tekrar dene', save: 'Kaydet', cancel: 'İptal', close: 'Kapat', back: 'Geri', signIn: 'Giriş yap', signOut: 'Çıkış yap' },
};
