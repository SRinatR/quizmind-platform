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

test('client has search trigger, async hardening, and payload invariants', async () => {
  const source = await readFile('src/app/admin/[section]/user-billing-client.tsx', 'utf8');
  assert.match(source, /ub\.search/);
  assert.match(source, /onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter'\) void loadUsers\(\); \}\}/);
  assert.match(source, /async function loadUsers\(\)[\s\S]*try \{/);
  assert.match(source, /async function loadUsers\(\)[\s\S]*finally \{/);
  assert.match(source, /async function submitAdjustment\(\)[\s\S]*finally \{/);
  assert.match(source, /async function saveOverride\(\)[\s\S]*finally \{/);
  assert.match(source, /async function clearOverride\(userId: string\)[\s\S]*try \{/);
  assert.match(source, /ub\.actionsHelpTitle/);
  assert.match(source, /ub\.managingUser/);
  assert.match(source, /Math\.round\(amount \* 100\)/);
  assert.match(source, /crypto\.randomUUID\(\)/);
});

test('ru dictionary contains required hardening labels', async () => {
  const ru = await readFile('src/lib/i18n/ru.ts', 'utf8');
  assert.match(ru, /Искать/);
  assert.match(ru, /Что означают действия/);
  assert.match(ru, /Управление:/);
  assert.match(ru, /Ошибка сети\. Попробуйте ещё раз\./);
  assert.match(ru, /возвращает пользователя к глобальным настройкам/);
});
