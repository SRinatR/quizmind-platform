import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const usersClientPath = path.resolve('src/app/admin/[section]/users-directory-client.tsx');
const enPath = path.resolve('src/lib/i18n/en.ts');
const ruPath = path.resolve('src/lib/i18n/ru.ts');

test('debounced query handler resets cursor pagination state', () => {
  const source = fs.readFileSync(usersClientPath, 'utf8');
  assert.match(source, /function handleQueryChange\(v: string\)[\s\S]*setCursor\(null\);[\s\S]*setCursorHistory\(\[\]\);[\s\S]*setPage\(1\);/);
});

test('admin users i18n includes page label in EN and RU', () => {
  const en = fs.readFileSync(enPath, 'utf8');
  const ru = fs.readFileSync(ruPath, 'utf8');
  assert.match(en, /pageLabel:\s*'Page'/);
  assert.match(ru, /pageLabel:\s*'Страница'/);
});
