import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import { type PlatformQueue, type PlatformQueueHistoryPolicy } from '@quizmind/contracts';
import { Queue, type JobsOptions } from 'bullmq';
import {
  buildQueueJob,
  getQueueRuntimeOptions,
  listQueueDefinitions,
  resolveRedisConnectionOptions,
  type QueueDispatchRequest,
  type QueueDefinition,
  type QueueJobEnvelope,
  type RedisConnectionOptions,
} from '@quizmind/queue';
import { RetentionSettingsService } from '../settings/retention-settings.service';

function toBullMqJobId(jobId: string): string {
  /*
   * BullMQ custom job ids cannot contain ":".
   * We keep domain-level queue job ids untouched and only encode the id
   * at the BullMQ boundary so dedupe semantics stay deterministic.
   */
  return encodeURIComponent(jobId);
}

@Injectable()
export class QueueDispatchService implements OnModuleDestroy {
  constructor(
    @Inject(RetentionSettingsService)
    private readonly retentionSettingsService: RetentionSettingsService,
  ) {}

  private readonly env = loadApiEnv();
  private readonly queues = new Map<PlatformQueue, Queue>();
  private readonly connectionOptions = this.resolveConnectionOptions();

  async dispatch<TPayload>(request: QueueDispatchRequest<TPayload>): Promise<QueueJobEnvelope<TPayload>> {
    const queuePolicy = await this.resolveEffectiveQueuePolicy();
    const job = buildQueueJob(request, queuePolicy);
    const runtimeOptions = getQueueRuntimeOptions(job.queue, {
      attempts: job.attempts,
    }, queuePolicy);

    if (this.env.runtimeMode !== 'connected') {
      return job;
    }

    const queue = this.getQueue(job.queue);
    const options: JobsOptions = {
      attempts: runtimeOptions.attempts,
      jobId: toBullMqJobId(job.id),
      removeOnComplete: runtimeOptions.removeOnComplete,
      removeOnFail: runtimeOptions.removeOnFail,
    };

    await queue.add(job.id, job.payload, options);

    return job;
  }

  async listQueueDefinitions(): Promise<QueueDefinition[]> {
    return listQueueDefinitions(await this.resolveEffectiveQueuePolicy());
  }

  async onModuleDestroy() {
    await Promise.all(
      Array.from(this.queues.values()).map(async (queue) => {
        await queue.close();
      }),
    );
  }

  private getQueue(queueName: PlatformQueue): Queue {
    let queue = this.queues.get(queueName);

    if (!queue) {
      queue = new Queue(queueName, {
        connection: this.connectionOptions,
      });
      this.queues.set(queueName, queue);
    }

    return queue;
  }

  private resolveConnectionOptions(): RedisConnectionOptions {
    return resolveRedisConnectionOptions(this.env.redisUrl);
  }

  private async resolveEffectiveQueuePolicy(): Promise<PlatformQueueHistoryPolicy | undefined> {
    try {
      const policy = await this.retentionSettingsService.getEffectiveRetentionPolicy();
      return policy.queueHistory;
    } catch {
      return undefined;
    }
  }
}
