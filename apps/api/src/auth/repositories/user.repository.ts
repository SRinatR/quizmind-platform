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

type AdminUserSort = 'created-desc' | 'created-asc' | 'login-desc' | 'email-asc';

export interface AdminUserListFilters {
  query?: string;
  role?: 'admin' | 'user';
  banned?: boolean;
  verified?: boolean;
  sort?: AdminUserSort;
  page?: number;
  limit: number;
  cursor?: string;
}

interface CursorPayload {
  s: AdminUserSort;
  c: string | null;
  i: string;
}

interface AdminUserListResult {
  items: AuthUserRecord[];
  total?: number;
  hasNext: boolean;
  nextCursor: string | null;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (
      parsed.s !== 'created-desc'
      && parsed.s !== 'created-asc'
      && parsed.s !== 'login-desc'
      && parsed.s !== 'email-asc'
    ) {
      return null;
    }
    if (typeof parsed.i !== 'string' || parsed.i.trim().length === 0) {
      return null;
    }
    if (!(typeof parsed.c === 'string' || parsed.c === null)) {
      return null;
    }
    if ((parsed.s === 'created-desc' || parsed.s === 'created-asc') && parsed.c === null) {
      return null;
    }
    if ((parsed.s === 'created-desc' || parsed.s === 'created-asc' || parsed.s === 'login-desc') && parsed.c !== null) {
      const timestamp = Date.parse(parsed.c);
      if (!Number.isFinite(timestamp)) {
        return null;
      }
    }
    if (parsed.s === 'email-asc' && parsed.c === null) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

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

  private buildWhere(filters: AdminUserListFilters): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};

    if (filters.query) {
      const query = filters.query.trim();
      where.OR = [
        { email: { contains: query, mode: 'insensitive' } },
        { displayName: { contains: query, mode: 'insensitive' } },
        { id: { contains: query } },
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

    return where;
  }

  async listWithFilters(filters: AdminUserListFilters): Promise<AdminUserListResult> {
    const where = this.buildWhere(filters);
    const sort: AdminUserSort = filters.sort ?? 'created-desc';
    const isLegacyPageMode = typeof filters.page === 'number' && Number.isFinite(filters.page) && !filters.cursor;
    if (!isLegacyPageMode) {
      return this.listWithCursor(filters, where, sort);
    }

    const page = Math.max(1, filters.page ?? 1);
    const orderBy = this.getOrderBy(sort);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: authUserInclude,
        orderBy,
        skip: (page - 1) * filters.limit,
        take: filters.limit,
      }),
    ]);

    return {
      items,
      total,
      hasNext: page * filters.limit < total,
      nextCursor: null,
    };
  }

  private getOrderBy(sort: AdminUserSort): Prisma.UserOrderByWithRelationInput[] {
    switch (sort) {
      case 'created-asc':
        return [{ createdAt: 'asc' }, { id: 'asc' }];
      case 'login-desc':
        return [{ lastLoginAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
      case 'email-asc':
        return [{ email: 'asc' }, { id: 'asc' }];
      case 'created-desc':
      default:
        return [{ createdAt: 'desc' }, { id: 'desc' }];
    }
  }

  private buildCursorWhere(sort: AdminUserSort, payload: CursorPayload): Prisma.UserWhereInput {
    if (sort === 'created-desc' || sort === 'created-asc') {
      const createdAt = new Date(payload.c ?? '');
      const idDirection = sort === 'created-desc' ? 'lt' : 'gt';
      const createdDirection = sort === 'created-desc' ? 'lt' : 'gt';
      return {
        OR: [
          { createdAt: { [createdDirection]: createdAt } },
          { createdAt, id: { [idDirection]: payload.i } },
        ],
      } as Prisma.UserWhereInput;
    }

    if (sort === 'email-asc') {
      const email = payload.c ?? '';
      return {
        OR: [
          { email: { gt: email } },
          { email, id: { gt: payload.i } },
        ],
      };
    }

    const lastLogin = payload.c ? new Date(payload.c) : null;
    if (!lastLogin) {
      return {
        AND: [{ lastLoginAt: null }, { id: { lt: payload.i } }],
      };
    }

    return {
      OR: [
        { lastLoginAt: { lt: lastLogin } },
        { lastLoginAt: lastLogin, id: { lt: payload.i } },
        { lastLoginAt: null },
      ],
    };
  }

  private async listWithCursor(
    filters: AdminUserListFilters,
    baseWhere: Prisma.UserWhereInput,
    sort: AdminUserSort,
  ): Promise<AdminUserListResult> {
    const payload = decodeCursor(filters.cursor ?? '');
    const where: Prisma.UserWhereInput =
      payload && payload.s === sort
        ? { AND: [baseWhere, this.buildCursorWhere(sort, payload)] }
        : baseWhere;

    const items = await this.prisma.user.findMany({
      where,
      include: authUserInclude,
      orderBy: this.getOrderBy(sort),
      take: filters.limit + 1,
    });

    const hasNext = items.length > filters.limit;
    const pageItems = hasNext ? items.slice(0, filters.limit) : items;
    const lastItem = pageItems.at(-1);

    return {
      items: pageItems,
      hasNext,
      nextCursor: hasNext && lastItem
        ? encodeCursor({
            s: sort,
            c:
              sort === 'email-asc'
                ? lastItem.email
                : sort === 'login-desc'
                  ? lastItem.lastLoginAt?.toISOString() ?? null
                  : lastItem.createdAt.toISOString(),
            i: lastItem.id,
          })
        : null,
    };
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
