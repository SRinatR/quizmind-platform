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

  assert.doesNotMatch(source, />\s*Feature flags\s*</);
  assert.doesNotMatch(source, />\s*Remote config\s*</);
  assert.doesNotMatch(source, />\s*Debug panel\s*</);
  assert.doesNotMatch(source, />\s*Publish\s*</);
  assert.doesNotMatch(source, />\s*Activate\s*</);
  assert.doesNotMatch(source, />\s*Result\s*</);
});

test('ru dictionary contains config translations', () => {
  const ru = readFileSync(ruPath, 'utf8');
  assert.match(ru, /Флаги функций/);
  assert.match(ru, /Удалённая конфигурация/);
  assert.match(ru, /Панель отладки/);
  assert.match(ru, /Опубликовать/);
  assert.match(ru, /Активировать/);
  assert.match(ru, /Результат/);
});
