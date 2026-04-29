import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('extension control client references extensionControlPolicySummary keys', async () => {
  const source = await readFile(new URL('../src/app/admin/[section]/extension-control-admin-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /extensionControlPolicySummary/);
  assert.doesNotMatch(source, />Client Version Policy</);
  assert.doesNotMatch(source, />Summary</);
  assert.doesNotMatch(source, />Required version</);
  assert.doesNotMatch(source, />Recommended version</);
  assert.doesNotMatch(source, />Connected installations</);
});

test('ru dictionary contains policy summary russian labels', async () => {
  const ru = await readFile(new URL('../src/lib/i18n/ru.ts', import.meta.url), 'utf8');
  assert.match(ru, /Политика версии клиента/);
  assert.match(ru, /Сводка/);
  assert.match(ru, /Подключённые установки/);
});
