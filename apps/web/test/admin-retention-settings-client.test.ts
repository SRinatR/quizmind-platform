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

test('/admin/data-retention renders separate retention cards for key sections', async () => {
  const source = await readFile(retentionClientPath, 'utf8');
  assert.match(source, /className="panel retention-card"/);
  assert.match(source, /adminT\.settings\.retention\.aiSectionTitle/);
  assert.match(source, /adminT\.settings\.retention\.adminLogsSectionTitle/);
  assert.match(source, /adminT\.settings\.retention\.authSectionTitle/);
});

test('data retention client keeps email verification TTL read-only/future and not editable in patch draft', async () => {
  const source = await readFile(retentionClientPath, 'utf8');
  assert.match(source, /emailVerificationFutureNote/);
  assert.match(source, /readOnlySectionTitle/);
  assert.match(source, /hoursSummary/);
  assert.match(source, /toEditableRetentionDraft/);
  assert.doesNotMatch(source, /\['accessTokenLifetimeMinutes', 'refreshTokenLifetimeDays', 'emailVerificationLifetimeHours', 'passwordResetLifetimeHours'\]/);
});

test('data retention client renders full-width warning callout and legacy read-only retention', async () => {
  const source = await readFile(retentionClientPath, 'utf8');
  assert.match(source, /retention-callout retention-callout--warning/);
  assert.match(source, /sensitiveCleanupTitle/);
  assert.match(source, /adminT\.settings\.retention\.authIssuedOnlyNote/);
  assert.match(source, /adminT\.settings\.retention\.legacyAiRequestDays/);
  assert.match(source, /adminT\.settings\.retention\.legacySummary/);
});

test('data retention patch payload still excludes read-only fields and validation remains in place', async () => {
  const source = await readFile(retentionClientPath, 'utf8');
  assert.match(source, /Number\.isInteger\(value\)/);
  assert.match(source, /value < config\.min \|\| value > config\.max/);
  assert.match(source, /setRetentionError\(adminT\.settings\.retention\.validationDays\)/);
  assert.doesNotMatch(source, /emailVerificationLifetimeHours: policy\.emailVerificationLifetimeHours/);
  assert.doesNotMatch(source, /legacyAiRequestDays: policy\.legacyAiRequestDays/);
});
