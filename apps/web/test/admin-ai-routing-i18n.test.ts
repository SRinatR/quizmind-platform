import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = readFileSync(join(root, 'src/app/admin/[section]/admin-ai-providers-client.tsx'), 'utf8');
const ru = readFileSync(join(root, 'src/lib/i18n/ru.ts'), 'utf8');

test('ai routing client localizes requested labels', () => {
  assert.match(source, /t\.admin\.aiRouting/);
  assert.doesNotMatch(source, />\s*API Key\s*</);
  assert.doesNotMatch(source, />\s*Current Routing Status\s*</);
  assert.doesNotMatch(source, />\s*Platform-managed\s*</);
  assert.doesNotMatch(source, />\s*Default model\s*</);
  assert.doesNotMatch(source, />\s*Platform key\s*</);
  assert.doesNotMatch(source, />\s*Last change\s*</);
  assert.doesNotMatch(source, />\s*Advanced \(emergency use\)\s*</);
  assert.doesNotMatch(source, />\s*Manual policy editor\s*</);
  assert.doesNotMatch(source, />\s*Save policy\s*</);
  assert.doesNotMatch(source, />\s*Reset to global\s*</);
  assert.doesNotMatch(source, />\s*Credential maintenance\s*</);
  assert.doesNotMatch(source, />\s*Platform keys\s*</);
  assert.doesNotMatch(source, />\s*Rotate key\s*</);
  assert.doesNotMatch(source, />\s*Revoke key\s*</);
  assert.doesNotMatch(source, /Unable to reach the server\./);
  assert.doesNotMatch(source, /Saving AI provider policy\.\.\./);
});

test('ru dictionary contains requested ai routing translations', () => {
  const required = [
    'API-ключ',
    'Текущий статус маршрутизации',
    'Управляется платформой',
    'Модель по умолчанию',
    'Ключ платформы',
    'Последнее изменение',
    'Расширенные настройки (экстренное использование)',
    'Ручной редактор политики',
    'Сохранить политику',
    'Сбросить к глобальным настройкам',
    'Обслуживание учётных данных',
    'Ключи платформы',
    'Обновить ключ',
    'Отозвать ключ',
    'Не удалось подключиться к серверу.',
    'Сохранение политики AI-провайдера...',
  ];
  for (const label of required) {
    assert.match(ru, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
