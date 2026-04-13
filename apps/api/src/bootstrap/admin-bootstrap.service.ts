import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { hashPassword } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly env = loadApiEnv();

  constructor(private readonly prisma: PrismaService) {}

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
      const existingAdmin = await this.prisma.userSystemRole.findFirst({
        where: { role: 'admin' },
      });

      if (existingAdmin) {
        // An admin already exists — do nothing. Idempotent by design.
        return;
      }

      const passwordHash = await hashPassword(password);
      const displayName = this.env.adminBootstrapName?.trim() || undefined;

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
