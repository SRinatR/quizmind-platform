import assert from 'node:assert/strict';
import test from 'node:test';

import { AdminLogRepository } from '../src/logs/admin-log.repository';

type Row = {
  id: string;
  stream: 'audit' | 'activity' | 'security' | 'domain';
  category: 'auth' | 'extension' | 'ai' | 'admin' | 'system' | null;
  occurredAt: Date;
};

function matchesCondition(row: Row, condition: any): boolean {
  if (condition.category) return row.category === condition.category;
  if (condition.stream) return row.stream === condition.stream;
  if (condition.occurredAt?.lt) return row.occurredAt < condition.occurredAt.lt;
  return true;
}

function matchesClause(row: Row, clause: any): boolean {
  const streamOk = clause.stream ? row.stream === clause.stream : true;
  const categoryOk = clause.category ? row.category === clause.category : true;
  const occurredAtOk = clause.occurredAt?.lt ? row.occurredAt < clause.occurredAt.lt : true;
  const notClauses = Array.isArray(clause.NOT) ? clause.NOT : clause.NOT ? [clause.NOT] : [];
  const notOk = notClauses.every((item: any) => !matchesCondition(row, item));
  return streamOk && categoryOk && occurredAtOk && notOk;
}

function createRepository(seedRows: Row[]) {
  const rows = [...seedRows];
  const calls: { findMany: any[]; deleteMany: any[] } = { findMany: [], deleteMany: [] };
  const prisma = {
    adminLogEvent: {
      findMany: async (args: any) => {
        calls.findMany.push(args);
        const matched = rows
          .filter((row) => args.where.OR.some((clause: any) => matchesClause(row, clause)))
          .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id))
          .slice(0, args.take);
        return matched.map((row) => ({ id: row.id, stream: row.stream, category: row.category }));
      },
      deleteMany: async (args: any) => {
        calls.deleteMany.push(args);
        const ids = new Set<string>(args.where.id.in);
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          if (ids.has(rows[index]!.id)) rows.splice(index, 1);
        }
        return { count: ids.size };
      },
    },
    auditLog: {
      deleteMany: async () => {
        throw new Error('legacy auditLog should not be touched');
      },
    },
    activityLog: {
      deleteMany: async () => {
        throw new Error('legacy activityLog should not be touched');
      },
    },
    securityEvent: {
      deleteMany: async () => {
        throw new Error('legacy securityEvent should not be touched');
      },
    },
    domainEvent: {
      deleteMany: async () => {
        throw new Error('legacy domainEvent should not be touched');
      },
    },
  };

  return { repo: new AdminLogRepository(prisma as any), calls, rows };
}

test('default retention does not delete when disabled and dry-run is default', async () => {
  const now = new Date('2026-04-27T00:00:00.000Z');
  const { repo, calls } = createRepository([
    { id: 'evt_1', stream: 'activity', category: 'system', occurredAt: new Date('2026-02-01T00:00:00.000Z') },
  ]);

  const result = await repo.pruneExpiredReadModel({ now, enabled: false });

  assert.equal(result.enabled, false);
  assert.equal(result.deleted, 0);
  assert.equal(result.selected, 0);
  assert.equal(calls.findMany.length, 0);
  assert.equal(calls.deleteMany.length, 0);
});

test('non-sensitive rows are selected in dry-run and deleted only with execute mode', async () => {
  const now = new Date('2026-04-27T00:00:00.000Z');
  const seed: Row[] = [
    { id: 'evt_activity_old', stream: 'activity', category: 'system', occurredAt: new Date('2026-01-01T00:00:00.000Z') },
    { id: 'evt_domain_old', stream: 'domain', category: 'system', occurredAt: new Date('2026-01-02T00:00:00.000Z') },
    { id: 'evt_activity_new', stream: 'activity', category: 'system', occurredAt: new Date('2026-04-20T00:00:00.000Z') },
  ];

  const dryRunRepo = createRepository(seed);
  const dryRun = await dryRunRepo.repo.pruneExpiredReadModel({
    now,
    enabled: true,
    dryRun: true,
    limit: 1000,
    retentionDays: { activity: 30, domain: 30, system: 30 },
  });
  assert.equal(dryRun.selected, 2);
  assert.equal(dryRun.deleted, 0);
  assert.equal(dryRunRepo.calls.deleteMany.length, 0);

  const executeRepo = createRepository(seed);
  const execute = await executeRepo.repo.pruneExpiredReadModel({
    now,
    enabled: true,
    dryRun: false,
    limit: 1000,
    retentionDays: { activity: 30, domain: 30, system: 30 },
  });
  assert.equal(execute.selected, 2);
  assert.equal(execute.deleted, 2);
  assert.equal(executeRepo.calls.deleteMany.length, 1);
  assert.deepEqual(executeRepo.calls.deleteMany[0].where.id.in.sort(), ['evt_activity_old', 'evt_domain_old']);
});

