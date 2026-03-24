import { randomUUID } from 'node:crypto';
import { type TestContext } from 'node:test';

import { createPrismaClientOptions, PrismaClient } from '@quizmind/database';

import { AuthService } from '../src/auth/auth.service';
import { EmailVerificationRepository } from '../src/auth/repositories/email-verification.repository';
import { PasswordResetRepository } from '../src/auth/repositories/password-reset.repository';
import { SessionRepository } from '../src/auth/repositories/session.repository';
import { UserRepository } from '../src/auth/repositories/user.repository';
import { BillingWebhookRepository } from '../src/billing/billing-webhook.repository';
import { SubscriptionRepository } from '../src/billing/subscription.repository';
import { PrismaService } from '../src/database/prisma.service';
import { ExtensionCompatibilityRepository } from '../src/extension/extension-compatibility.repository';
import { ExtensionInstallationRepository } from '../src/extension/extension-installation.repository';
import { ExtensionInstallationSessionRepository } from '../src/extension/extension-installation-session.repository';
import { FeatureFlagRepository } from '../src/feature-flags/feature-flag.repository';
import { AdminLogRepository } from '../src/logs/admin-log.repository';
import { PlatformService } from '../src/platform.service';
import { QueueDispatchService } from '../src/queue/queue-dispatch.service';
import { RemoteConfigRepository } from '../src/remote-config/remote-config.repository';
import { InfrastructureHealthService } from '../src/services/infrastructure-health-service';
import { SupportImpersonationRepository } from '../src/support/support-impersonation.repository';
import { SupportTicketPresetFavoriteRepository } from '../src/support/support-ticket-preset-favorite.repository';
import { SupportTicketRepository } from '../src/support/support-ticket.repository';
import { UsageRepository } from '../src/usage/usage.repository';
import { WorkspaceRepository } from '../src/workspaces/workspace.repository';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/quizmind';

export interface IntegrationHarness {
  authService: AuthService;
  disconnect: () => Promise<void>;
  emailVerificationRepository: EmailVerificationRepository;
  env: {
    appUrl: string;
    apiUrl: string;
    authRateLimitMaxRequests: number;
    authRateLimitWindowMs: number;
    billingProvider: 'mock' | 'stripe';
    corsAllowedOrigins: string[];
    databaseUrl: string;
    emailProvider: 'noop' | 'resend';
    emailFrom: string;
    jwtAudience: string;
    jwtIssuer: string;
    jwtRefreshSecret: string;
    jwtSecret: string;
    nodeEnv: 'test';
    port: number;
    rateLimitMaxRequests: number;
    rateLimitWindowMs: number;
    redisUrl: string;
    runtimeMode: 'connected';
  };
  extensionCompatibilityRepository: ExtensionCompatibilityRepository;
  prisma: PrismaClient;
  featureFlagRepository: FeatureFlagRepository;
  passwordResetRepository: PasswordResetRepository;
  platformService: PlatformService;
  remoteConfigRepository: RemoteConfigRepository;
  sessionRepository: SessionRepository;
  subscriptionRepository: SubscriptionRepository;
  supportImpersonationRepository: SupportImpersonationRepository;
  supportTicketPresetFavoriteRepository: SupportTicketPresetFavoriteRepository;
  supportTicketRepository: SupportTicketRepository;
  uniqueId: string;
  userRepository: UserRepository;
  workspaceRepository: WorkspaceRepository;
}

