import { Body, Controller, Get, Headers, Inject, Post, Query } from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { type ApiSuccess } from '@quizmind/contracts';
import {
  type ExtensionBootstrapRequest,
  type RemoteConfigPublishRequest,
  type SupportImpersonationEndRequest,
  type SupportImpersonationRequest,
  type UsageEventPayload,
} from '@quizmind/contracts';

import { AuthService } from './auth/auth.service';
import { PlatformService } from './platform.service';

function ok<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
  };
}

@Controller()
export class PlatformController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(PlatformService)
    private readonly platformService: PlatformService,
  ) {}

  @Get('health')
  async getHealth() {
    return ok(await this.platformService.getHealth());
  }

  @Get('foundation')
  getFoundation() {
    return ok(this.platformService.getFoundation());
  }

  @Get('workspaces')
  async listWorkspaces(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      return ok(this.platformService.listWorkspaces(persona));
    }

    const session = await this.authService.getCurrentSession(accessToken);

    return ok(await this.platformService.listWorkspacesForCurrentSession(session));
  }

  @Get('billing/subscription')
  async getSubscription(
    @Query('persona') persona?: string,
    @Query('workspaceId') workspaceId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      return ok(this.platformService.getSubscription(persona, workspaceId));
    }

    const session = await this.authService.getCurrentSession(accessToken);

    return ok(await this.platformService.getSubscriptionForCurrentSession(session, workspaceId));
  }

  @Get('admin/users')
  async listUsers(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      return ok(this.platformService.listUsers(persona));
    }

    const session = await this.authService.getCurrentSession(accessToken);

    return ok(await this.platformService.listUsersForCurrentSession(session));
  }

  @Get('admin/feature-flags')
  async listFeatureFlags(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      return ok(this.platformService.listFeatureFlags(persona));
    }

    const session = await this.authService.getCurrentSession(accessToken);

    return ok(await this.platformService.listFeatureFlagsForCurrentSession(session));
  }

  @Post('admin/remote-config/publish')
  async publishRemoteConfig(
    @Body() request?: Partial<RemoteConfigPublishRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      return ok(this.platformService.publishRemoteConfig(request));
    }

    const session = await this.authService.getCurrentSession(accessToken);

    return ok(await this.platformService.publishRemoteConfigForCurrentSession(session, request));
  }

  @Post('extension/bootstrap')
  async bootstrapExtension(@Body() request?: Partial<ExtensionBootstrapRequest>) {
    return ok(await this.platformService.bootstrapExtension(request));
  }

  @Post('extension/usage-events')
  ingestUsageEvent(@Body() event?: Partial<UsageEventPayload>) {
    return ok(this.platformService.ingestUsageEvent(event));
  }

  @Get('support/impersonation-sessions')
  async listSupportImpersonationSessions(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      return ok(this.platformService.listSupportImpersonationSessions(persona));
    }

    const session = await this.authService.getCurrentSession(accessToken);

    return ok(await this.platformService.listSupportImpersonationSessionsForCurrentSession(session));
  }

  @Get('support/tickets')
  async listSupportTickets(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      return ok(this.platformService.listSupportTickets(persona));
    }

    const session = await this.authService.getCurrentSession(accessToken);

    return ok(await this.platformService.listSupportTicketsForCurrentSession(session));
  }

  @Post('support/impersonation')
  async startSupportImpersonation(
    @Body() request?: Partial<SupportImpersonationRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      return ok(this.platformService.startSupportImpersonation(request));
    }

    const session = await this.authService.getCurrentSession(accessToken);

    return ok(await this.platformService.startSupportImpersonationForCurrentSession(session, request));
  }

  @Post('support/impersonation/end')
  async endSupportImpersonation(
    @Body() request?: Partial<SupportImpersonationEndRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      return ok(this.platformService.endSupportImpersonation(request));
    }

    const session = await this.authService.getCurrentSession(accessToken);

    return ok(await this.platformService.endSupportImpersonationForCurrentSession(session, request));
  }
}
