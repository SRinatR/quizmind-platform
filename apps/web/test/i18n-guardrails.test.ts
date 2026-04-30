import assert from 'node:assert/strict';
import test from 'node:test';
import { en } from '../src/lib/i18n/en';
import { ru } from '../src/lib/i18n/ru';
import { uz } from '../src/lib/i18n/uz';
import { kk } from '../src/lib/i18n/kk';
import { tr } from '../src/lib/i18n/tr';
import { es } from '../src/lib/i18n/es';
import { ptBR } from '../src/lib/i18n/ptBR';
import { readFile } from 'node:fs/promises';

function collectPaths(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => collectPaths(v, prefix ? `${prefix}.${k}` : k));
}

const locales = { ru, uz, kk, tr, es, ptBR };

test('locale dictionaries match en key coverage', () => {
  const enPaths = new Set(collectPaths(en));
  for (const [locale, dict] of Object.entries(locales)) {
    const dictPaths = new Set(collectPaths(dict));
    const missing = [...enPaths].filter((p) => !dictPaths.has(p));
    assert.equal(missing.length, 0, `${locale} missing keys:\n${missing.join('\n')}`);
  }
});

test('new locale files do not use top-level ...en spread fallback', async () => {
  for (const f of ['uz.ts', 'kk.ts', 'tr.ts', 'es.ts', 'ptBR.ts']) {
    const source = await readFile(new URL(`../src/lib/i18n/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /export const \w+: Translations = \{\s*\.\.\.en,/m, `${f} still uses top-level spread fallback`);
  }
});

test('hardcoded english scanner for completed sections (report mode for pending pages)', async () => {
  const targets = [
    '../src/components/site-shell.tsx',
    '../src/app/app/page.tsx',
    '../src/app/app/settings/settings-page-client.tsx',
    '../src/app/components/settings/appearance-settings-panel.tsx',
    '../src/app/auth/login/page.tsx',
    '../src/app/auth/register/page.tsx',
  ];
  const banned = ['Your Profile', 'Usage', 'History', 'Installations', 'Settings', 'Sign out', 'Appearance', 'Theme', 'Language', 'Balance currency'];
  const violations: string[] = [];
  for (const file of targets) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    for (const phrase of banned) {
      if (source.includes(`"${phrase}"`) || source.includes(`'${phrase}'`)) {
        violations.push(`${file}: ${phrase}`);
      }
    }
  }
  assert.equal(violations.length, 0, `Hardcoded strings found:\n${violations.join('\n')}`);
});
