import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourcePath = join(root, 'src/app/admin/[section]/extension-control-admin-client.tsx');
const ruPath = join(root, 'src/lib/i18n/ru.ts');

test('extension-control admin client uses extensionControlConfig keys', () => {
  const source = readFileSync(sourcePath, 'utf8');
  assert.match(source, /extensionControlConfig/);

  assert.doesNotMatch(source, />\s*Runtime Settings\s*</);
  assert.doesNotMatch(source, />\s*Description\s*</);
  assert.doesNotMatch(source, />\s*Rollout %\s*</);
  assert.doesNotMatch(source, />\s*Min extension version\s*</);
  assert.doesNotMatch(source, />\s*Allowed roles\/users\s*</);
  assert.doesNotMatch(source, /No feature flags defined\./);
  assert.doesNotMatch(source, /Stage edits to draft layer/);
  assert.doesNotMatch(source, /No config values in active layers\./);
  assert.doesNotMatch(source, />\s*Add layer\s*</);
});

test('ru dictionary contains config translations', () => {
  const ru = readFileSync(ruPath, 'utf8');
  assert.match(ru, /Runtime-настройки/);
  assert.match(ru, /Описание/);
  assert.match(ru, /Процент раскатки/);
  assert.match(ru, /Минимальная версия расширения/);
  assert.match(ru, /Разрешённые роли\/пользователи/);
  assert.match(ru, /Флаги функций не заданы\./);
  assert.match(ru, /Добавить слой/);
});
