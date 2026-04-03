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
    return user.systemRoleAssignments.map((assignment) => assignment.role);
  }
}
