import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourcePath = join(root, 'src/app/admin/[section]/extension-control-admin-client.tsx');
const ruPath = join(root, 'src/lib/i18n/ru.ts');

test('extension-control admin client localizes final visible config labels', () => {
  const source = readFileSync(sourcePath, 'utf8');
  assert.match(source, /extensionControlConfig/);

  assert.doesNotMatch(source, />\s*Recent activity\s*</);
  assert.doesNotMatch(source, />\s*Version policy\s*</);
  assert.doesNotMatch(source, />\s*Published\s*</);
  assert.doesNotMatch(source, />\s*Active:\s*</);
  assert.doesNotMatch(source, /Remote config data unavailable for this session\./);
  assert.doesNotMatch(source, />\s*Changed field\s*</);
  assert.doesNotMatch(source, />\s*Before\s*</);
  assert.doesNotMatch(source, />\s*After\s*</);
});

test('ru dictionary contains final extension control config translations', () => {
  const ru = readFileSync(ruPath, 'utf8');
  assert.match(ru, /Последняя активность/);
  assert.match(ru, /Политика версий/);
  assert.match(ru, /Опубликовано/);
  assert.match(ru, /Активно:/);
  assert.match(ru, /Данные удалённой конфигурации недоступны для этой сессии\./);
  assert.match(ru, /Изменённое поле/);
  assert.match(ru, /Было/);
  assert.match(ru, /Стало/);
});
