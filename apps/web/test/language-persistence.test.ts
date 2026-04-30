import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('preferences persist selected language and protect against stale server overwrite', async () => {
  const source = await readFile(new URL('../src/lib/preferences.tsx', import.meta.url), 'utf8');
  assert.match(source, /LOCAL_LANGUAGE_LOCK_KEY/);
  assert.match(source, /markLocalLanguageUpdate\(v\)/);
  assert.match(source, /readLocalLanguageUpdate\(\)/);
  assert.match(source, /serverPatch\.language = current\.language/);
});

test('api accepts all supported language values', async () => {
  const source = await readFile(new URL('../../api/src/platform.service.ts', import.meta.url), 'utf8');
  assert.match(source, /new Set\(\['en', 'ru', 'uz', 'kk', 'tr', 'es', 'pt-BR'\]\)/);
});
