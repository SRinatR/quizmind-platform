import assert from 'node:assert/strict';
import test from 'node:test';

import { WorkerDomainEventRepository } from '../src/repositories/domain-event.repository';

test('WorkerDomainEventRepository creates domain event and upserts AdminLogEvent', async () => {
  let upsertCalled = false;
  const repo = new WorkerDomainEventRepository({
    $transaction: async (fn: any) => fn({
      domainEvent: {
        create: async () => ({ id: 'dom_1' }),
      },
      adminLogEvent: {
        upsert: async () => {
          upsertCalled = true;
        },
      },
    }),
  } as any);

  const result = await repo.create({
    eventType: 'queue.job_failed',
    payloadJson: { queue: 'audit-export' },
    createdAt: new Date('2026-04-26T00:00:00.000Z'),
  });

  assert.equal(result.id, 'dom_1');
  assert.equal(upsertCalled, true);
});
