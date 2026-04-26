import { Inject, Injectable } from '@nestjs/common';
import { type CredentialOwnerType as DatabaseCredentialOwnerType, Prisma } from '@quizmind/database';
import { type CredentialValidationStatus } from '@quizmind/contracts';
import { type StructuredLogEvent } from '@quizmind/logger';

import { PrismaService } from '../database/prisma.service';
import {
  createAuditLogWithReadModel,
  createDomainEventWithReadModel,
  createSecurityEventWithReadModel,
} from '../logs/admin-log-write-path';

const providerCredentialSelect = {
  id: true,
  provider: true,
  ownerType: true,
  ownerId: true,
  userId: true,
  encryptedSecretJson: true,
  validationStatus: true,
  scopesJson: true,
  metadataJson: true,
  lastValidatedAt: true,
  disabledAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProviderCredentialSelect;

export type ProviderCredentialRecord = Prisma.ProviderCredentialGetPayload<{
  select: typeof providerCredentialSelect;
}>;

interface ProviderCredentialLogInput {
  occurredAt: Date;
  auditLog: StructuredLogEvent;
  securityLog: StructuredLogEvent;
  domainEventType: string;
  domainPayload: Prisma.InputJsonValue;
}

interface ListAccessibleProviderCredentialsInput {
  userId: string;
  includePlatform?: boolean;
}

interface ListGovernanceProviderCredentialsInput {
  includePlatform?: boolean;
}

interface CreateProviderCredentialInput extends ProviderCredentialLogInput {
  provider: string;
  ownerType: DatabaseCredentialOwnerType;
  ownerId?: string | null;
  userId?: string | null;
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

interface ValidateProviderCredentialInput extends ProviderCredentialLogInput {
  credentialId: string;
  validationStatus: CredentialValidationStatus;
  metadataJson?: Prisma.InputJsonValue | null;
  lastValidatedAt: Date;
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
    const predicates: Prisma.ProviderCredentialWhereInput[] = [];

    if (input.includePlatform) {
      predicates.push({ ownerType: 'platform' });
    }

    return this.prisma.providerCredential.findMany({
      where: predicates.length > 0 ? { OR: predicates } : {},
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

  async createWithLogs(input: CreateProviderCredentialInput): Promise<ProviderCredentialRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const record = await transaction.providerCredential.create({
        data: {
          provider: input.provider,
          ownerType: input.ownerType,
          ownerId: input.ownerId ?? null,
          userId: input.userId ?? null,

          encryptedSecretJson: input.encryptedSecretJson,
          validationStatus: input.validationStatus,
          scopesJson: toNullableJsonInput(input.scopesJson),
          metadataJson: toNullableJsonInput(input.metadataJson),
          lastValidatedAt: input.lastValidatedAt ?? null,
        },
        select: providerCredentialSelect,
      });

      await createAuditLogWithReadModel(transaction, {
          actorId: input.auditLog.actorId,
          action: input.auditLog.eventType,
          targetType: input.auditLog.targetType,
          targetId: input.auditLog.targetId,
          metadataJson: buildMetadataJson(input.auditLog),
          createdAt: input.occurredAt,
      });

      await createSecurityEventWithReadModel(transaction, {
          actorId: input.securityLog.actorId,
          eventType: input.securityLog.eventType,
          severity: input.securityLog.severity,
          metadataJson: buildMetadataJson(input.securityLog),
          createdAt: input.occurredAt,
      });

      await createDomainEventWithReadModel(transaction, {
          eventType: input.domainEventType,
          payloadJson: input.domainPayload,
          createdAt: input.occurredAt,
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

      await createAuditLogWithReadModel(transaction, {
          actorId: input.auditLog.actorId,
          action: input.auditLog.eventType,
          targetType: input.auditLog.targetType,
          targetId: input.auditLog.targetId,
          metadataJson: buildMetadataJson(input.auditLog),
          createdAt: input.occurredAt,
      });

      await createSecurityEventWithReadModel(transaction, {
          actorId: input.securityLog.actorId,
          eventType: input.securityLog.eventType,
          severity: input.securityLog.severity,
          metadataJson: buildMetadataJson(input.securityLog),
          createdAt: input.occurredAt,
      });

      await createDomainEventWithReadModel(transaction, {
          eventType: input.domainEventType,
          payloadJson: input.domainPayload,
          createdAt: input.occurredAt,
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

      await createAuditLogWithReadModel(transaction, {
          actorId: input.auditLog.actorId,
          action: input.auditLog.eventType,
          targetType: input.auditLog.targetType,
          targetId: input.auditLog.targetId,
          metadataJson: buildMetadataJson(input.auditLog),
          createdAt: input.occurredAt,
      });

      await createSecurityEventWithReadModel(transaction, {
          actorId: input.securityLog.actorId,
          eventType: input.securityLog.eventType,
          severity: input.securityLog.severity,
          metadataJson: buildMetadataJson(input.securityLog),
          createdAt: input.occurredAt,
      });

      await createDomainEventWithReadModel(transaction, {
          eventType: input.domainEventType,
          payloadJson: input.domainPayload,
          createdAt: input.occurredAt,
      });

      return record;
    });
  }

  async validateWithLogs(input: ValidateProviderCredentialInput): Promise<ProviderCredentialRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const record = await transaction.providerCredential.update({
        where: {
          id: input.credentialId,
        },
        data: {
          validationStatus: input.validationStatus,
          metadataJson: toNullableJsonInput(input.metadataJson),
          lastValidatedAt: input.lastValidatedAt,
        },
        select: providerCredentialSelect,
      });

      await createAuditLogWithReadModel(transaction, {
          actorId: input.auditLog.actorId,
          action: input.auditLog.eventType,
          targetType: input.auditLog.targetType,
          targetId: input.auditLog.targetId,
          metadataJson: buildMetadataJson(input.auditLog),
          createdAt: input.occurredAt,
      });

      await createSecurityEventWithReadModel(transaction, {
          actorId: input.securityLog.actorId,
          eventType: input.securityLog.eventType,
          severity: input.securityLog.severity,
          metadataJson: buildMetadataJson(input.securityLog),
          createdAt: input.occurredAt,
      });

      await createDomainEventWithReadModel(transaction, {
          eventType: input.domainEventType,
          payloadJson: input.domainPayload,
          createdAt: input.occurredAt,
      });

      return record;
    });
  }
}
