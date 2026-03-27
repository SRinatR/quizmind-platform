import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type SubscriptionStatus } from '@quizmind/database';

import { PrismaService } from '../database/prisma.service';

const quotaCounterSelect = {
  id: true,
  workspaceId: true,
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
  workspaceId: true,
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
  workspaceId: string;
  allowWorkspaceShared: boolean;
}

interface RecordProxyEventInput {
  workspaceId: string;
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
  workspaceId: string;
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

const subscriptionStatusesWithPlanAccess: SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'grace_period',
];

function toNullableJsonInput(
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? Prisma.JsonNull : value;
}

function selectCredentialRank(record: AiProxyCredentialRecord, workspaceId: string): number {
  if (record.ownerType === 'user' && record.workspaceId === workspaceId) {
    return 0;
  }

  if (record.ownerType === 'user' && record.workspaceId === null) {
    return 1;
  }

  if (record.ownerType === 'workspace' && record.workspaceId === workspaceId) {
    return 2;
  }

  return 10;
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

  async findWorkspacePlanCode(workspaceId: string): Promise<string | undefined> {
    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId,
        status: {
          in: subscriptionStatusesWithPlanAccess,
        },
      },
      orderBy: [{ currentPeriodEnd: 'desc' }, { createdAt: 'desc' }],
      select: {
        planId: true,
      },
    });

    const latestSubscription =
      activeSubscription ??
      (await this.prisma.subscription.findFirst({
        where: {
          workspaceId,
        },
        orderBy: [{ currentPeriodEnd: 'desc' }, { createdAt: 'desc' }],
        select: {
          planId: true,
        },
      }));

    if (!latestSubscription?.planId) {
      return undefined;
    }

    const plan = await this.prisma.plan.findUnique({
      where: {
        id: latestSubscription.planId,
      },
      select: {
        code: true,
      },
    });

    return plan?.code ?? undefined;
  }

  async findUsageLimit(workspaceId: string, key: string): Promise<number | undefined> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId,
      },
      orderBy: [{ currentPeriodEnd: 'desc' }, { createdAt: 'desc' }],
      include: {
        plan: {
          include: {
            entitlements: true,
          },
        },
        workspace: {
          include: {
            entitlementOverrides: true,
          },
        },
      },
    });

    if (!subscription) {
      return undefined;
    }

    const override = subscription.workspace.entitlementOverrides.find((entry) => entry.key === key);

    if (override) {
      if (!override.enabled) {
        return 0;
      }

      return override.limitValue ?? undefined;
    }

    const planEntitlement = subscription.plan.entitlements.find((entry) => entry.key === key);

    if (!planEntitlement) {
      return undefined;
    }

    if (!planEntitlement.enabled) {
      return 0;
    }

    return planEntitlement.limitValue ?? undefined;
  }

  findActiveQuotaCounter(
    workspaceId: string,
    key: string,
    occurredAt: Date,
  ): Promise<AiProxyQuotaCounterRecord | null> {
    return this.prisma.quotaCounter.findFirst({
      where: {
        workspaceId,
        key,
        periodStart: {
          lte: occurredAt,
        },
        periodEnd: {
          gt: occurredAt,
        },
      },
      orderBy: [{ periodEnd: 'desc' }, { updatedAt: 'desc' }],
      select: quotaCounterSelect,
    });
  }

  async findBestUserCredential(input: FindUserCredentialInput): Promise<AiProxyCredentialRecord | null> {
    const predicates: Prisma.ProviderCredentialWhereInput[] = [
      {
        ownerType: 'user',
        userId: input.userId,
        OR: [
          {
            workspaceId: input.workspaceId,
          },
          {
            workspaceId: null,
          },
        ],
      },
    ];

    if (input.allowWorkspaceShared) {
      predicates.push({
        ownerType: 'workspace',
        workspaceId: input.workspaceId,
      });
    }

    const candidates = await this.prisma.providerCredential.findMany({
      where: {
        provider: input.provider,
        validationStatus: 'valid',
        revokedAt: null,
        disabledAt: null,
        OR: predicates,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: credentialSelect,
    });

    const sorted = [...candidates].sort((left, right) => {
      const rankDifference = selectCredentialRank(left, input.workspaceId) - selectCredentialRank(right, input.workspaceId);

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return right.updatedAt.getTime() - left.updatedAt.getTime();
    });

    return sorted[0] ?? null;
  }

  async recordProxyEvent(input: RecordProxyEventInput): Promise<AiProxyQuotaCounterRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const nextCounter = input.consumeQuota
        ? await transaction.quotaCounter.upsert({
            where: {
              workspaceId_key_periodStart_periodEnd: {
                workspaceId: input.workspaceId,
                key: input.quotaKey,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
              },
            },
            update: {
              consumed: {
                increment: 1,
              },
            },
            create: {
              workspaceId: input.workspaceId,
              key: input.quotaKey,
              consumed: 1,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
            },
            select: quotaCounterSelect,
          })
        : null;

      const metadata = {
        requestId: input.requestId,
        provider: input.provider,
        model: input.model,
        keySource: input.keySource,
        messageCount: input.messageCount,
        usage: input.usage ?? null,
        responseId: input.responseId ?? null,
        quotaKey: input.quotaKey,
        quotaConsumed: input.consumeQuota,
        quotaConsumedTotal: nextCounter?.consumed ?? null,
        durationMs: normalizeDurationMs(input.durationMs),
      } satisfies Prisma.InputJsonObject;
      const promptTokens = normalizeTokenCount(input.usage?.promptTokens);
      const completionTokens = normalizeTokenCount(input.usage?.completionTokens);
      const totalTokens = normalizeTokenCount(input.usage?.totalTokens);
      const durationMs = normalizeDurationMs(input.durationMs);

      await transaction.aiRequest.create({
        data: {
          userId: input.userId,
          workspaceId: input.workspaceId,
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
          workspaceId: input.workspaceId,
          actorId: input.userId,
          eventType: 'ai.proxy.completed',
          metadataJson: metadata,
          createdAt: input.occurredAt,
        },
      });

      await transaction.domainEvent.create({
        data: {
          workspaceId: input.workspaceId,
          eventType: 'ai.proxy.completed',
          payloadJson: metadata,
          createdAt: input.occurredAt,
        },
      });

      if (input.keySource === 'user') {
        await transaction.securityEvent.create({
          data: {
            workspaceId: input.workspaceId,
            actorId: input.userId,
            eventType: 'ai.proxy.user_key_used',
            severity: 'info',
            metadataJson: toNullableJsonInput(metadata),
            createdAt: input.occurredAt,
          },
        });
      }

      return nextCounter;
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
          workspaceId: input.workspaceId,
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
          workspaceId: input.workspaceId,
          actorId: input.userId,
          eventType: 'ai.proxy.failed',
          metadataJson: metadata,
          createdAt: input.occurredAt,
        },
      });

      await transaction.domainEvent.create({
        data: {
          workspaceId: input.workspaceId,
          eventType: 'ai.proxy.failed',
          payloadJson: metadata,
          createdAt: input.occurredAt,
        },
      });

      if (input.keySource === 'user') {
        await transaction.securityEvent.create({
          data: {
            workspaceId: input.workspaceId,
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
