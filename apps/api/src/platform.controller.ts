import { Body, Controller, Get, Headers, Inject, Post, Query, UnauthorizedException } from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import { type ApiSuccess } from '@quizmind/contracts';
import {
  type AdminLogFilters,
  type AdminLogExportRequest,
  type AdminWebhookFilters,
  type AdminWebhookRetryRequest,
  type CompatibilityRulePublishRequest,
  type ExtensionBootstrapRequest,
  type FeatureFlagUpdateRequest,
  type RemoteConfigActivateVersionRequest,
  type RemoteConfigPublishRequest,
  type SupportImpersonationEndRequest,
  type SupportImpersonationRequest,
  type SupportTicketQueuePresetFavoriteRequest,
  type SupportTicketWorkflowUpdateRequest,
  type UsageExportRequest,
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

  @Get('admin/logs')
  async listAdminLogs(
    @Query('persona') persona?: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('stream') stream?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const filters: Partial<AdminLogFilters> = {
      workspaceId,
      ...(stream ? { stream: stream as AdminLogFilters['stream'] } : {}),
      ...(severity ? { severity: severity as AdminLogFilters['severity'] } : {}),
      ...(search ? { search } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    };
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.listAdminLogs(persona, filters));
    }

    return ok(await this.platformService.listAdminLogsForCurrentSession(session, filters));
  }

  @Get('admin/webhooks')
  async listAdminWebhooks(
    @Query('persona') persona?: string,
    @Query('provider') provider?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const filters: Partial<AdminWebhookFilters> = {
      ...(provider ? { provider: provider as AdminWebhookFilters['provider'] } : {}),
      ...(status ? { status: status as AdminWebhookFilters['status'] } : {}),
      ...(search ? { search } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    };
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.listAdminWebhooks(persona, filters));
    }

    return ok(await this.platformService.listAdminWebhooksForCurrentSession(session, filters));
  }

  @Post('admin/webhooks/retry')
  async retryAdminWebhook(
    @Body() request?: Partial<AdminWebhookRetryRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      throw new UnauthorizedException('Connected admin authentication is required to retry webhook deliveries.');
    }

    return ok(await this.platformService.retryAdminWebhookForCurrentSession(session, request));
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

  @Get('admin/compatibility')
  async listCompatibilityRules(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.listCompatibilityRules(persona));
    }

    return ok(await this.platformService.listCompatibilityRulesForCurrentSession(session));
  }

  @Post('admin/compatibility/publish')
  async publishCompatibilityRule(
    @Body() request?: Partial<CompatibilityRulePublishRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.publishCompatibilityRule(request));
    }

    return ok(await this.platformService.publishCompatibilityRuleForCurrentSession(session, request));
  }

  @Post('admin/feature-flags/update')
  async updateFeatureFlag(
    @Body() request?: Partial<FeatureFlagUpdateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.updateFeatureFlag(request));
    }

    return ok(await this.platformService.updateFeatureFlagForCurrentSession(session, request));
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

  @Post('admin/remote-config/activate')
  async activateRemoteConfigVersion(
    @Body() request?: Partial<RemoteConfigActivateVersionRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.activateRemoteConfigVersion(request));
    }

    return ok(await this.platformService.activateRemoteConfigVersionForCurrentSession(session, request));
  }

  @Post('extension/bootstrap')
  async bootstrapExtension(@Body() request?: Partial<ExtensionBootstrapRequest>) {
    return ok(await this.platformService.bootstrapExtension(request));
  }

  @Post('extension/usage-events')
  async ingestUsageEvent(@Body() event?: Partial<UsageEventPayload>) {
    return ok(await this.platformService.ingestUsageEvent(event));
  }

  @Post('admin/usage/export')
  async exportUsage(
    @Body() request?: Partial<UsageExportRequest>,
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.exportUsage(persona, request));
    }

    return ok(await this.platformService.exportUsageForCurrentSession(session, request));
  }

  @Post('admin/logs/export')
  async exportAdminLogs(
    @Body() request?: Partial<AdminLogExportRequest>,
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      return ok(this.platformService.exportAdminLogs(persona, request));
    }

    return ok(await this.platformService.exportAdminLogsForCurrentSession(session, request));
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
