import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourcePath = join(root, 'src/app/admin/[section]/extension-control-admin-client.tsx');
const ruPath = join(root, 'src/lib/i18n/ru.ts');

test('extension-control admin client localizes remaining config labels', () => {
  const source = readFileSync(sourcePath, 'utf8');
  assert.match(source, /extensionControlConfig/);

  assert.doesNotMatch(source, />\s*Version\s*</);
  assert.doesNotMatch(source, />\s*Layer ID\s*</);
  assert.doesNotMatch(source, />\s*Scope\s*</);
  assert.doesNotMatch(source, />\s*Priority\s*</);
  assert.doesNotMatch(source, />\s*Conditions JSON\s*</);
  assert.doesNotMatch(source, />\s*Values JSON\s*</);
  assert.doesNotMatch(source, />\s*Recent Changes\s*</);
});

test('ru dictionary contains remaining config translations', () => {
  const ru = readFileSync(ruPath, 'utf8');
  assert.match(ru, /Версия/);
  assert.match(ru, /ID слоя/);
  assert.match(ru, /Область действия/);
  assert.match(ru, /Приоритет/);
  assert.match(ru, /JSON условий/);
  assert.match(ru, /JSON значений/);
  assert.match(ru, /Последние изменения/);
});
