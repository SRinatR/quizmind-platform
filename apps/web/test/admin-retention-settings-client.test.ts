import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const clientPath = path.resolve(process.cwd(), 'src/app/admin/[section]/admin-settings-client.tsx');

test('AdminSettingsClient exposes retention tab and warning text wiring', async () => {
  const source = await readFile(clientPath, 'utf8');
  assert.match(source, /type SettingsTab = 'profile' \| 'appearance' \| 'retention'/);
  assert.match(source, /adminT\.settings\.retention\.tabLabel/);
  assert.match(source, /adminT\.settings\.retention\.sensitiveWarning/);
});

test('Retention tab loads and saves through BFF routes', async () => {
  const source = await readFile(clientPath, 'utf8');
  assert.match(source, /fetch\('\/bff\/admin\/settings\/retention', \{ cache: 'no-store' \}\)/);
  assert.match(source, /method: 'PATCH'/);
  assert.match(source, /body: JSON\.stringify\(retentionDraft\)/);
});

test('Retention numeric fields have range metadata and client-side validation guard', async () => {
  const source = await readFile(clientPath, 'utf8');
  assert.match(source, /const retentionFieldConfig = \{/);
  assert.match(source, /min=\{retentionFieldConfig\[field\]\.min\}/);
  assert.match(source, /max=\{retentionFieldConfig\[field\]\.max\}/);
  assert.match(source, /setRetentionError\(adminT\.settings\.retention\.validationDays\)/);
});