export async function createIntegrationHarness(t: TestContext): Promise<IntegrationHarness | null> {
  const databaseUrl = process.env.QUIZMIND_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const prisma = new PrismaClient(createPrismaClientOptions(databaseUrl, ['error']));

  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.user.count();
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    t.diagnostic(`Integration database is not ready at ${databaseUrl}: ${message}`);
    t.skip('Skipping Prisma integration test because PostgreSQL is unavailable or migrations were not applied.');
    return null;
  }

  const prismaService = prisma as unknown as PrismaService;
  const userRepository = new UserRepository(prismaService);
  const sessionRepository = new SessionRepository(prismaService);
  const emailVerificationRepository = new EmailVerificationRepository(prismaService);
  const passwordResetRepository = new PasswordResetRepository(prismaService);
  const workspaceRepository = new WorkspaceRepository(prismaService);
  const subscriptionRepository = new SubscriptionRepository(prismaService);
  const extensionCompatibilityRepository = new ExtensionCompatibilityRepository(prismaService);
  const extensionInstallationRepository = new ExtensionInstallationRepository(prismaService);
  const extensionInstallationSessionRepository = new ExtensionInstallationSessionRepository(prismaService);
  const featureFlagRepository = new FeatureFlagRepository(prismaService);
  const adminLogRepository = new AdminLogRepository(prismaService);
  const billingWebhookRepository = new BillingWebhookRepository(prismaService);
  const remoteConfigRepository = new RemoteConfigRepository(prismaService);
  const supportTicketRepository = new SupportTicketRepository(prismaService);
  const supportTicketPresetFavoriteRepository = new SupportTicketPresetFavoriteRepository(prismaService);
  const supportImpersonationRepository = new SupportImpersonationRepository(prismaService);
  const usageRepository = new UsageRepository(prismaService);
  const queueDispatchService = {
    async dispatch<TPayload>(request: {
      queue: string;
      payload: TPayload;
      dedupeKey?: string;
      attempts?: number;
      jobId?: string;
      createdAt?: string;
    }) {
      return {
        id: request.jobId ?? `${request.queue}:${request.dedupeKey ?? 'integration'}`,
        queue: request.queue,
        payload: request.payload,
        dedupeKey: request.dedupeKey,
        createdAt: request.createdAt ?? new Date().toISOString(),
        attempts: request.attempts ?? 1,
      };
    },
  } as QueueDispatchService;
  const authService = new AuthService(
    userRepository,
    sessionRepository,
    emailVerificationRepository,
    passwordResetRepository,
  );
  const platformService = new PlatformService(
    {
      checkDatabaseConnection: async () => ({ status: 'up', latencyMs: 0 }),
      checkTcpConnection: async () => ({ status: 'up', latencyMs: 0 }),
    } as InfrastructureHealthService,
    subscriptionRepository,
    extensionCompatibilityRepository,
    extensionInstallationRepository,
    extensionInstallationSessionRepository,
    featureFlagRepository,
    adminLogRepository,
    billingWebhookRepository,
    remoteConfigRepository,
    workspaceRepository,
    userRepository,
    supportTicketRepository,
    supportTicketPresetFavoriteRepository,
    supportImpersonationRepository,
    usageRepository,
    queueDispatchService,
  );
  const env = {
    nodeEnv: 'test' as const,
    appUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:4000',
    databaseUrl,
    redisUrl: 'redis://localhost:6379',
    runtimeMode: 'connected' as const,
    port: 4000,
    corsAllowedOrigins: ['http://localhost:3000'],
    jwtSecret: 'integration-jwt-secret',
    jwtRefreshSecret: 'integration-refresh-secret',
    jwtIssuer: 'http://localhost:4000',
    jwtAudience: 'http://localhost:3000',
    emailProvider: 'noop' as const,
    emailFrom: 'noreply@quizmind.local',
    billingProvider: 'mock' as const,
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 120,
    authRateLimitWindowMs: 900000,
    authRateLimitMaxRequests: 10,
  };

  (authService as any).env = env;
  (authService as any).logSecurityEvent = () => {};
  (platformService as any).env = env;

  return {
    authService,
    disconnect: async () => {
      await prisma.$disconnect();
    },
    emailVerificationRepository,
    env,
    extensionCompatibilityRepository,
    featureFlagRepository,
    passwordResetRepository,
    prisma,
    platformService,
    remoteConfigRepository,
    sessionRepository,
    subscriptionRepository,
    supportImpersonationRepository,
    supportTicketPresetFavoriteRepository,
    supportTicketRepository,
    uniqueId: randomUUID().replace(/-/g, '').slice(0, 12),
    userRepository,
    workspaceRepository,
  };
}
