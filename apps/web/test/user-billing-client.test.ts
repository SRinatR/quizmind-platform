import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('client references t.admin.userBilling and billing endpoints', async () => {
  const source = await readFile('src/app/admin/[section]/user-billing-client.tsx', 'utf8');
  assert.match(source, /t\.admin\.userBilling/);
  assert.match(source, /\/bff\/admin\/billing\/users/);
  assert.match(source, /\/bff\/admin\/billing\/wallet-adjustments/);
  assert.match(source, /\/bff\/admin\/billing\/users\/\$\{encodeURIComponent\(userId\)\}\/override/);
});

test('client uses updated actions and keeps payload safety invariants', async () => {
  const source = await readFile('src/app/admin/[section]/user-billing-client.tsx', 'utf8');
  assert.match(source, /ub\.actions/);
  assert.doesNotMatch(source, /<th>\{ub\.close\}<\/th>/);
  assert.match(source, /ub\.manage/);
  assert.match(source, /selected\.size > 0/);
  assert.match(source, /CREDIT ALL USERS/);
  assert.match(source, /Math\.round\(amount \* 100\)/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /rows\.map\(\(row\).*?\{ub\.manage\}/s);
  assert.doesNotMatch(source, /setSelected\(new Set\(\[row\.userId\]\)\);\s*setDirection\('credit'\);/);
});

test('ru dictionary contains required billing action labels', async () => {
  const ru = await readFile('src/lib/i18n/ru.ts', 'utf8');
  assert.match(ru, /Начислить/);
  assert.match(ru, /Списать/);
  assert.match(ru, /Правило комиссии/);
  assert.match(ru, /Сбросить правило/);
  assert.match(ru, /Управлять/);
  assert.match(ru, /Ручная корректировка баланса/);
  assert.match(ru, /Комиссия отключена/);
});
