import { Inject, Injectable } from '@nestjs/common';
import { type CredentialOwnerType as DatabaseCredentialOwnerType, Prisma } from '@quizmind/database';
import { type CredentialValidationStatus } from '@quizmind/contracts';
import { type StructuredLogEvent } from '@quizmind/logger';

import { PrismaService } from '../database/prisma.service';

const providerCredentialSelect = {
  id: true,
  provider: true,
  ownerType: true,
  ownerId: true,
  userId: true,
  workspaceId: true,
  validationStatus: true,
  scopesJson: true,
  metadataJson: true,
  lastValidatedAt: true,
  disabledAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProviderCredentialSelect;

const runtimeProviderCredentialSelect = {
  ...providerCredentialSelect,
  encryptedSecretJson: true,
} satisfies Prisma.ProviderCredentialSelect;

export type ProviderCredentialRecord = Prisma.ProviderCredentialGetPayload<{
  select: typeof providerCredentialSelect;
}>;

export type RuntimeProviderCredentialRecord = Prisma.ProviderCredentialGetPayload<{
  select: typeof runtimeProviderCredentialSelect;
}>;

interface ProviderCredentialLogInput {
  workspaceId?: string | null;
  occurredAt: Date;
  auditLog: StructuredLogEvent;
  securityLog: StructuredLogEvent;
  domainEventType: string;
  domainPayload: Prisma.InputJsonValue;
}

interface ListAccessibleProviderCredentialsInput {
  userId: string;
  workspaceIds: string[];
  includePlatform?: boolean;
}

interface ListGovernanceProviderCredentialsInput {
  workspaceId: string;
  includePlatform?: boolean;
}

interface CreateProviderCredentialInput extends ProviderCredentialLogInput {
  provider: string;
  ownerType: DatabaseCredentialOwnerType;
  ownerId?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  encryptedSecretJson: Prisma.InputJsonValue;
  validationStatus: CredentialValidationStatus;
  scopesJson?: Prisma.InputJsonValue | null;
  metadataJson?: Prisma.InputJsonValue | null;
  lastValidatedAt?: Date | null;
}

interface RotateProviderCredentialInput extends ProviderCredentialLogInput {
  credentialId: string;
  encryptedSecretJson: Prisma.InputJsonValue;
  validationStatus: CredentialValidationStatus;
  scopesJson?: Prisma.InputJsonValue | null;
  metadataJson?: Prisma.InputJsonValue | null;
  lastValidatedAt?: Date | null;
}

interface RevokeProviderCredentialInput extends ProviderCredentialLogInput {
  credentialId: string;
  validationStatus: CredentialValidationStatus;
  metadataJson?: Prisma.InputJsonValue | null;
  revokedAt: Date;
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
export class ProviderCredentialRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listAccessible(
    input: ListAccessibleProviderCredentialsInput,
  ): Promise<ProviderCredentialRecord[]> {
    const predicates: Prisma.ProviderCredentialWhereInput[] = [
      {
        userId: input.userId,
      },
    ];

    if (input.workspaceIds.length > 0) {
      predicates.push({
        workspaceId: {
          in: input.workspaceIds,
        },
      });
    }

    if (input.includePlatform) {
      predicates.push({
        ownerType: 'platform',
      });
    }

    return this.prisma.providerCredential.findMany({
      where: {
        OR: predicates,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: providerCredentialSelect,
    });
  }

  listForGovernance(
    input: ListGovernanceProviderCredentialsInput,
  ): Promise<ProviderCredentialRecord[]> {
    const predicates: Prisma.ProviderCredentialWhereInput[] = [
      {
        workspaceId: input.workspaceId,
      },
    ];

    if (input.includePlatform) {
      predicates.push({
        ownerType: 'platform',
      });
    }

    return this.prisma.providerCredential.findMany({
      where: {
        OR: predicates,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: providerCredentialSelect,
    });
  }

  findById(credentialId: string): Promise<ProviderCredentialRecord | null> {
    return this.prisma.providerCredential.findUnique({
      where: {
        id: credentialId,
      },
      select: providerCredentialSelect,
    });
  }

  async resolveRuntimeCredential(input: {
    userId: string;
    workspaceId?: string | null;
    provider?: string;
  }): Promise<RuntimeProviderCredentialRecord | null> {
    const scopes: Prisma.ProviderCredentialWhereInput[] = [
      {
        ownerType: 'user',
        userId: input.userId,
        ...(input.workspaceId
          ? {
              OR: [{ workspaceId: input.workspaceId }, { workspaceId: null }],
            }
          : {
              workspaceId: null,
            }),
      },
    ];

    if (input.workspaceId) {
      scopes.push({
        ownerType: 'workspace',
        workspaceId: input.workspaceId,
      });
    }

    scopes.push({
      ownerType: 'platform',
    });

    const predicate: Prisma.ProviderCredentialWhereInput = {
      validationStatus: 'valid',
      revokedAt: null,
      disabledAt: null,
      OR: scopes,
      ...(input.provider
        ? {
            provider: input.provider,
          }
        : {}),
    };

    const records = await this.prisma.providerCredential.findMany({
      where: predicate,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: runtimeProviderCredentialSelect,
    });

    const userRecord = records.find(
      (record) =>
        record.ownerType === 'user' &&
        record.userId === input.userId &&
        (!input.workspaceId || record.workspaceId === input.workspaceId || record.workspaceId === null),
    );

    if (userRecord) {
      return userRecord;
    }

    if (input.workspaceId) {
      const workspaceRecord = records.find(
        (record) => record.ownerType === 'workspace' && record.workspaceId === input.workspaceId,
      );

      if (workspaceRecord) {
        return workspaceRecord;
      }
    }

    return records.find((record) => record.ownerType === 'platform') ?? null;
  }

  async createWithLogs(input: CreateProviderCredentialInput): Promise<ProviderCredentialRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const record = await transaction.providerCredential.create({
        data: {
          provider: input.provider,
          ownerType: input.ownerType,
          ownerId: input.ownerId ?? null,
          userId: input.userId ?? null,
          workspaceId: input.workspaceId ?? null,
          encryptedSecretJson: input.encryptedSecretJson,
          validationStatus: input.validationStatus,
          scopesJson: toNullableJsonInput(input.scopesJson),
          metadataJson: toNullableJsonInput(input.metadataJson),
          lastValidatedAt: input.lastValidatedAt ?? null,
        },
        select: providerCredentialSelect,
      });

      await transaction.auditLog.create({
        data: {
          workspaceId: input.workspaceId ?? null,
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
          workspaceId: input.workspaceId ?? null,
          actorId: input.securityLog.actorId,
          eventType: input.securityLog.eventType,
          severity: input.securityLog.severity,
          metadataJson: buildMetadataJson(input.securityLog),
          createdAt: input.occurredAt,
        },
      });

      await transaction.domainEvent.create({
        data: {
          workspaceId: input.workspaceId ?? null,
          eventType: input.domainEventType,
          payloadJson: input.domainPayload,
          createdAt: input.occurredAt,
        },
      });

      return record;
    });
  }

  async rotateWithLogs(input: RotateProviderCredentialInput): Promise<ProviderCredentialRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const record = await transaction.providerCredential.update({
        where: {
          id: input.credentialId,
        },
        data: {
          encryptedSecretJson: input.encryptedSecretJson,
          validationStatus: input.validationStatus,
          scopesJson: toNullableJsonInput(input.scopesJson),
          metadataJson: toNullableJsonInput(input.metadataJson),
          lastValidatedAt: input.lastValidatedAt ?? null,
          revokedAt: null,
          disabledAt: null,
        },
        select: providerCredentialSelect,
      });

      await transaction.auditLog.create({
        data: {
          workspaceId: record.workspaceId ?? null,
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
          workspaceId: record.workspaceId ?? null,
          actorId: input.securityLog.actorId,
          eventType: input.securityLog.eventType,
          severity: input.securityLog.severity,
          metadataJson: buildMetadataJson(input.securityLog),
          createdAt: input.occurredAt,
        },
      });

      await transaction.domainEvent.create({
        data: {
          workspaceId: record.workspaceId ?? null,
          eventType: input.domainEventType,
          payloadJson: input.domainPayload,
          createdAt: input.occurredAt,
        },
      });

      return record;
    });
  }

  async revokeWithLogs(input: RevokeProviderCredentialInput): Promise<ProviderCredentialRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const record = await transaction.providerCredential.update({
        where: {
          id: input.credentialId,
        },
        data: {
          validationStatus: input.validationStatus,
          revokedAt: input.revokedAt,
          metadataJson: input.metadataJson ?? undefined,
        },
        select: providerCredentialSelect,
      });

      await transaction.auditLog.create({
        data: {
          workspaceId: record.workspaceId ?? null,
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
          workspaceId: record.workspaceId ?? null,
          actorId: input.securityLog.actorId,
          eventType: input.securityLog.eventType,
          severity: input.securityLog.severity,
          metadataJson: buildMetadataJson(input.securityLog),
          createdAt: input.occurredAt,
        },
      });

      await transaction.domainEvent.create({
        data: {
          workspaceId: record.workspaceId ?? null,
          eventType: input.domainEventType,
          payloadJson: input.domainPayload,
          createdAt: input.occurredAt,
        },
      });

      return record;
    });
  }
}
