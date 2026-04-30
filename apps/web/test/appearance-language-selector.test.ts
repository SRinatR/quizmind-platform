import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('appearance settings language selector is compact select and uses centralized locales', async () => {
  const source = await readFile(new URL('../src/app/components/settings/appearance-settings-panel.tsx', import.meta.url), 'utf8');
  assert.match(source, /SUPPORTED_LOCALES/);
  assert.match(source, /className="currency-select"/);
  assert.match(source, /name="language"/);
  assert.match(source, /s\.languageNames\[code\]/);
  assert.doesNotMatch(source, /type="radio"\s*name="language"/);
});

test('supported locales include requested language set', async () => {
  const source = await readFile(new URL('../src/lib/i18n/languages.ts', import.meta.url), 'utf8');
  assert.match(source, /'en', 'ru', 'uz', 'kk', 'tr', 'es', 'pt-BR'/);
});

test('appearance component does not define a hardcoded locale list', async () => {
  const source = await readFile(new URL('../src/app/components/settings/appearance-settings-panel.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\['en'\s*,\s*'ru'/);
  assert.match(source, /SUPPORTED_LOCALES\.map\(/);
});

test('all supported locales have dictionary mapping and fallback locale resolution', async () => {
  const source = await readFile(new URL('../src/lib/i18n/languages.ts', import.meta.url), 'utf8');
  assert.match(source, /const DICTIONARIES: Record<SupportedLocale, Translations>/);
  assert.match(source, /resolveLocale\(value/);
  assert.match(source, /DEFAULT_LOCALE/);
});

test('preferences validate invalid stored locale fallback safely', async () => {
  const source = await readFile(new URL('../src/lib/preferences.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!isSupportedLocale\(next\.language\)\)/);
  assert.match(source, /next\.language = DEFAULT_LOCALE/);
  assert.match(source, /setLanguage: \(v: Language\)/);
  assert.match(source, /body: JSON\.stringify\(\{ uiPreferences: fullPrefs \}\)/);
});

test('anti-FOUC layout script preserves selected locale and is not hardcoded to en/ru only', async () => {
  const source = await readFile(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
  assert.match(source, /document\.documentElement\.setAttribute\('lang',String\(p\.language\)\.toLowerCase\(\)\)/);
  assert.doesNotMatch(source, /p\.language==='ru'\?'ru':'en'/);
});
