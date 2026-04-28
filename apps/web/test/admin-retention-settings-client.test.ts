import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const settingsClientPath = path.resolve(process.cwd(), 'src/app/admin/[section]/admin-settings-client.tsx');
const retentionClientPath = path.resolve(process.cwd(), 'src/app/admin/[section]/data-retention-client.tsx');

test('/admin/settings only keeps profile and appearance tabs', async () => {
  const source = await readFile(settingsClientPath, 'utf8');
  assert.match(source, /type SettingsTab = 'profile' \| 'appearance'/);
  assert.doesNotMatch(source, /retention/);
});

test('/admin/data-retention client loads and saves through BFF routes', async () => {
  const source = await readFile(retentionClientPath, 'utf8');
  assert.match(source, /fetch\('\/bff\/admin\/settings\/retention', \{ cache: 'no-store' \}\)/);
  assert.match(source, /method: 'PATCH'/);
  assert.match(source, /body: JSON\.stringify\(retentionDraft\)/);
});

test('data retention client keeps email verification TTL read-only/future and not editable in patch draft', async () => {
  const source = await readFile(retentionClientPath, 'utf8');
  assert.match(source, /emailVerificationFutureNote/);
  assert.match(source, /toEditableRetentionDraft/);
  assert.doesNotMatch(source, /\['accessTokenLifetimeMinutes', 'refreshTokenLifetimeDays', 'emailVerificationLifetimeHours', 'passwordResetLifetimeHours'\]/);
});

test('data retention client renders auth/session warning and sensitive logs warning', async () => {
  const source = await readFile(retentionClientPath, 'utf8');
  assert.match(source, /adminT\.settings\.retention\.authIssuedOnlyNote/);
  assert.match(source, /adminT\.settings\.retention\.sensitiveWarning/);
});
