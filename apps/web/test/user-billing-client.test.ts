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

test('client has mode logic, preview callout, and payload invariants', async () => {
  const source = await readFile('src/app/admin/[section]/user-billing-client.tsx', 'utf8');
  assert.match(source, /ub\.howItWorksTitle/);
  assert.match(source, /ub\.balanceAdjustmentTitle/);
  assert.match(source, /setPanelMode\('adjustment'\)/);
  assert.match(source, /function openCommissionRule\(row: AdminBillingUserRow\)/);
  assert.match(source, /onClick=\{\(\) => \{ if \(singleSelectedRow\) openCommissionRule\(singleSelectedRow\); \}\}/);
  assert.doesNotMatch(source, /onClick=\{\(\) => setPanelMode\('commission'\)\}/);
  assert.match(source, /ub\.previewTitle/);
  assert.match(source, /ub\.previewLedgerEntry/);
  assert.match(source, /ub\.previewYookassaPayment/);
  assert.match(source, /Math\.round\(amount \* 100\)/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /user-billing-row-selected/);
  assert.match(source, /disabled=\{saving \|\| !editingUserId \|\| overrideReason\.trim\(\)\.length < 5\}/);
  assert.match(source, /\{saving \? ub\.savingOverride : ub\.saveOverride\}/);
});

test('ru dictionary contains required billing labels', async () => {
  const ru = await readFile('src/lib/i18n/ru.ts', 'utf8');
  assert.match(ru, /Как работает страница/);
  assert.match(ru, /Корректировка баланса/);
  assert.match(ru, /Предпросмотр/);
  assert.match(ru, /Платёж YooKassa не создаётся/);
  assert.match(ru, /Правила комиссии можно изменять только для одного пользователя/);
  assert.match(ru, /Сбросить к глобальным настройкам/);
});
