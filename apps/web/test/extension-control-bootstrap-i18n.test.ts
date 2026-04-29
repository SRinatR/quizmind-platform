import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourcePath = join(root, 'src/app/admin/[section]/extension-control-admin-client.tsx');
const ruPath = join(root, 'src/lib/i18n/ru.ts');

test('extension-control admin client uses extensionControlBootstrap keys', () => {
  const source = readFileSync(sourcePath, 'utf8');
  assert.match(source, /extensionControlBootstrap/);

  assert.doesNotMatch(source, />\s*Bootstrap simulator\s*</);
  assert.doesNotMatch(source, />\s*Run bootstrap\s*</);
  assert.doesNotMatch(source, />\s*Installation token\s*</);
  assert.doesNotMatch(source, />\s*Client version\s*</);
  assert.doesNotMatch(source, />\s*Result\s*</);
});

test('ru dictionary contains bootstrap simulator translations', () => {
  const ru = readFileSync(ruPath, 'utf8');
  assert.match(ru, /Симулятор bootstrap/);
  assert.match(ru, /Запустить bootstrap/);
  assert.match(ru, /Токен установки/);
  assert.match(ru, /Версия клиента/);
  assert.match(ru, /Результат/);
});
