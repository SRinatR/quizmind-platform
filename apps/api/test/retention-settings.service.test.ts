import assert from 'node:assert/strict';
import test from 'node:test';

import { RetentionSettingsService } from '../src/settings/retention-settings.service';

function createSession() {
  return {
    user: {
      id: 'admin_1',
      email: 'admin@quizmind.dev',
      displayName: 'Admin',
    },
    principal: {
      systemRoles: ['admin'],
    },
  } as any;
}

test('updateRetentionPolicy PATCH merges current values instead of resetting omitted fields', async () => {
  let storedValue: any;
  const repository = {
    findByKey: async () => ({
      key: 'platform.retention_policy',
      valueJson: {
        aiHistoryContentDays: 22,
        aiHistoryAttachmentDays: 9,
        adminLogRetentionEnabled: true,
      },
      updatedById: 'admin_0',
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    }),
    upsertJson: async (_key: string, valueJson: any) => {
      storedValue = valueJson;
      return {
        key: 'platform.retention_policy',
        valueJson,
        updatedById: 'admin_1',
        updatedAt: new Date('2026-04-28T00:00:00.000Z'),
      };
    },
  };

  let auditEvent: any;
  const prisma = {
    adminLogEvent: {
      upsert: async (args: any) => {
        auditEvent = args;
        return args;
      },
    },
  };

  const service = new RetentionSettingsService(repository as any, prisma as any);
  const snapshot = await service.updateRetentionPolicy(createSession(), { aiHistoryContentDays: 30 });

  assert.equal(snapshot.policy.aiHistoryContentDays, 30);
  assert.equal(snapshot.policy.aiHistoryAttachmentDays, 9);
  assert.equal(snapshot.policy.adminLogRetentionEnabled, true);
  assert.equal(storedValue.aiHistoryAttachmentDays, 9);
  assert.equal(auditEvent.create.eventType, 'admin.retention_policy_updated');
  assert.deepEqual(auditEvent.create.metadataJson.changedFields, ['aiHistoryContentDays']);
  assert.equal(auditEvent.create.metadataJson.before.aiHistoryContentDays, 22);
  assert.equal(auditEvent.create.metadataJson.after.aiHistoryContentDays, 30);
});

test('updateRetentionPolicy rejects invalid values and does not write', async () => {
  let upsertCalls = 0;
  const repository = {
    findByKey: async () => null,
    upsertJson: async () => {
      upsertCalls += 1;
      return null;
    },
  };

  const prisma = {
    adminLogEvent: {
      upsert: async () => null,
    },
  };

  const service = new RetentionSettingsService(repository as any, prisma as any);

  await assert.rejects(
    () => service.updateRetentionPolicy(createSession(), { aiHistoryContentDays: -1 }),
    /between 1 and 365/,
  );
  assert.equal(upsertCalls, 0);
});
