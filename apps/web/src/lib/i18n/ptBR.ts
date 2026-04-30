import type { Translations } from './en';
import { en } from './en';
export const ptBR: Translations = {
  nav: { dashboardGroup: 'Painel', adminGroup: 'Administração', profile: 'Seu perfil', usage: 'Uso', history: 'Histórico', installations: 'Instalações', settings: 'Configurações' },
  shell: { notSignedIn: 'Não conectado', signIn: 'Entrar', openNav: 'Abrir navegação', closeNav: 'Fechar navegação', signOut: 'Sair', signingOut: 'Saindo…' },
  auth: { ...en.auth,
    login: { ...en.auth.login, eyebrow: 'Entrar', heading: 'Bem-vindo de volta', subheading: 'Entre na sua conta QuizMind.', submitButton: 'Entrar', forgotPassword: 'Esqueceu a senha?', createAccount: 'Criar conta', signOut: 'Sair' },
    register: { ...en.auth.register, eyebrow: 'Criar conta', heading: 'Comece com QuizMind', submitButton: 'Criar conta', haveAccount: 'Entrar', signOut: 'Sair' },
    forgotPassword: { ...en.auth.forgotPassword, eyebrow: 'Esqueci a senha', heading: 'Solicitar link de redefinição', submitButton: 'Enviar link', backToSignIn: 'Voltar para entrar' },
    resetPassword: { ...en.auth.resetPassword, eyebrow: 'Redefinir senha', heading: 'Escolha uma nova senha', submitButton: 'Redefinir senha', backToSignIn: 'Voltar para entrar' },
  },
  settings: { ...en.settings, tabs: { ...en.settings.tabs, appearance: 'Aparência', security: 'Segurança' }, appearance: { ...en.settings.appearance, title: 'Aparência', desc: 'Preferências visuais e configurações da interface.', themeSection: 'Tema', themeDesc: 'Escolha como o QuizMind aparece.', themeLight: 'Claro', themeDark: 'Escuro', themeSystem: 'Sistema', languageTitle: 'Idioma', languageDescription: 'Escolha o idioma da interface do app.', languageLabel: 'Idioma', densitySection: 'Densidade', densityDesc: 'Controla espaçamentos e tamanhos dos elementos.', densityComfortable: 'Confortável', densityCompact: 'Compacta', currencySection: 'Moeda do saldo', currencyDesc: 'Escolha como o saldo da conta será exibido.', languageNames: { en: 'English', ru: 'Русский', uz: 'O‘zbekcha', kk: 'Қазақша', tr: 'Türkçe', es: 'Español', 'pt-BR': 'Português (Brasil)' } } },
  billing: en.billing,
  installs: en.installs,
  dash: en.dash,
  usagePage: en.usagePage,
  historyPage: en.historyPage,
  publicPages: en.publicPages,
  admin: en.admin,
  profile: en.profile,
  aiRequestDetail: en.aiRequestDetail,
  common: { ...en.common, loading: 'Carregando…', error: 'Ocorreu um erro.', retry: 'Tentar novamente', save: 'Salvar', cancel: 'Cancelar', close: 'Fechar', back: 'Voltar', signIn: 'Entrar', signOut: 'Sair' },
};
