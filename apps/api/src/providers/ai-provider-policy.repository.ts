import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { type StructuredLogEvent } from '@quizmind/logger';

import { PrismaService } from '../database/prisma.service';

const aiProviderPolicySelect = {
  id: true,
  scopeKey: true,
  scopeType: true,
  workspaceId: true,
  mode: true,
  allowPlatformManaged: true,
  allowBringYourOwnKey: true,
  allowDirectProviderMode: true,
  allowWorkspaceSharedCredentials: true,
  requireAdminApproval: true,
  allowVisionOnUserKeys: true,
  providersJson: true,
  allowedModelTagsJson: true,
  defaultProvider: true,
  defaultModel: true,
  reason: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AiProviderPolicySelect;

const aiProviderPolicyHistorySelect = {
  id: true,
  workspaceId: true,
  actorId: true,
  action: true,
  targetId: true,
  metadataJson: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

const aiProviderPolicyHistoryActorSelect = {
  id: true,
  email: true,
  displayName: true,
} satisfies Prisma.UserSelect;

export type AiProviderPolicyRecord = Prisma.AiProviderPolicyGetPayload<{
  select: typeof aiProviderPolicySelect;
}>;

export type AiProviderPolicyHistoryRecord = Prisma.AuditLogGetPayload<{
  select: typeof aiProviderPolicyHistorySelect;
}>;

export type AiProviderPolicyHistoryActorRecord = Prisma.UserGetPayload<{
  select: typeof aiProviderPolicyHistoryActorSelect;
}>;
interface AiProviderPolicyLogInput {
  occurredAt: Date;
  auditLog: StructuredLogEvent;
  securityLog: StructuredLogEvent;
  domainEventType: string;
  domainPayload: Prisma.InputJsonValue;
}

interface UpsertAiProviderPolicyInput extends AiProviderPolicyLogInput {
  scopeKey: string;
  scopeType: 'global' | 'workspace';
  mode: 'platform_only' | 'user_key_optional' | 'user_key_required' | 'admin_approved_user_key' | 'enterprise_managed';
  allowPlatformManaged: boolean;
  allowBringYourOwnKey: boolean;
  allowDirectProviderMode: boolean;
  allowWorkspaceSharedCredentials: boolean;
  requireAdminApproval: boolean;
  allowVisionOnUserKeys: boolean;
  providersJson: Prisma.InputJsonValue;
  allowedModelTagsJson?: Prisma.InputJsonValue | null;
  defaultProvider?: string | null;
  defaultModel?: string | null;
  reason?: string | null;
  updatedById?: string | null;
}

function buildMetadataJson(event: StructuredLogEvent): Prisma.InputJsonValue {
  return {
    ...((event.metadata ?? {}) as Prisma.InputJsonObject),
    eventId: event.eventId,
    severity: event.severity,
    ...(event.status ? { status: event.status } : {}),
  };
}

function toNullableJsonInput(
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? Prisma.JsonNull : value;
}

@Injectable()
export class AiProviderPolicyRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findGlobal(): Promise<AiProviderPolicyRecord | null> {
    return this.prisma.aiProviderPolicy.findUnique({
      where: {
        scopeKey: 'global',
      },
      select: aiProviderPolicySelect,
    });
  }

  async listHistory(
    scopeKeys: string[],
    limit = 12,
  ): Promise<{
    records: AiProviderPolicyHistoryRecord[];
    actors: AiProviderPolicyHistoryActorRecord[];
  }> {
    if (scopeKeys.length === 0) {
      return {
        records: [],
        actors: [],
      };
    }

    const records = await this.prisma.auditLog.findMany({
      where: {
        targetType: 'ai_provider_policy',
        targetId: {
          in: scopeKeys,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: aiProviderPolicyHistorySelect,
    });
    const actorIds = Array.from(
      new Set(records.map((record) => record.actorId).filter((actorId): actorId is string => Boolean(actorId))),
    );
    const actors =
      actorIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: {
              id: {
                in: actorIds,
              },
            },
            select: aiProviderPolicyHistoryActorSelect,
          });

    return {
      records,
      actors,
    };
  }

  async upsertWithLogs(input: UpsertAiProviderPolicyInput): Promise<AiProviderPolicyRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const record = await transaction.aiProviderPolicy.upsert({
        where: {
          scopeKey: input.scopeKey,
        },
        create: {
          scopeKey: input.scopeKey,
          scopeType: input.scopeType,
          workspaceId: null,
          mode: input.mode,
          allowPlatformManaged: input.allowPlatformManaged,
          allowBringYourOwnKey: input.allowBringYourOwnKey,
          allowDirectProviderMode: input.allowDirectProviderMode,
          allowWorkspaceSharedCredentials: input.allowWorkspaceSharedCredentials,
          requireAdminApproval: input.requireAdminApproval,
          allowVisionOnUserKeys: input.allowVisionOnUserKeys,
          providersJson: input.providersJson,
          allowedModelTagsJson: toNullableJsonInput(input.allowedModelTagsJson),
          defaultProvider: input.defaultProvider ?? null,
          defaultModel: input.defaultModel ?? null,
          reason: input.reason ?? null,
          updatedById: input.updatedById ?? null,
        },
        update: {
          mode: input.mode,
          allowPlatformManaged: input.allowPlatformManaged,
          allowBringYourOwnKey: input.allowBringYourOwnKey,
          allowDirectProviderMode: input.allowDirectProviderMode,
          allowWorkspaceSharedCredentials: input.allowWorkspaceSharedCredentials,
          requireAdminApproval: input.requireAdminApproval,
          allowVisionOnUserKeys: input.allowVisionOnUserKeys,
          providersJson: input.providersJson,
          allowedModelTagsJson: toNullableJsonInput(input.allowedModelTagsJson),
          defaultProvider: input.defaultProvider ?? null,
          defaultModel: input.defaultModel ?? null,
          reason: input.reason ?? null,
          updatedById: input.updatedById ?? null,
        },
        select: aiProviderPolicySelect,
      });

      await transaction.auditLog.create({
        data: {
          workspaceId: null,
          actorId: input.auditLog.actorId,
          action: input.auditLog.eventType,
          targetType: input.auditLog.targetType,
          targetId: input.auditLog.targetId,
          metadataJson: buildMetadataJson(input.auditLog),
          createdAt: input.occurredAt,
        },
      });

      await transaction.securityEvent.create({
        data: {
          workspaceId: null,
          actorId: input.securityLog.actorId,
          eventType: input.securityLog.eventType,
          severity: input.securityLog.severity,
          metadataJson: buildMetadataJson(input.securityLog),
          createdAt: input.occurredAt,
        },
      });

      await transaction.domainEvent.create({
        data: {
          workspaceId: null,
          eventType: input.domainEventType,
          payloadJson: input.domainPayload,
          createdAt: input.occurredAt,
        },
      });

      return record;
    });
  }
}
