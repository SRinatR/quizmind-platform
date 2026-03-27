import assert from 'node:assert/strict';
import test from 'node:test';

import { type PrismaClient } from '@quizmind/database';

import { WorkerDomainEventRepository } from '../src/repositories/domain-event.repository';

test('WorkerDomainEventRepository.create persists domain events with workspace scope', async () => {
  let capturedArgs: Record<string, unknown> | null = null;
  const prisma = {
    domainEvent: {
      async create(args: Record<string, unknown>) {
        capturedArgs = args;

        return {
          id: 'domain_1',
        };
      },
    },
  } as unknown as PrismaClient;
  const repository = new WorkerDomainEventRepository(prisma);
  const createdAt = new Date('2026-03-27T12:00:00.000Z');

  const result = await repository.create({
    workspaceId: 'ws_1',
    eventType: 'email.job_processed',
    payloadJson: {
      summary: 'Delivered auth.verify-email to owner@quizmind.dev.',
      queueJobId: 'emails:1',
    },
    createdAt,
  });

  const data = capturedArgs?.['data'] as Record<string, unknown>;

  assert.equal(result.id, 'domain_1');
  assert.equal(data?.['workspaceId'], 'ws_1');
  assert.equal(data?.['eventType'], 'email.job_processed');
  assert.deepEqual(data?.['payloadJson'], {
    summary: 'Delivered auth.verify-email to owner@quizmind.dev.',
    queueJobId: 'emails:1',
  });
  assert.equal((data?.['createdAt'] as Date)?.toISOString(), createdAt.toISOString());
});

test('WorkerDomainEventRepository.create persists platform-scoped events without workspace id', async () => {
  let capturedWorkspaceId: string | null | undefined;
  const prisma = {
    domainEvent: {
      async create(args: { data: { workspaceId: string | null } }) {
        capturedWorkspaceId = args.data.workspaceId;

        return {
          id: 'domain_2',
        };
      },
    },
  } as unknown as PrismaClient;
  const repository = new WorkerDomainEventRepository(prisma);

  await repository.create({
    workspaceId: null,
    eventType: 'email.job_failed',
    payloadJson: {
      summary: 'Failed auth.verify-email delivery to owner@quizmind.dev.',
    },
    createdAt: new Date('2026-03-27T12:05:00.000Z'),
  });

  assert.equal(capturedWorkspaceId, null);
});
