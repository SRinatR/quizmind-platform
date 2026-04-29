import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('client references t.admin.userBilling and BFF endpoint', async () => {
  const source = await readFile('src/app/admin/[section]/user-billing-client.tsx', 'utf8');
  assert.match(source, /t\.admin\.userBilling/);
  assert.match(source, /\/bff\/admin\/billing\/users/);
});

test('ru dictionary contains user billing required labels', async () => {
  const ru = await readFile('src/lib/i18n/ru.ts', 'utf8');
  assert.match(ru, /Биллинг пользователей/);
  assert.match(ru, /Баланс/);
  assert.match(ru, /Статус комиссии/);
  assert.match(ru, /Ручные корректировки/);
});
