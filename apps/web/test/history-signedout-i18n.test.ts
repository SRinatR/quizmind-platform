import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('history signed-out state uses i18n keys', async () => {
  const source = await readFile(new URL('../src/app/app/history/history-page-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /th\.signInRequired/);
  assert.match(source, /th\.signInRequiredHeading/);
  assert.match(source, /th\.signInRequiredDesc/);
});

test('ru dictionary includes translated history signed-out labels', async () => {
  const ru = await readFile(new URL('../src/lib/i18n/ru.ts', import.meta.url), 'utf8');
  assert.match(ru, /signInRequired:\s*'Требуется вход'/);
  assert.match(ru, /signInRequiredHeading:\s*'Войдите, чтобы посмотреть историю'/);
});
