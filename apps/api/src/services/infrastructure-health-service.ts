import { Inject, Injectable } from '@nestjs/common';
import net from 'node:net';

import { PrismaService } from '../database/prisma.service';

export interface ConnectionCheckResult {
  status: 'configured' | 'mock' | 'reachable' | 'unreachable';
  latencyMs?: number;
  error?: string;
}

function parseConnectionTarget(rawUrl: string): { host: string; port: number } {
  const url = new URL(rawUrl);
  const isRedis = url.protocol.startsWith('redis');
  const isPostgres = url.protocol.startsWith('postgres');

  return {
    host: url.hostname,
    port: Number(url.port || (isRedis ? 6379 : isPostgres ? 5432 : 0)),
  };
}

@Injectable()
export class InfrastructureHealthService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async checkDatabaseConnection(mode: 'mock' | 'connected'): Promise<ConnectionCheckResult> {
    if (mode !== 'connected') {
      return { status: 'mock' };
    }

    const startedAt = Date.now();

    try {
      await this.prismaService.$queryRaw`SELECT 1`;

      return {
        status: 'reachable',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: 'unreachable',
        error: error instanceof Error ? error.message : 'Unknown Prisma connection failure',
      };
    }
  }

  async checkDatabaseSchema(mode: 'mock' | 'connected'): Promise<ConnectionCheckResult> {
    if (mode !== 'connected') {
      return { status: 'mock' };
    }

    const startedAt = Date.now();

    try {
      const checks = await this.prismaService.$queryRaw<
        Array<{
          migrationsTable: string | null;
          userTable: string | null;
          workspaceTable: string | null;
        }>
      >`
        SELECT
          to_regclass('public."_prisma_migrations"')::text AS "migrationsTable",
          to_regclass('public."User"')::text AS "userTable",
          to_regclass('public."Workspace"')::text AS "workspaceTable"
      `;

      const snapshot = checks[0];
      const missingTables: string[] = [];

      if (!snapshot?.migrationsTable) {
        missingTables.push('_prisma_migrations');
      }

      if (!snapshot?.userTable) {
        missingTables.push('User');
      }

      if (!snapshot?.workspaceTable) {
        missingTables.push('Workspace');
      }

      if (missingTables.length > 0) {
        return {
          status: 'unreachable',
          error: `Required tables are missing: ${missingTables.join(', ')}.`,
        };
      }

      return {
        status: 'reachable',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: 'unreachable',
        error: error instanceof Error ? error.message : 'Unknown Prisma schema check failure',
      };
    }
  }

  async checkTcpConnection(rawUrl: string, mode: 'mock' | 'connected'): Promise<ConnectionCheckResult> {
    if (mode !== 'connected') {
      return { status: 'mock' };
    }

    const target = parseConnectionTarget(rawUrl);
    const startedAt = Date.now();

    return new Promise((resolve) => {
      const socket = net.createConnection(target);
      const finish = (result: ConnectionCheckResult) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(1000);
      socket.once('connect', () => {
        finish({
          status: 'reachable',
          latencyMs: Date.now() - startedAt,
        });
      });
      socket.once('timeout', () => {
        finish({
          status: 'unreachable',
          error: `Timed out connecting to ${target.host}:${target.port}`,
        });
      });
      socket.once('error', (error: Error) => {
        finish({
          status: 'unreachable',
          error: error.message,
        });
      });
    });
  }
}
