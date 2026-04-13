import { Module } from '@nestjs/common';

import { AdminBootstrapService } from './bootstrap/admin-bootstrap.service';
import { MetricsController } from './metrics.controller';
import { AiProxyController } from './ai/ai-proxy.controller';
import { AiProxyRepository } from './ai/ai-proxy.repository';
import { AiProxyService } from './ai/ai-proxy.service';
import { AiHistoryController } from './history/ai-history.controller';
import { AiHistoryRepository } from './history/ai-history.repository';
import { AiHistoryService } from './history/ai-history.service';
import { HistoryBlobService } from './history/history-blob.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { BillingController } from './billing/billing.controller';
import { BillingService } from './billing/billing.service';
import { BillingWebhookRepository } from './billing/billing-webhook.repository';
import { WalletController } from './wallet/wallet.controller';
import { WalletRepository } from './wallet/wallet.repository';
import { WalletService } from './wallet/wallet.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PasswordResetRepository } from './auth/repositories/password-reset.repository';
import { SessionRepository } from './auth/repositories/session.repository';
import { UserRepository } from './auth/repositories/user.repository';
import { PrismaService } from './database/prisma.service';
import { ExtensionCompatibilityRepository } from './extension/extension-compatibility.repository';
import { ExtensionControlController } from './extension/extension-control.controller';
import { ExtensionControlService } from './extension/extension-control.service';
import { ExtensionFileUploadController } from './extension/extension-file-upload.controller';
import { ExtensionEventRepository } from './extension/extension-event.repository';
import { ExtensionInstallationRepository } from './extension/extension-installation.repository';
import { ExtensionInstallationSessionRepository } from './extension/extension-installation-session.repository';
import { FeatureFlagRepository } from './feature-flags/feature-flag.repository';
import { AdminLogRepository } from './logs/admin-log.repository';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { AiProviderPolicyRepository } from './providers/ai-provider-policy.repository';
import { AiProviderPolicyService } from './providers/ai-provider-policy.service';
import { ProviderCredentialController } from './providers/provider-credential.controller';
import { ProviderCredentialRepository } from './providers/provider-credential.repository';
import { ProviderCredentialService } from './providers/provider-credential.service';
import { QueueDispatchService } from './queue/queue-dispatch.service';
import { RemoteConfigRepository } from './remote-config/remote-config.repository';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { RateLimitGuard } from './security/rate-limit.guard';
import { DistributedRateLimitService, InMemoryRateLimitService } from './security/rate-limit.service';
import { InfrastructureHealthService } from './services/infrastructure-health-service';
import { SupportImpersonationRepository } from './support/support-impersonation.repository';
import { SupportTicketPresetFavoriteRepository } from './support/support-ticket-preset-favorite.repository';
import { SupportTicketRepository } from './support/support-ticket.repository';
import { UsageRepository } from './usage/usage.repository';
import { WorkspaceRepository } from './workspaces/workspace.repository';

@Module({
  controllers: [
    MetricsController,
    AuthController,
    BillingController,
    WalletController,
    PlatformController,
    ExtensionControlController,
    ExtensionFileUploadController,
    ProviderCredentialController,
    AiProxyController,
    AiHistoryController,
  ],
  providers: [
    AdminBootstrapService,
    AiProxyRepository,
    AiProxyService,
    AiHistoryRepository,
    AiHistoryService,
    HistoryBlobService,
    AuthService,
    BillingService,
    BillingWebhookRepository,
    ExtensionCompatibilityRepository,
    ExtensionControlService,
    ExtensionEventRepository,
    ExtensionInstallationRepository,
    ExtensionInstallationSessionRepository,
    FeatureFlagRepository,
    InfrastructureHealthService,
    AdminLogRepository,
    JwtAuthGuard,
    PasswordResetRepository,
    PlatformService,
    PrismaService,
    AiProviderPolicyRepository,
    AiProviderPolicyService,
    ProviderCredentialRepository,
    ProviderCredentialService,
    QueueDispatchService,
    RateLimitGuard,
    DistributedRateLimitService,
    RemoteConfigRepository,
    RequestLoggingInterceptor,
    SessionRepository,
    SupportImpersonationRepository,
    SupportTicketPresetFavoriteRepository,
    SupportTicketRepository,
    UsageRepository,
    UserRepository,
    InMemoryRateLimitService,
    WalletRepository,
    WalletService,
    WorkspaceRepository,
  ],
})
export class AppModule {}
