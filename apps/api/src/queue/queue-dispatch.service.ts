import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import { type PlatformQueue } from '@quizmind/contracts';
import { Queue, type JobsOptions } from 'bullmq';
import { buildQueueJob, type QueueDispatchRequest, type QueueJobEnvelope } from '@quizmind/queue';

interface RedisConnectionOptions {
  db?: number;
  host: string;
  password?: string;
  port: number;
  username?: string;
}

@Injectable()
export class QueueDispatchService implements OnModuleDestroy {
  private readonly env = loadApiEnv();
  private readonly queues = new Map<PlatformQueue, Queue>();
  private readonly connectionOptions = this.resolveConnectionOptions();

  async dispatch<TPayload>(request: QueueDispatchRequest<TPayload>): Promise<QueueJobEnvelope<TPayload>> {
    const job = buildQueueJob(request);

    if (this.env.runtimeMode !== 'connected') {
      return job;
    }

    const queue = this.getQueue(job.queue);
    const options: JobsOptions = {
      attempts: job.attempts,
      jobId: job.id,
      removeOnComplete: 250,
      removeOnFail: 250,
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
    const redisUrl = new URL(this.env.redisUrl);
    const pathname = redisUrl.pathname.startsWith('/') ? redisUrl.pathname.slice(1) : redisUrl.pathname;

    return {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      ...(redisUrl.username ? { username: redisUrl.username } : {}),
      ...(redisUrl.password ? { password: redisUrl.password } : {}),
      ...(pathname ? { db: Number(pathname) } : {}),
    };
  }
}
