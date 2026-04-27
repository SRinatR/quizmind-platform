import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { hashPassword } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';

import { PrismaService } from '../database/prisma.service';

type UserRecord = {
  id: string;
  email: string;
  systemRoleAssignments?: Array<{ role: string }>;
};

type UserDelegate = {
  findFirst?: (args: {
    where: { systemRoleAssignments: { some: { role: 'admin' } } };
    select: { id: true };
  }) => Promise<{ id: string } | null>;
  findUnique?: (args: {
    where: { email: string };
    select: {
      id: true;
      email: true;
      systemRoleAssignments: { select: { role: true } };
    };
  }) => Promise<UserRecord | null>;
  create?: (args: {
    data: {
      email: string;
      passwordHash: string;
      displayName?: string;
      emailVerifiedAt: Date;
      systemRoleAssignments: { create: { role: 'admin' } };
    };
  }) => Promise<unknown>;
  update?: (args: {
    where: { id: string };
    data: {
      systemRoleAssignments: {
        connectOrCreate: {
          where: {
            userId_role: {
              userId: string;
              role: 'admin';
            };
          };
          create: { role: 'admin' };
        };
      };
    };
  }) => Promise<unknown>;
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

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private getUserDelegate(): UserDelegate | null {
    const prismaValue = this.prisma as unknown as { user?: UserDelegate } | undefined;
    return prismaValue?.user ?? null;
  }

  private getUserSystemRoleDelegate(): UserSystemRoleDelegate | null {
    const prismaValue = this.prisma as unknown as { userSystemRole?: UserSystemRoleDelegate } | undefined;
    return prismaValue?.userSystemRole ?? null;
  }

  private hasUserDelegateMethods(user: UserDelegate | null): user is Required<Pick<UserDelegate, 'findFirst' | 'findUnique' | 'create' | 'update'>> {
    return Boolean(user?.findFirst && user.findUnique && user.create && user.update);
  }

  private logDelegateWarning(delegate: 'user' | 'userSystemRole'): void {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: `admin-bootstrap: skipped — prisma.${delegate} delegate is unavailable in this runtime.`,
      }),
    );
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

    const user = this.getUserDelegate();
    if (!user?.update) {
      this.logDelegateWarning('user');
      return;
    }

    await user.update({
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

    const user = this.getUserDelegate();
    if (!this.hasUserDelegateMethods(user)) {
      this.logDelegateWarning('user');
      return;
    }

    const userSystemRole = this.getUserSystemRoleDelegate();
    if (!userSystemRole) {
      this.logDelegateWarning('userSystemRole');
    }

    try {
      const displayName = this.env.adminBootstrapName?.trim() || undefined;
      const existingAdminRole = userSystemRole?.findFirst
        ? await userSystemRole.findFirst({ where: { role: 'admin' } })
        : await user.findFirst({
            where: { systemRoleAssignments: { some: { role: 'admin' } } },
            select: { id: true },
          });

      const bootstrapUser = await user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          systemRoleAssignments: {
            select: { role: true },
          },
        },
      });

      if (!bootstrapUser) {
        if (existingAdminRole) {
          return;
        }

        const passwordHash = await hashPassword(password);

        await user.create({
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
