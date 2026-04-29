import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = readFileSync(join(root, 'src/app/admin/[section]/admin-ai-providers-client.tsx'), 'utf8');
const en = readFileSync(join(root, 'src/lib/i18n/en.ts'), 'utf8');
const ru = readFileSync(join(root, 'src/lib/i18n/ru.ts'), 'utf8');

test('ai routing client references i18n keys', () => {
  assert.match(source, /t\.admin\.aiRouting/);
  assert.doesNotMatch(source, />\s*Provider\s*</);
  assert.doesNotMatch(source, />\s*Current Routing Status\s*</);
});

test('ru and en include ai routing labels', () => {
  assert.match(ru, /Маршрутизация AI/);
  assert.match(ru, /Провайдер/);
  assert.match(ru, /Модель/);
  assert.match(ru, /Статус/);
  assert.match(ru, /Сохранить/);
  assert.match(ru, /Обновить/);

  assert.match(en, /AI Routing/);
  assert.match(en, /Provider/);
  assert.match(en, /Model/);
});
