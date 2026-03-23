import { Module } from '@nestjs/common';

import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { EmailVerificationRepository } from './auth/repositories/email-verification.repository';
import { SessionRepository } from './auth/repositories/session.repository';
import { UserRepository } from './auth/repositories/user.repository';
import { SubscriptionRepository } from './billing/subscription.repository';
import { PrismaService } from './database/prisma.service';
import { ExtensionCompatibilityRepository } from './extension/extension-compatibility.repository';
import { FeatureFlagRepository } from './feature-flags/feature-flag.repository';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { RemoteConfigRepository } from './remote-config/remote-config.repository';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { InfrastructureHealthService } from './services/infrastructure-health-service';
import { SupportImpersonationRepository } from './support/support-impersonation.repository';
import { SupportTicketRepository } from './support/support-ticket.repository';
import { WorkspaceRepository } from './workspaces/workspace.repository';

@Module({
  controllers: [AuthController, PlatformController],
  providers: [
    AuthService,
    EmailVerificationRepository,
    ExtensionCompatibilityRepository,
    FeatureFlagRepository,
    InfrastructureHealthService,
    JwtAuthGuard,
    PlatformService,
    PrismaService,
    RemoteConfigRepository,
    RequestLoggingInterceptor,
    SessionRepository,
    SubscriptionRepository,
    SupportImpersonationRepository,
    SupportTicketRepository,
    UserRepository,
    WorkspaceRepository,
  ],
})
export class AppModule {}
