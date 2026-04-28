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
        accessTokenLifetimeMinutes: 15,
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
  const snapshot = await service.updateRetentionPolicy(createSession(), { aiHistoryContentDays: 30, accessTokenLifetimeMinutes: 25 });

  assert.equal(snapshot.policy.aiHistoryContentDays, 30);
  assert.equal(snapshot.policy.aiHistoryAttachmentDays, 9);
  assert.equal(snapshot.policy.accessTokenLifetimeMinutes, 25);
  assert.equal(snapshot.policy.adminLogRetentionEnabled, true);
  assert.equal(storedValue.aiHistoryAttachmentDays, 9);
  assert.equal(auditEvent.create.eventType, 'admin.retention_policy_updated');
  assert.deepEqual(auditEvent.create.metadataJson.changedFields, ['aiHistoryContentDays', 'accessTokenLifetimeMinutes']);
  assert.equal(auditEvent.create.metadataJson.before.aiHistoryContentDays, 22);
  assert.equal(auditEvent.create.metadataJson.after.aiHistoryContentDays, 30);
  assert.equal(auditEvent.create.metadataJson.after.accessTokenLifetimeMinutes, 25);
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

test('updateRetentionPolicy still succeeds when audit log write fails', async () => {
  let storedValue: any;
  const repository = {
    findByKey: async () => ({
      key: 'platform.retention_policy',
      valueJson: { aiHistoryContentDays: 7 },
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

  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    const prisma = {
      adminLogEvent: {
        upsert: async () => {
          throw new Error('audit writer down');
        },
      },
    };

    const service = new RetentionSettingsService(repository as any, prisma as any);
    const snapshot = await service.updateRetentionPolicy(createSession(), { aiHistoryContentDays: 15 });

    assert.equal(snapshot.policy.aiHistoryContentDays, 15);
    assert.equal(storedValue.aiHistoryContentDays, 15);
    assert.equal(warnings.length, 1);
    assert.equal((warnings[0] as unknown[])[0], '[retention-settings] audit log write failed');
  } finally {
    console.warn = originalWarn;
  }
});

test('updateRetentionPolicy does not write audit event when no fields changed', async () => {
  let auditCalls = 0;
  const repository = {
    findByKey: async () => ({
      key: 'platform.retention_policy',
      valueJson: { aiHistoryContentDays: 11 },
      updatedById: 'admin_0',
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    }),
    upsertJson: async (_key: string, valueJson: any) => ({
      key: 'platform.retention_policy',
      valueJson,
      updatedById: 'admin_1',
      updatedAt: new Date('2026-04-28T00:00:00.000Z'),
    }),
  };

  const prisma = {
    adminLogEvent: {
      upsert: async () => {
        auditCalls += 1;
        return null;
      },
    },
  };

  const service = new RetentionSettingsService(repository as any, prisma as any);
  await service.updateRetentionPolicy(createSession(), { aiHistoryContentDays: 11 });
  assert.equal(auditCalls, 0);
});
