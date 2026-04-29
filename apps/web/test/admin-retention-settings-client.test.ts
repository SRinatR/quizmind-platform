import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const settingsClientPath = path.resolve(process.cwd(), 'src/app/admin/[section]/admin-settings-client.tsx');
const retentionClientPath = path.resolve(process.cwd(), 'src/app/admin/[section]/data-retention-client.tsx');
const ruI18nPath = path.resolve(process.cwd(), 'src/lib/i18n/ru.ts');

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
  assert.match(source, /queueHistory: policy\.queueHistory/);
});

test('/admin/data-retention renders separate retention cards for key sections', async () => {
  const source = await readFile(retentionClientPath, 'utf8');
  assert.match(source, /className="panel retention-card"/);
  assert.match(source, /adminT\.settings\.retention\.aiSectionTitle/);
  assert.match(source, /adminT\.settings\.retention\.aiUploadLimitsSectionTitle/);
  assert.match(source, /adminT\.settings\.retention\.adminLogsSectionTitle/);
  assert.match(source, /adminT\.settings\.retention\.sourceLogsSectionTitle/);
  assert.match(source, /adminT\.settings\.retention\.authSectionTitle/);
  assert.match(source, /adminT\.settings\.retention\.extensionSessionsSectionTitle/);
  assert.match(source, /adminT\.settings\.retention\.queueHistorySectionTitle/);
  assert.match(source, /adminT\.settings\.retention\.readOnlySectionTitle/);
});

test('data retention client keeps email verification TTL read-only/future and not editable in patch draft', async () => {
  const source = await readFile(retentionClientPath, 'utf8');
  assert.match(source, /emailVerificationFutureNote/);
  assert.match(source, /readOnlySectionTitle/);
  assert.match(source, /hoursSummary/);
  assert.match(source, /toEditableRetentionDraft/);
  assert.match(source, /extensionSessionLifetimeHours/);
  assert.match(source, /maxPromptImageAttachments/);
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
  assert.match(source, /platformQueues\.map\(\(queueName\)/);
  assert.match(source, /queueAttempts/);
  assert.match(source, /queueCompletedHistory/);
  assert.match(source, /queueFailedHistory/);
  assert.doesNotMatch(source, /emailVerificationLifetimeHours: policy\.emailVerificationLifetimeHours/);
  assert.doesNotMatch(source, /legacyAiRequestDays: policy\.legacyAiRequestDays/);
});

test('data retention queue history renders editable controls for all queue definitions', async () => {
  const source = await readFile(retentionClientPath, 'utf8');
  assert.match(source, /'billing-webhooks'/);
  assert.match(source, /'usage-events'/);
  assert.match(source, /emails/);
  assert.match(source, /'quota-resets'/);
  assert.match(source, /'config-publish'/);
  assert.match(source, /'audit-exports'/);
  assert.match(source, /'history-cleanup'/);
  assert.match(source, /updateQueueField/);
});

test('data retention ru dictionary includes key localized labels', async () => {
  const source = await readFile(ruI18nPath, 'utf8');
  assert.match(source, /Хранение данных/);
  assert.match(source, /История AI/);
  assert.match(source, /[Лл]оги/);
  assert.match(source, /Очеред/);
  assert.match(source, /Сохранить/);
  assert.match(source, /Сбросить/);
});


test('admin settings ru dictionary includes profile and appearance localization labels', async () => {
  const source = await readFile(ruI18nPath, 'utf8');
  assert.match(source, /pageTitle: 'Настройки'/);
  assert.match(source, /yourProfile: 'Профиль'/);
  assert.match(source, /title: 'Внешний вид'/);
  assert.match(source, /languageSection: 'Язык'/);
  assert.match(source, /saveButton: 'Сохранить'/);
  assert.match(source, /refreshFailed: 'Не удалось обновить'/);
});