test('sensitive rows are protected unless both include-sensitive and sensitive enabled are true', async () => {
  const now = new Date('2026-04-27T00:00:00.000Z');
  const seed: Row[] = [
    { id: 'evt_audit_old', stream: 'audit', category: 'admin', occurredAt: new Date('2024-01-01T00:00:00.000Z') },
    { id: 'evt_security_old', stream: 'security', category: 'auth', occurredAt: new Date('2024-01-02T00:00:00.000Z') },
    { id: 'evt_admin_cat_old', stream: 'domain', category: 'admin', occurredAt: new Date('2024-01-03T00:00:00.000Z') },
  ];

  const protectedRun = createRepository(seed);
  const resultProtected = await protectedRun.repo.pruneExpiredReadModel({
    now,
    enabled: true,
    dryRun: false,
    includeSensitive: true,
    sensitiveEnabled: false,
    retentionDays: { audit: 365, security: 365, admin: 365 },
  });
  assert.equal(resultProtected.deleted, 0);

  const sensitiveRun = createRepository(seed);
  const resultSensitive = await sensitiveRun.repo.pruneExpiredReadModel({
    now,
    enabled: true,
    dryRun: false,
    includeSensitive: true,
    sensitiveEnabled: true,
    retentionDays: { audit: 365, security: 365, admin: 365 },
  });
  assert.equal(resultSensitive.deleted, 3);
  assert.equal(resultSensitive.deletedByStream.audit, 1);
  assert.equal(resultSensitive.deletedByStream.security, 1);
  assert.equal(resultSensitive.deletedByCategory.admin, 2);
});

test('audit/security rows with category=system remain protected unless sensitive mode is explicitly enabled', async () => {
  const now = new Date('2026-04-27T00:00:00.000Z');
  const seed: Row[] = [
    { id: 'evt_audit_system_old', stream: 'audit', category: 'system', occurredAt: new Date('2024-01-01T00:00:00.000Z') },
    { id: 'evt_security_system_old', stream: 'security', category: 'system', occurredAt: new Date('2024-01-02T00:00:00.000Z') },
    { id: 'evt_activity_system_old', stream: 'activity', category: 'system', occurredAt: new Date('2026-01-03T00:00:00.000Z') },
    { id: 'evt_domain_system_old', stream: 'domain', category: 'system', occurredAt: new Date('2026-01-04T00:00:00.000Z') },
  ];

  const protectedRun = createRepository(seed);
  const resultProtected = await protectedRun.repo.pruneExpiredReadModel({
    now,
    enabled: true,
    dryRun: false,
    includeSensitive: false,
    sensitiveEnabled: false,
    retentionDays: { activity: 30, domain: 30, system: 30, audit: 365, security: 365 },
  });
  assert.equal(resultProtected.deleted, 2);
  assert.equal(resultProtected.deletedByStream.activity, 1);
  assert.equal(resultProtected.deletedByStream.domain, 1);
  assert.equal(resultProtected.deletedByStream.audit ?? 0, 0);
  assert.equal(resultProtected.deletedByStream.security ?? 0, 0);

  const sensitiveRun = createRepository(seed);
  const resultSensitive = await sensitiveRun.repo.pruneExpiredReadModel({
    now,
    enabled: true,
    dryRun: false,
    includeSensitive: true,
    sensitiveEnabled: true,
    retentionDays: { activity: 30, domain: 30, system: 30, audit: 365, security: 365 },
  });
  assert.equal(resultSensitive.deleted, 4);
  assert.equal(resultSensitive.deletedByStream.audit, 1);
  assert.equal(resultSensitive.deletedByStream.security, 1);
});

test('retention respects batch limit and only touches AdminLogEvent read model', async () => {
  const now = new Date('2026-04-27T00:00:00.000Z');
  const seed: Row[] = [
    { id: 'evt_1', stream: 'activity', category: 'system', occurredAt: new Date('2026-01-01T00:00:00.000Z') },
    { id: 'evt_2', stream: 'activity', category: 'system', occurredAt: new Date('2026-01-02T00:00:00.000Z') },
    { id: 'evt_3', stream: 'activity', category: 'system', occurredAt: new Date('2026-01-03T00:00:00.000Z') },
  ];
  const { repo, calls } = createRepository(seed);

  const result = await repo.pruneExpiredReadModel({
    now,
    enabled: true,
    dryRun: false,
    limit: 2,
    retentionDays: { activity: 30, system: 30 },
  });

  assert.equal(result.deleted, 3);
  assert.equal(calls.findMany[0].take, 2);
  assert.equal(calls.deleteMany.length, 2);
});
