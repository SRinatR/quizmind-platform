import { PrismaService } from '../../database/prisma.service';

export abstract class BaseRepository<TRecord, TCreateInput, TUpdateInput> {
  constructor(protected readonly prisma: PrismaService) {}

  abstract findById(id: string): Promise<TRecord | null>;
  abstract create(data: TCreateInput): Promise<TRecord>;
  abstract update(id: string, data: TUpdateInput): Promise<TRecord>;
}
