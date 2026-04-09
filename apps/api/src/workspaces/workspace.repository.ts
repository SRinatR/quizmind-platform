import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const accessibleWorkspaceInclude = {
  memberships: {
    where: {},
  },
} satisfies Prisma.WorkspaceInclude;

export type AccessibleWorkspaceRecord = Prisma.WorkspaceGetPayload<{
  include: typeof accessibleWorkspaceInclude;
}>;

@Injectable()
export class WorkspaceRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findById(id: string): Promise<AccessibleWorkspaceRecord | null> {
    return this.prisma.workspace.findUnique({
      where: { id },
      include: accessibleWorkspaceInclude,
    });
  }

  findBySlug(slug: string): Promise<AccessibleWorkspaceRecord | null> {
    return this.prisma.workspace.findUnique({
      where: { slug },
      include: accessibleWorkspaceInclude,
    });
  }

  findByUserId(userId: string): Promise<AccessibleWorkspaceRecord[]> {
    return this.prisma.workspace.findMany({
      where: {
        memberships: {
          some: { userId },
        },
      },
      include: {
        memberships: {
          where: { userId },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

}
