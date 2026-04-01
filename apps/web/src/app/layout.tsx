import type { Metadata } from 'next';

import './globals.css';
import '../lib/web-env';
import { PreferencesProvider } from '../lib/preferences';

export const metadata: Metadata = {
  title: 'QuizMind',
  description:
    'Ace every quiz with AI. QuizMind reads the question, finds the answer, and explains it — right inside your browser.',
};

/**
 * Anti-FOUC (Flash of Unstyled Content) script.
 * Runs synchronously before React hydrates so the correct theme, density,
 * and motion attributes are set on <html> before the first paint.
 * Must stay as a string literal — no imports or references to other modules.
 */
const antiFoucScript = `(function(){try{
  var p=JSON.parse(localStorage.getItem('qm_prefs')||'{}');
  var t=p.theme||'system';
  var resolved=t==='system'
    ?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')
    :t;
  document.documentElement.setAttribute('data-theme',resolved);
  if(p.density)document.documentElement.setAttribute('data-density',p.density);
  if(p.reducedMotion)document.documentElement.setAttribute('data-motion','reduced');
  if(p.language)document.documentElement.setAttribute('lang',p.language==='ru'?'ru':'en');
}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* eslint-disable-next-line react/no-danger */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: antiFoucScript }} />
      </head>
      <body>
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  );
}
