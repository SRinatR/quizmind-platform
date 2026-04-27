import { Prisma, type PrismaClient } from '@quizmind/database';

export interface ActorIdentity {
  email: string;
  displayName: string | null;
}

const userSelect = {
  id: true,
  email: true,
  displayName: true,
} satisfies Prisma.UserSelect;

export async function resolveActorIdentities(
  prisma: Pick<PrismaClient, 'user'>,
  actorIds: ReadonlyArray<string>,
): Promise<Map<string, ActorIdentity>> {
  const uniqueActorIds = Array.from(new Set(actorIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
  if (uniqueActorIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.user.findMany({
    where: { id: { in: uniqueActorIds } },
    select: userSelect,
  });

  return new Map(rows.map((row) => [row.id, { email: row.email, displayName: row.displayName }]));
}

export function enrichSearchTextWithActorIdentity(
  searchText: string | null | undefined,
  actorIdentity?: ActorIdentity,
): string | undefined {
  if (!searchText && !actorIdentity) return searchText ?? undefined;
  const parts = [searchText ?? ''];
  if (actorIdentity?.email) parts.push(actorIdentity.email.toLowerCase());
  if (actorIdentity?.displayName) parts.push(actorIdentity.displayName.toLowerCase());
  return parts.join(' ').trim() || undefined;
}
