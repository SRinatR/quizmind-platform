import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import { type PlatformQueue } from '@quizmind/contracts';
import { Queue, type JobsOptions } from 'bullmq';
import {
  buildQueueJob,
  getQueueRuntimeOptions,
  resolveRedisConnectionOptions,
  type QueueDispatchRequest,
  type QueueJobEnvelope,
  type RedisConnectionOptions,
} from '@quizmind/queue';

@Injectable()
export class QueueDispatchService implements OnModuleDestroy {
  private readonly env = loadApiEnv();
  private readonly queues = new Map<PlatformQueue, Queue>();
  private readonly connectionOptions = this.resolveConnectionOptions();

  async dispatch<TPayload>(request: QueueDispatchRequest<TPayload>): Promise<QueueJobEnvelope<TPayload>> {
    const job = buildQueueJob(request);
    const runtimeOptions = getQueueRuntimeOptions(job.queue, {
      attempts: job.attempts,
    });

    if (this.env.runtimeMode !== 'connected') {
      return job;
    }

    const queue = this.getQueue(job.queue);
    const options: JobsOptions = {
      attempts: runtimeOptions.attempts,
      jobId: job.id,
      removeOnComplete: runtimeOptions.removeOnComplete,
      removeOnFail: runtimeOptions.removeOnFail,
    };

    await queue.add(job.id, job.payload, options);

    return job;
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
}
