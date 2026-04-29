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

test('client uses workspace layout and preserves billing payload invariants', async () => {
  const source = await readFile('src/app/admin/[section]/user-billing-client.tsx', 'utf8');
  assert.match(source, /user-billing-workspace/);
  assert.match(source, /user-billing-users-panel/);
  assert.match(source, /user-billing-side-panel/);
  assert.doesNotMatch(source, /ub\.howItWorksTitle/);
  assert.match(source, /ub\.helperSelectUsers/);
  assert.match(source, /ub\.selectUserToManageTitle/);
  assert.match(source, /ub\.balanceTab/);
  assert.match(source, /function openCommissionRule\(row: AdminBillingUserRow\)/);
  assert.match(source, /onClick=\{\(\) => \{ if \(singleSelectedRow\) openCommissionRule\(singleSelectedRow\); \}\}/);
  assert.doesNotMatch(source, /onClick=\{\(\) => setPanelMode\('commission'\)\}/);
  assert.match(source, /Math\.round\(amount \* 100\)/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /disabled=\{saving \|\| !editingUserId \|\| overrideReason\.trim\(\)\.length < 5\}/);
});

test('ru dictionary contains required billing labels', async () => {
  const ru = await readFile('src/lib/i18n/ru.ts', 'utf8');
  assert.match(ru, /Выберите пользователя для управления биллингом/);
  assert.match(ru, /Выберите пользователей/);
  assert.match(ru, /Измените баланс RUB/);
  assert.match(ru, /Настройте комиссию/);
  assert.match(ru, /Платёж YooKassa не создаётся/);
  assert.match(ru, /Пользователи/);
});
