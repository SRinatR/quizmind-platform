import { Inject, Injectable } from '@nestjs/common';
import { type SystemRole } from '@quizmind/contracts';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../../database/prisma.service';
import { BaseRepository } from './base.repository';

export const authUserInclude = {
  systemRoleAssignments: true,
} satisfies Prisma.UserInclude;

export type AuthUserRecord = Prisma.UserGetPayload<{
  include: typeof authUserInclude;
}>;

@Injectable()
export class UserRepository extends BaseRepository<AuthUserRecord, Prisma.UserCreateInput, Prisma.UserUpdateInput> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma);
  }

  findById(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: authUserInclude,
    });
  }

  findByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: authUserInclude,
    });
  }

  listAll(): Promise<AuthUserRecord[]> {
    return this.prisma.user.findMany({
      include: authUserInclude,
      orderBy: [{ email: 'asc' }],
    });
  }

  async listWithFilters(filters: {
    query?: string;
    role?: 'admin' | 'user';
    banned?: boolean;
    verified?: boolean;
    sort?: 'created-desc' | 'created-asc' | 'login-desc' | 'email-asc';
    page: number;
    limit: number;
  }): Promise<{ items: AuthUserRecord[]; total: number }> {
    const where: Prisma.UserWhereInput = {};

    if (filters.query) {
      where.OR = [
        { email: { contains: filters.query, mode: 'insensitive' } },
        { displayName: { contains: filters.query, mode: 'insensitive' } },
        { id: { contains: filters.query } },
      ];
    }

    if (filters.banned === true) {
      where.suspendedAt = { not: null };
    } else if (filters.banned === false) {
      where.suspendedAt = null;
    }

    if (filters.verified === true) {
      where.emailVerifiedAt = { not: null };
    } else if (filters.verified === false) {
      where.emailVerifiedAt = null;
    }

    if (filters.role === 'admin') {
      where.systemRoleAssignments = { some: {} };
    } else if (filters.role === 'user') {
      where.systemRoleAssignments = { none: {} };
    }

    const sortMap: Record<string, Prisma.UserOrderByWithRelationInput> = {
      'created-desc': { createdAt: 'desc' },
      'created-asc':  { createdAt: 'asc' },
      'login-desc':   { lastLoginAt: { sort: 'desc', nulls: 'last' } },
      'email-asc':    { email: 'asc' },
    };
    const orderBy = sortMap[filters.sort ?? 'created-desc'] ?? { createdAt: 'desc' };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: authUserInclude,
        orderBy,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
    ]);

    return { items, total };
  }

  countAdmins(): Promise<number> {
    return this.prisma.user.count({
      where: { systemRoleAssignments: { some: {} } },
    });
  }

  delete(id: string): Promise<AuthUserRecord> {
    return this.prisma.user.delete({
      where: { id },
      include: authUserInclude,
    });
  }

  create(data: Prisma.UserCreateInput): Promise<AuthUserRecord> {
    return this.prisma.user.create({
      data,
      include: authUserInclude,
    });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<AuthUserRecord> {
    return this.prisma.user.update({
      where: { id },
      data,
      include: authUserInclude,
    });
  }

  touchLastLogin(id: string, lastLoginAt = new Date()): Promise<AuthUserRecord> {
    return this.update(id, {
      lastLoginAt,
    });
  }

  markEmailVerified(id: string, verifiedAt = new Date()): Promise<AuthUserRecord> {
    return this.update(id, {
      emailVerifiedAt: verifiedAt,
    });
  }

  getSystemRoles(user: AuthUserRecord): SystemRole[] {
    return user.systemRoleAssignments.map((a) => a.role);
  }
}
