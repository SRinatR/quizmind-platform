import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const sourcePath = join(root, 'src/app/admin/[section]/extension-control-admin-client.tsx');
const ruPath = join(root, 'src/lib/i18n/ru.ts');

test('extension-control admin client uses extensionControlTelemetry keys', () => {
  const source = readFileSync(sourcePath, 'utf8');
  assert.match(source, /extensionControlTelemetry/);

  assert.doesNotMatch(source, />\s*Telemetry queue\s*</);
  assert.doesNotMatch(source, />\s*Usage snapshot\s*</);
  assert.doesNotMatch(source, />\s*Flush now\s*</);
  assert.doesNotMatch(source, />\s*Pending events\s*</);
  assert.doesNotMatch(source, />\s*Failed events\s*</);
});

test('ru dictionary contains telemetry translations', () => {
  const ru = readFileSync(ruPath, 'utf8');
  assert.match(ru, /Очередь телеметрии/);
  assert.match(ru, /Снимок использования/);
  assert.match(ru, /Отправить сейчас/);
  assert.match(ru, /Ожидающие события/);
});
