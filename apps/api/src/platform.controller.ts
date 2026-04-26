import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import { type ApiSuccess } from '@quizmind/contracts';
import {
  type AdminExtensionFleetFilters,
  type AdminLogFilters,
  type AdminLogExportRequest,
  type AdminUserAccessUpdateRequest,
  type AdminUserCreateRequest,
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
  type UserProfileUpdateRequest,
  type UsageExportRequest,
  type UsageHistoryRequest,
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

  @Get('ready')
  async getReady() {
    const readiness = await this.platformService.getReady();

    if (readiness.status !== 'ready') {
      throw new ServiceUnavailableException(readiness);
    }

    return ok(readiness);
  }

  @Get('foundation')
  getFoundation() {
    return ok(this.platformService.getFoundation());
  }

  @Get('user/profile')
  async getUserProfile(@Headers('authorization') authorization?: string) {
    return ok(await this.platformService.getUserProfileForCurrentSession(await this.requireStrictConnectedSession(authorization)));
  }

  @Patch('user/profile')
  async updateUserProfile(
    @Body() request?: Partial<UserProfileUpdateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.platformService.updateUserProfileForCurrentSession(
        await this.requireStrictConnectedSession(authorization),
        request,
      ),
    );
  }

  @Get('usage/summary')
  async getUsage(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.getUsageForCurrentSession(session));
  }

  @Get('usage/history')
  async getUsageHistory(
    @Query('persona') persona?: string,
    @Query('source') source?: string,
    @Query('eventType') eventType?: string,
    @Query('installationId') installationId?: string,
    @Query('actorId') actorId?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const request: Partial<UsageHistoryRequest> = {
      ...(source ? { source: source as UsageHistoryRequest['source'] } : {}),
      ...(eventType ? { eventType } : {}),
      ...(installationId ? { installationId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    };
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.listUsageHistoryForCurrentSession(session, request));
  }

  @Get('admin/installations')
  async listAdminExtensionFleet(
    @Query('persona') persona?: string,
    @Query('installationId') installationId?: string,
    @Query('compatibility') compatibility?: string,
    @Query('connection') connection?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const filters: Partial<AdminExtensionFleetFilters> = {
      ...(installationId ? { installationId } : {}),
      ...(compatibility ? { compatibility: compatibility as AdminExtensionFleetFilters['compatibility'] } : {}),
      ...(connection ? { connection: connection as AdminExtensionFleetFilters['connection'] } : {}),
      ...(search ? { search } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    };
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.listAdminExtensionFleetForCurrentSession(session, filters));
  }

  @Get('admin/logs')
  async listAdminLogs(
    @Query('persona') persona?: string,
    @Query('stream') stream?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('source') source?: string,
    @Query('status') status?: string,
    @Query('eventType') eventType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const filters: Partial<AdminLogFilters> = {
      ...(stream ? { stream: stream as AdminLogFilters['stream'] } : {}),
      ...(severity ? { severity: severity as AdminLogFilters['severity'] } : {}),
      ...(search ? { search } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      ...(category ? { category: category as AdminLogFilters['category'] } : {}),
      ...(source ? { source: source as AdminLogFilters['source'] } : {}),
      ...(status ? { status: status as AdminLogFilters['status'] } : {}),
      ...(eventType ? { eventType } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(page ? { page: Number(page) } : {}),
    };
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.listAdminLogsForCurrentSession(session, filters));
  }

  @Get('admin/logs/:id')
  async getAdminLogEntry(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.getAdminLogEntryForCurrentSession(session, id));
  }

  @Get('admin/security')
  async listAdminSecurity(
    @Query('persona') persona?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const filters: Partial<AdminLogFilters> = {
      stream: 'security',
      ...(severity ? { severity: severity as AdminLogFilters['severity'] } : {}),
      ...(search ? { search } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    };
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.listAdminSecurityForCurrentSession(session, filters));
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
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.listAdminWebhooksForCurrentSession(session, filters));
  }

  @Post('admin/webhooks/retry')
  async retryAdminWebhook(
    @Body() request?: Partial<AdminWebhookRetryRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.retryAdminWebhookForCurrentSession(session, request));
  }

  @Get('admin/users')
  async listUsers(
    @Query('persona') persona?: string,
    @Query('query') query?: string,
    @Query('role') role?: string,
    @Query('banned') banned?: string,
    @Query('verified') verified?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    void persona;
    return ok(
      await this.platformService.listUsersForCurrentSession(
        await this.requireStrictConnectedSession(authorization),
        { query, role, banned, verified, sort, page, cursor, limit },
      ),
    );
  }

  @Post('admin/users/delete')
  async deleteUser(
    @Body() request?: { userId?: string },
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.deleteUserForCurrentSession(session, request));
  }

  @Post('admin/users/create')
  async createUser(
    @Body() request?: Partial<AdminUserCreateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.createUserForCurrentSession(session, request));
  }

  @Post('admin/users/update-access')
  async updateUserAccess(
    @Body() request?: Partial<AdminUserAccessUpdateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.updateUserAccessForCurrentSession(session, request));
  }

  @Get('admin/feature-flags')
  async listFeatureFlags(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.listFeatureFlagsForCurrentSession(session));
  }

  @Get('admin/compatibility')
  async listCompatibilityRules(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.listCompatibilityRulesForCurrentSession(session));
  }

  @Post('admin/compatibility/publish')
  async publishCompatibilityRule(
    @Body() request?: Partial<CompatibilityRulePublishRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.publishCompatibilityRuleForCurrentSession(session, request));
  }

  @Post('admin/feature-flags/update')
  async updateFeatureFlag(
    @Body() request?: Partial<FeatureFlagUpdateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.updateFeatureFlagForCurrentSession(session, request));
  }

  @Get('admin/remote-config')
  async listRemoteConfig(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.listRemoteConfigForCurrentSession(session));
  }

  @Post('admin/remote-config/publish')
  async publishRemoteConfig(
    @Body() request?: Partial<RemoteConfigPublishRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.publishRemoteConfigForCurrentSession(session, request));
  }

  @Post('admin/remote-config/activate')
  async activateRemoteConfigVersion(
    @Body() request?: Partial<RemoteConfigActivateVersionRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
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
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.exportUsageForCurrentSession(session, request));
  }

  @Post('admin/logs/export')
  async exportAdminLogs(
    @Body() request?: Partial<AdminLogExportRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.exportAdminLogsForCurrentSession(session, request));
  }

  @Get('support/impersonation-sessions')
  async listSupportImpersonationSessions(
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
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
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.listSupportTicketsForCurrentSession(session, filters));
  }

  @Post('support/impersonation')
  async startSupportImpersonation(
    @Body() request?: Partial<SupportImpersonationRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.startSupportImpersonationForCurrentSession(session, request));
  }

  @Post('support/tickets/update')
  async updateSupportTicket(
    @Body() request?: Partial<SupportTicketWorkflowUpdateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.updateSupportTicketForCurrentSession(session, request));
  }

  @Post('support/tickets/preset-favorite')
  async updateSupportTicketPresetFavorite(
    @Body() request?: Partial<SupportTicketQueuePresetFavoriteRequest>,
    @Query('persona') persona?: string,
    @Headers('authorization') authorization?: string,
  ) {
    void persona;
    const session = await this.requireStrictConnectedSession(authorization);
    return ok(await this.platformService.updateSupportTicketPresetFavoriteForCurrentSession(session, request));
  }

  @Post('support/impersonation/end')
  async endSupportImpersonation(
    @Body() request?: Partial<SupportImpersonationEndRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireStrictConnectedSession(authorization);
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

  private async requireStrictConnectedSession(authorization?: string): Promise<CurrentSessionSnapshot> {
    const session = await this.requireConnectedSession(authorization);

    if (!session) {
      throw new ServiceUnavailableException('This endpoint requires QUIZMIND_RUNTIME_MODE=connected.');
    }

    return session;
  }
}
