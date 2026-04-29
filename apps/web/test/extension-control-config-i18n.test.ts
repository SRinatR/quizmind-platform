import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourcePath = join(root, 'src/app/admin/[section]/extension-control-admin-client.tsx');
const ruPath = join(root, 'src/lib/i18n/ru.ts');

test('extension-control admin client localizes requested remaining labels', () => {
  const source = readFileSync(sourcePath, 'utf8');
  assert.match(source, /extensionControlConfig/);

  assert.doesNotMatch(source, />\s*Version gates\s*</);
  assert.doesNotMatch(source, />\s*Client action\s*</);
  assert.doesNotMatch(source, />\s*Publishing\.\.\.\s*</);
  assert.doesNotMatch(source, />\s*Publish version policy\s*</);
  assert.doesNotMatch(source, />\s*Advanced\s*</);
  assert.doesNotMatch(source, />\s*Supported schema versions\s*</);
  assert.doesNotMatch(source, />\s*Required capabilities\s*</);
  assert.doesNotMatch(source, /No version policy published yet\./);
  assert.doesNotMatch(source, />\s*Rollout\s*</);
  assert.doesNotMatch(source, />\s*Min version\s*</);
  assert.doesNotMatch(source, />\s*Roles\s*</);
  assert.doesNotMatch(source, />\s*Users\s*</);
  assert.doesNotMatch(source, />\s*Enabled\s*</);
  assert.doesNotMatch(source, />\s*Disabled\s*</);
});

test('ru dictionary contains requested translations', () => {
  const ru = readFileSync(ruPath, 'utf8');
  assert.match(ru, /Ограничения версий/);
  assert.match(ru, /Действие клиента/);
  assert.match(ru, /Публикация\.\.\./);
  assert.match(ru, /Опубликовать политику версий/);
  assert.match(ru, /Расширенные настройки/);
  assert.match(ru, /Поддерживаемые версии схемы/);
  assert.match(ru, /Обязательные возможности/);
  assert.match(ru, /Политика версий ещё не опубликована\./);
  assert.match(ru, /Раскатка/);
  assert.match(ru, /Минимальная версия/);
  assert.match(ru, /Роли/);
  assert.match(ru, /Пользователи/);
  assert.match(ru, /Включено/);
  assert.match(ru, /Отключено/);
});
