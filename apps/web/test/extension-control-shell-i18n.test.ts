import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('extension control admin client references extensionControlShell i18n block', async () => {
  const source = await readFile(new URL('../src/app/admin/[section]/extension-control-admin-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /extensionControlShell/);
  assert.doesNotMatch(source, />Extension Control</);
  assert.doesNotMatch(source, />Refresh</);
  assert.doesNotMatch(source, />Status</);
  assert.doesNotMatch(source, />User</);
  assert.doesNotMatch(source, />Actions</);
});

test('ru dictionary contains extension control shell russian labels', async () => {
  const ru = await readFile(new URL('../src/lib/i18n/ru.ts', import.meta.url), 'utf8');
  assert.match(ru, /Управление расширением/);
  assert.match(ru, /Обновить/);
  assert.match(ru, /Статус/);
  assert.match(ru, /Пользователь/);
  assert.match(ru, /Действия/);
});
