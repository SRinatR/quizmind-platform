import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { hashPassword } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';

import { PrismaService } from '../database/prisma.service';

type UserRecord = {
  id: string;
  email: string;
  systemRoleAssignments?: Array<{ role: string }>;
};

type UserSystemRoleDelegate = {
  findFirst?: (args: { where: { role: 'admin' } }) => Promise<{ userId: string } | null>;
  upsert?: (args: {
    where: { userId_role: { userId: string; role: 'admin' } };
    update: Record<string, never>;
    create: { userId: string; role: 'admin' };
  }) => Promise<unknown>;
};

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly env = loadApiEnv();

  constructor(private readonly prisma: PrismaService) {}

  private getUserSystemRoleDelegate(): UserSystemRoleDelegate | null {
    const prismaValue = this.prisma as unknown as { userSystemRole?: UserSystemRoleDelegate } | undefined;
    return prismaValue?.userSystemRole ?? null;
  }

  private async ensureAdminRoleAssignment(userId: string): Promise<void> {
    const userSystemRole = this.getUserSystemRoleDelegate();

    if (userSystemRole?.upsert) {
      await userSystemRole.upsert({
        where: {
          userId_role: {
            userId,
            role: 'admin',
          },
        },
        update: {},
        create: {
          userId,
          role: 'admin',
        },
      });
      return;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        systemRoleAssignments: {
          connectOrCreate: {
            where: {
              userId_role: {
                userId,
                role: 'admin',
              },
            },
            create: { role: 'admin' },
          },
        },
      },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    // Skip in mock/test mode — no DB connection available.
    if (this.env.runtimeMode !== 'connected') {
      return;
    }

    const email = this.env.adminBootstrapEmail?.trim().toLowerCase();
    const password = this.env.adminBootstrapPassword;

    if (!email || !password) {
      console.log(
        JSON.stringify({
          level: 'info',
          message: 'admin-bootstrap: skipped — ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are not set.',
        }),
      );
      return;
    }

    try {
      const displayName = this.env.adminBootstrapName?.trim() || undefined;
      const userSystemRole = this.getUserSystemRoleDelegate();
      const existingAdminRole = userSystemRole?.findFirst
        ? await userSystemRole.findFirst({ where: { role: 'admin' } })
        : await this.prisma.user.findFirst({
            where: { systemRoleAssignments: { some: { role: 'admin' } } },
            select: { id: true },
          });

      const bootstrapUser = (await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          systemRoleAssignments: {
            select: { role: true },
          },
        },
      })) as UserRecord | null;

      if (!bootstrapUser) {
        if (existingAdminRole) {
          return;
        }

        const passwordHash = await hashPassword(password);

        await this.prisma.user.create({
          data: {
            email,
            passwordHash,
            displayName,
            emailVerifiedAt: new Date(),
            systemRoleAssignments: {
              create: { role: 'admin' },
            },
          },
        });

        console.log(
          JSON.stringify({
            level: 'info',
            message: 'admin-bootstrap: initial admin account created.',
            email,
          }),
        );
        return;
      }

      const hasAdminRole = bootstrapUser.systemRoleAssignments?.some((assignment) => assignment.role === 'admin') ?? false;

      if (!hasAdminRole) {
        await this.ensureAdminRoleAssignment(bootstrapUser.id);
      }
    } catch (error) {
      // Non-fatal: log and continue startup. The operator can investigate and
      // the next deploy will retry (idempotently) once the issue is resolved.
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'admin-bootstrap: failed to create initial admin account.',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
