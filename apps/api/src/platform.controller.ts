import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { type ApiSuccess } from '@quizmind/contracts';
import {
  type AuthLoginRequest,
  type ExtensionBootstrapRequest,
  type RemoteConfigPublishRequest,
  type SupportImpersonationRequest,
  type UsageEventPayload,
} from '@quizmind/contracts';

import { PlatformService } from './platform.service';

function ok<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
  };
}

@Controller()
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('health')
  async getHealth() {
    return ok(await this.platformService.getHealth());
  }

  @Get('foundation')
  getFoundation() {
    return ok(this.platformService.getFoundation());
  }

  @Post('auth/login')
  login(@Body() request?: AuthLoginRequest) {
    return ok(
      this.platformService.login(
        request ?? {
          email: 'admin@quizmind.dev',
          password: 'demo-password',
        },
      ),
    );
  }

  @Get('auth/me')
  getCurrentSession(@Query('persona') persona?: string) {
    return ok(this.platformService.getCurrentSession(persona));
  }

  @Get('workspaces')
  listWorkspaces(@Query('persona') persona?: string) {
    return ok(this.platformService.listWorkspaces(persona));
  }

  @Get('billing/subscription')
  getSubscription(
    @Query('persona') persona?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    return ok(this.platformService.getSubscription(persona, workspaceId));
  }

  @Get('admin/feature-flags')
  listFeatureFlags(@Query('persona') persona?: string) {
    return ok(this.platformService.listFeatureFlags(persona));
  }

  @Post('admin/remote-config/publish')
  publishRemoteConfig(@Body() request?: Partial<RemoteConfigPublishRequest>) {
    return ok(this.platformService.publishRemoteConfig(request));
  }

  @Post('extension/bootstrap')
  bootstrapExtension(@Body() request?: Partial<ExtensionBootstrapRequest>) {
    return ok(this.platformService.bootstrapExtension(request));
  }

  @Post('extension/usage-events')
  ingestUsageEvent(@Body() event?: Partial<UsageEventPayload>) {
    return ok(this.platformService.ingestUsageEvent(event));
  }

  @Post('support/impersonation')
  startSupportImpersonation(@Body() request?: Partial<SupportImpersonationRequest>) {
    return ok(this.platformService.startSupportImpersonation(request));
  }
}
