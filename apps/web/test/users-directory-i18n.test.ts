import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('users directory client uses admin.users i18n labels for table/filter shell', async () => {
  const source = await readFile(new URL('../src/app/admin/[section]/users-directory-client.tsx', import.meta.url), 'utf8');
  for (const key of ['searchPlaceholder', 'email', 'role', 'verified', 'banned', 'actions', 'createUser']) {
    assert.match(source, new RegExp(`a\\.${key}`));
  }
});

test('ru admin.users dictionary includes expected Russian labels', async () => {
  const ru = await readFile(new URL('../src/lib/i18n/ru.ts', import.meta.url), 'utf8');
  assert.match(ru, /users:\s*\{/);
  assert.match(ru, /searchPlaceholder:\s*'Поиск по email, имени, ID…'/);
  assert.match(ru, /role:\s*'Роль'/);
  assert.match(ru, /actions:\s*'Действия'/);
  assert.match(ru, /createUser:\s*'Создать пользователя'/);
});
