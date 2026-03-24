import { Module } from '@nestjs/common';

import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { BillingController } from './billing/billing.controller';
import { BillingRepository } from './billing/billing.repository';
import { BillingService } from './billing/billing.service';
import { BillingWebhookRepository } from './billing/billing-webhook.repository';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { EmailVerificationRepository } from './auth/repositories/email-verification.repository';
import { PasswordResetRepository } from './auth/repositories/password-reset.repository';
import { SessionRepository } from './auth/repositories/session.repository';
import { UserRepository } from './auth/repositories/user.repository';
import { SubscriptionRepository } from './billing/subscription.repository';
import { PrismaService } from './database/prisma.service';
import { ExtensionCompatibilityRepository } from './extension/extension-compatibility.repository';
import { ExtensionControlController } from './extension/extension-control.controller';
import { ExtensionControlService } from './extension/extension-control.service';
import { ExtensionInstallationRepository } from './extension/extension-installation.repository';
import { ExtensionInstallationSessionRepository } from './extension/extension-installation-session.repository';
import { FeatureFlagRepository } from './feature-flags/feature-flag.repository';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { QueueDispatchService } from './queue/queue-dispatch.service';
import { RemoteConfigRepository } from './remote-config/remote-config.repository';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { RateLimitGuard } from './security/rate-limit.guard';
import { InMemoryRateLimitService } from './security/rate-limit.service';
import { InfrastructureHealthService } from './services/infrastructure-health-service';
import { SupportImpersonationRepository } from './support/support-impersonation.repository';
import { SupportTicketPresetFavoriteRepository } from './support/support-ticket-preset-favorite.repository';
import { SupportTicketRepository } from './support/support-ticket.repository';
import { UsageRepository } from './usage/usage.repository';
import { WorkspaceRepository } from './workspaces/workspace.repository';

@Module({
  controllers: [AuthController, BillingController, PlatformController, ExtensionControlController],
  providers: [
    AuthService,
    BillingRepository,
    BillingService,
    BillingWebhookRepository,
    EmailVerificationRepository,
    ExtensionCompatibilityRepository,
    ExtensionControlService,
    ExtensionInstallationRepository,
    ExtensionInstallationSessionRepository,
    FeatureFlagRepository,
    InfrastructureHealthService,
    JwtAuthGuard,
    PasswordResetRepository,
    PlatformService,
    PrismaService,
    QueueDispatchService,
    RateLimitGuard,
    RemoteConfigRepository,
    RequestLoggingInterceptor,
    SessionRepository,
    SubscriptionRepository,
    SupportImpersonationRepository,
    SupportTicketPresetFavoriteRepository,
    SupportTicketRepository,
    UsageRepository,
    UserRepository,
    InMemoryRateLimitService,
    WorkspaceRepository,
  ],
})
export class AppModule {}
