import { Body, Controller, Get, Headers, Inject, Post, Query, UnauthorizedException } from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import { type ApiSuccess } from '@quizmind/contracts';
import {
  type ExtensionBootstrapRequest,
  type RemoteConfigPublishRequest,
  type SupportImpersonationEndRequest,
  type SupportImpersonationRequest,
  type SupportTicketQueuePresetFavoriteRequest,
  type SupportTicketWorkflowUpdateRequest,
  type UsageEventPayload,
} from '@quizmind/contracts';

import { AuthService } from './auth/auth.service';
import { type CurrentSessionSnapshot } from './auth/auth.types';
import { PlatformService } from './platform.service';

function ok<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
  };
}

@Controller()
export class PlatformController {
  private readonly env = loadApiEnv();

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
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.listWorkspaces(persona));
    }

    return ok(await this.platformService.listWorkspacesForCurrentSession(session));
  }

  @Get('billing/subscription')
  async getSubscription(
    @Query('persona') persona?: string,
    @Query('workspaceId') workspaceId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.getSubscription(persona, workspaceId));
    }

    return ok(await this.platformService.getSubscriptionForCurrentSession(session, workspaceId));
  }

  @Get('usage/summary')
  async getUsage(
    @Query('persona') persona?: string,
    @Query('workspaceId') workspaceId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.getUsage(persona, workspaceId));
    }

    return ok(await this.platformService.getUsageForCurrentSession(session, workspaceId));
  }

  @Get('admin/users')
  async listUsers(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.listUsers(persona));
    }

    return ok(await this.platformService.listUsersForCurrentSession(session));
  }

  @Get('admin/feature-flags')
  async listFeatureFlags(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.listFeatureFlags(persona));
    }

    return ok(await this.platformService.listFeatureFlagsForCurrentSession(session));
  }

  @Get('admin/remote-config')
  async listRemoteConfig(
    @Query('persona') persona?: string,
    @Query('workspaceId') workspaceId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.listRemoteConfig(persona, workspaceId));
    }

    return ok(await this.platformService.listRemoteConfigForCurrentSession(session, workspaceId));
  }

  @Post('admin/remote-config/publish')
  async publishRemoteConfig(
    @Body() request?: Partial<RemoteConfigPublishRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.publishRemoteConfig(request));
    }

    return ok(await this.platformService.publishRemoteConfigForCurrentSession(session, request));
  }

  @Post('extension/bootstrap')
  async bootstrapExtension(@Body() request?: Partial<ExtensionBootstrapRequest>) {
    return ok(await this.platformService.bootstrapExtension(request));
  }

  @Post('extension/usage-events')
  async ingestUsageEvent(@Body() event?: Partial<UsageEventPayload>) {
    return ok(await this.platformService.ingestUsageEvent(event));
  }

  @Get('support/impersonation-sessions')
  async listSupportImpersonationSessions(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.listSupportImpersonationSessions(persona));
    }

    return ok(await this.platformService.listSupportImpersonationSessionsForCurrentSession(session));
  }

  @Get('support/tickets')
  async listSupportTickets(
    @Query('persona') persona?: string,
    @Query('preset') preset?: string,
    @Query('status') status?: string,
    @Query('ownership') ownership?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('timelineLimit') timelineLimit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const filters = {
      preset,
      status,
      ownership,
      search,
      ...(limit ? { limit: Number(limit) } : {}),
      ...(timelineLimit ? { timelineLimit: Number(timelineLimit) } : {}),
    };
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.listSupportTickets(persona, filters));
    }

    return ok(await this.platformService.listSupportTicketsForCurrentSession(session, filters));
  }

  @Post('support/impersonation')
  async startSupportImpersonation(
    @Body() request?: Partial<SupportImpersonationRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.startSupportImpersonation(request));
    }

    return ok(await this.platformService.startSupportImpersonationForCurrentSession(session, request));
  }

  @Post('support/tickets/update')
  async updateSupportTicket(
    @Body() request?: Partial<SupportTicketWorkflowUpdateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.updateSupportTicket(request));
    }

    return ok(await this.platformService.updateSupportTicketForCurrentSession(session, request));
  }

  @Post('support/tickets/preset-favorite')
  async updateSupportTicketPresetFavorite(
    @Body() request?: Partial<SupportTicketQueuePresetFavoriteRequest>,
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.updateSupportTicketPresetFavorite(persona, request));
    }

    return ok(await this.platformService.updateSupportTicketPresetFavoriteForCurrentSession(session, request));
  }

  @Post('support/impersonation/end')
  async endSupportImpersonation(
    @Body() request?: Partial<SupportImpersonationEndRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.endSupportImpersonation(request));
    }

    return ok(await this.platformService.endSupportImpersonationForCurrentSession(session, request));
  }

  private async requireConnectedSession(authorization?: string): Promise<CurrentSessionSnapshot | null> {
    if (this.env.runtimeMode !== 'connected') {
      return null;
    }

    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return this.authService.getCurrentSession(accessToken);
  }
}
