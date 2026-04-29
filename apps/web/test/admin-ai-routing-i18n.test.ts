import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = readFileSync(join(root, 'src/app/admin/[section]/admin-ai-providers-client.tsx'), 'utf8');
const ru = readFileSync(join(root, 'src/lib/i18n/ru.ts'), 'utf8');

test('ai routing client localizes exact leftover labels', () => {
  const forbidden = [
    'Sign in with a connected admin session to override policy.',
    'platform-selected',
    'Unable to reach the AI provider policy route.',
    'Unable to reach the AI provider policy reset route.',
    'Policy not locked to platform-only',
    'RouterAI active',
    'RouterAI missing',
    'OpenRouter active',
    'OpenRouter missing',
    '>None<',
  ];
  for (const label of forbidden) {
    assert.doesNotMatch(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('ru dictionary contains exact leftover translations', () => {
  const required = [
    'Войдите с подключённой админ-сессией',
    'выбрано платформой',
    'Не удалось обратиться к маршруту политики AI-провайдера.',
    'Не удалось обратиться к маршруту сброса политики AI-провайдера.',
    'Политика не закреплена только за платформой',
    'RouterAI активен',
    'RouterAI отсутствует',
    'OpenRouter активен',
    'OpenRouter отсутствует',
    'Нет',
  ];
  for (const label of required) {
    assert.match(ru, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
