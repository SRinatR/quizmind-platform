import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('client references t.admin.userBilling and billing endpoints', async () => {
  const source = await readFile('src/app/admin/[section]/user-billing-client.tsx', 'utf8');
  assert.match(source, /t\.admin\.userBilling/);
  assert.match(source, /\/bff\/admin\/billing\/users/);
  assert.match(source, /POST'.*\/bff\/admin\/billing\/wallet-adjustments|\/bff\/admin\/billing\/wallet-adjustments/s);
  assert.match(source, /\/bff\/admin\/billing\/users\/\$\{encodeURIComponent\(userId\)\}\/override/);
});

test('client enforces all-users confirmation, kopecks conversion, and idempotency key', async () => {
  const source = await readFile('src/app/admin/[section]/user-billing-client.tsx', 'utf8');
  assert.match(source, /CREDIT ALL USERS/);
  assert.match(source, /Math\.round\(amount \* 100\)/);
  assert.match(source, /crypto\.randomUUID\(\)/);
});

test('ru dictionary contains required billing action labels', async () => {
  const ru = await readFile('src/lib/i18n/ru.ts', 'utf8');
  assert.match(ru, /Начислить/);
  assert.match(ru, /Списать/);
  assert.match(ru, /Применить корректировку/);
  assert.match(ru, /Комиссия платформы отключена/);
  assert.match(ru, /Сохранить правило/);
  assert.match(ru, /Стоимость провайдера всё равно может списываться/);
});
