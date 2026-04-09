import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const quotaCounterSelect = {
  id: true,
  key: true,
  consumed: true,
  periodStart: true,
  periodEnd: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.QuotaCounterSelect;

const credentialSelect = {
  id: true,
  provider: true,
  ownerType: true,
  ownerId: true,
  userId: true,
  encryptedSecretJson: true,
  updatedAt: true,
  createdAt: true,
} satisfies Prisma.ProviderCredentialSelect;

export type AiProxyQuotaCounterRecord = Prisma.QuotaCounterGetPayload<{
  select: typeof quotaCounterSelect;
}>;

export type AiProxyCredentialRecord = Prisma.ProviderCredentialGetPayload<{
  select: typeof credentialSelect;
}>;

interface FindUserCredentialInput {
  provider: string;
  userId: string;
}

interface FindPlatformCredentialInput {
  provider: string;
}

interface RecordProxyEventInput {
  userId: string;
  requestId: string;
  provider: string;
  model: string;
  keySource: 'platform' | 'user';
  messageCount: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  responseId?: string;
  quotaKey: string;
  periodStart: Date;
  periodEnd: Date;
  consumeQuota: boolean;
  occurredAt: Date;
  durationMs?: number;
}

interface RecordProxyFailureInput {
  userId: string;
  requestId: string;
  provider: string;
  model: string;
  keySource: 'platform' | 'user';
  messageCount: number;
  status: 'error' | 'quota_exceeded';
  errorCode: string;
  errorMessage?: string;
  occurredAt: Date;
  durationMs?: number;
}

function toNullableJsonInput(
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? Prisma.JsonNull : value;
}

function normalizeTokenCount(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.trunc(value);
}

function normalizeDurationMs(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.trunc(value);
}

@Injectable()
export class AiProxyRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findBestUserCredential(input: FindUserCredentialInput): Promise<AiProxyCredentialRecord | null> {
    const candidates = await this.prisma.providerCredential.findMany({
      where: {
        provider: input.provider,
        validationStatus: 'valid',
        revokedAt: null,
        disabledAt: null,
        ownerType: 'user',
        userId: input.userId,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: credentialSelect,
    });

    return candidates[0] ?? null;
  }

  findLatestPlatformCredential(input: FindPlatformCredentialInput): Promise<AiProxyCredentialRecord | null> {
    return this.prisma.providerCredential.findFirst({
      where: {
        provider: input.provider,
        ownerType: 'platform',
        validationStatus: 'valid',
        revokedAt: null,
        disabledAt: null,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: credentialSelect,
    });
  }

  async recordProxyEvent(input: RecordProxyEventInput): Promise<AiProxyQuotaCounterRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const metadata = {
        requestId: input.requestId,
        provider: input.provider,
        model: input.model,
        keySource: input.keySource,
        messageCount: input.messageCount,
        usage: input.usage ?? null,
        responseId: input.responseId ?? null,
        quotaKey: input.quotaKey,
        quotaConsumed: false,
        quotaConsumedTotal: null,
        durationMs: normalizeDurationMs(input.durationMs),
      } satisfies Prisma.InputJsonObject;
      const promptTokens = normalizeTokenCount(input.usage?.promptTokens);
      const completionTokens = normalizeTokenCount(input.usage?.completionTokens);
      const totalTokens = normalizeTokenCount(input.usage?.totalTokens);
      const durationMs = normalizeDurationMs(input.durationMs);

      await transaction.aiRequest.create({
        data: {
          userId: input.userId,
          installationId: null,
          provider: input.provider,
          model: input.model,
          promptTokens,
          completionTokens,
          totalTokens: totalTokens > 0 ? totalTokens : promptTokens + completionTokens,
          keySource: input.keySource,
          status: 'success',
          errorCode: null,
          durationMs,
          requestMetadata: metadata,
          occurredAt: input.occurredAt,
        },
      });

      await transaction.activityLog.create({
        data: {
          actorId: input.userId,
          eventType: 'ai.proxy.completed',
          metadataJson: metadata,
          createdAt: input.occurredAt,
        },
      });

      await transaction.domainEvent.create({
        data: {
          eventType: 'ai.proxy.completed',
          payloadJson: metadata,
          createdAt: input.occurredAt,
        },
      });

      if (input.keySource === 'user') {
        await transaction.securityEvent.create({
          data: {
            actorId: input.userId,
            eventType: 'ai.proxy.user_key_used',
            severity: 'info',
            metadataJson: toNullableJsonInput(metadata),
            createdAt: input.occurredAt,
          },
        });
      }

      return null;
    });
  }

  async recordProxyFailure(input: RecordProxyFailureInput): Promise<void> {
    const metadata = {
      requestId: input.requestId,
      provider: input.provider,
      model: input.model,
      keySource: input.keySource,
      messageCount: input.messageCount,
      status: input.status,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage ?? null,
      durationMs: normalizeDurationMs(input.durationMs),
    } satisfies Prisma.InputJsonObject;
    const durationMs = normalizeDurationMs(input.durationMs);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.aiRequest.create({
        data: {
          userId: input.userId,
          installationId: null,
          provider: input.provider,
          model: input.model,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          keySource: input.keySource,
          status: input.status,
          errorCode: input.errorCode,
          durationMs,
          requestMetadata: metadata,
          occurredAt: input.occurredAt,
        },
      });

      await transaction.activityLog.create({
        data: {
          actorId: input.userId,
          eventType: 'ai.proxy.failed',
          metadataJson: metadata,
          createdAt: input.occurredAt,
        },
      });

      await transaction.domainEvent.create({
        data: {
          eventType: 'ai.proxy.failed',
          payloadJson: metadata,
          createdAt: input.occurredAt,
        },
      });

      if (input.keySource === 'user') {
        await transaction.securityEvent.create({
          data: {
            actorId: input.userId,
            eventType: 'ai.proxy.user_key_failed',
            severity: 'warn',
            metadataJson: toNullableJsonInput(metadata),
            createdAt: input.occurredAt,
          },
        });
      }
    });
  }
}
