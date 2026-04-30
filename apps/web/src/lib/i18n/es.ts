import type { Translations } from './en';
import { en } from './en';

export const es: Translations = {
  nav: {
    dashboardGroup: 'Panel', adminGroup: 'Administración', profile: 'Tu perfil', usage: 'Uso', history: 'Historial', installations: 'Instalaciones', settings: 'Configuración',
  },
  shell: {
    notSignedIn: 'Sin iniciar sesión', signIn: 'Iniciar sesión', openNav: 'Abrir navegación', closeNav: 'Cerrar navegación', signOut: 'Cerrar sesión', signingOut: 'Cerrando sesión…',
  },
  auth: {
    ...en.auth,
    login: { ...en.auth.login, eyebrow: 'Iniciar sesión', heading: 'Bienvenido de nuevo', subheading: 'Inicia sesión en tu cuenta de QuizMind.', submitButton: 'Iniciar sesión', forgotPassword: '¿Olvidaste tu contraseña?', createAccount: 'Crear cuenta', signOut: 'Cerrar sesión' },
    register: { ...en.auth.register, eyebrow: 'Crear cuenta', heading: 'Comienza con QuizMind', subheading: 'Crea tu cuenta para conectar la extensión y empezar a usar la plataforma.', submitButton: 'Crear cuenta', haveAccount: 'Iniciar sesión', signOut: 'Cerrar sesión' },
    forgotPassword: { ...en.auth.forgotPassword, eyebrow: 'Olvidé mi contraseña', heading: 'Solicitar enlace de restablecimiento', submitButton: 'Enviar enlace', backToSignIn: 'Volver a iniciar sesión', createAccount: 'Crear cuenta' },
    resetPassword: { ...en.auth.resetPassword, eyebrow: 'Restablecer contraseña', heading: 'Elige una nueva contraseña', submitButton: 'Restablecer contraseña', backToSignIn: 'Volver a iniciar sesión' },
  },
  settings: {
    ...en.settings,
    tabs: { ...en.settings.tabs, appearance: 'Apariencia', security: 'Seguridad' },
    appearance: {
      ...en.settings.appearance,
      title: 'Apariencia', desc: 'Preferencias visuales y de interfaz. Se guardan en tu cuenta.', themeSection: 'Tema', themeDesc: 'Elige cómo se ve QuizMind. “Sistema” usa tu configuración del SO.', themeLight: 'Claro', themeDark: 'Oscuro', themeSystem: 'Sistema', languageTitle: 'Idioma', languageDescription: 'Elige el idioma de la interfaz.', languageLabel: 'Idioma',
      densitySection: 'Densidad', densityDesc: 'Controla los espacios y tamaños de elementos.', densityComfortable: 'Cómoda', densityCompact: 'Compacta',
      currencySection: 'Moneda del saldo', currencyDesc: 'Elige cómo se muestra el saldo de tu cuenta.',
      languageNames: { en: 'English', ru: 'Русский', uz: 'O‘zbekcha', kk: 'Қазақша', tr: 'Türkçe', es: 'Español', 'pt-BR': 'Português (Brasil)' },
    },
  },
  billing: en.billing,
  installs: en.installs,
  dash: en.dash,
  usagePage: en.usagePage,
  historyPage: en.historyPage,
  publicPages: en.publicPages,
  admin: en.admin,
  profile: en.profile,
  aiRequestDetail: en.aiRequestDetail,
  common: { ...en.common, loading: 'Cargando…', error: 'Ocurrió un error.', retry: 'Reintentar', save: 'Guardar', cancel: 'Cancelar', close: 'Cerrar', back: 'Atrás', signIn: 'Iniciar sesión', signOut: 'Cerrar sesión' },
};
