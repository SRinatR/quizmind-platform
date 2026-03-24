import { Body, Controller, Headers, Inject, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import {
  type ApiSuccess,
  type ExtensionBootstrapRequestV2,
  type ExtensionInstallationBindRequest,
  type UsageEventPayload,
} from '@quizmind/contracts';

import { AuthService } from '../auth/auth.service';
import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { ExtensionControlService } from './extension-control.service';

function ok<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
  };
}

@Controller()
export class ExtensionControlController {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(ExtensionControlService)
    private readonly extensionControlService: ExtensionControlService,
  ) {}

  @Post('extension/installations/bind')
  async bindInstallation(
    @Body() request?: Partial<ExtensionInstallationBindRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.extensionControlService.bindInstallationForCurrentSession(
        await this.requireConnectedSession(authorization),
        request,
      ),
    );
  }

  @Post('extension/bootstrap/v2')
  async bootstrapV2(
    @Body() request?: Partial<ExtensionBootstrapRequestV2>,
    @Headers('authorization') authorization?: string,
  ) {
    const installationSession = await this.requireInstallationSession(authorization);

    return ok(await this.extensionControlService.bootstrapInstallationSession(installationSession, request));
  }

  @Post('extension/usage-events/v2')
  async ingestUsageEventV2(
    @Body() event?: Partial<UsageEventPayload>,
    @Headers('authorization') authorization?: string,
  ) {
    const installationSession = await this.requireInstallationSession(authorization);

    return ok(await this.extensionControlService.ingestUsageEventForInstallationSession(installationSession, event));
  }

  private async requireConnectedSession(authorization?: string): Promise<CurrentSessionSnapshot> {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Extension installation binding requires QUIZMIND_RUNTIME_MODE=connected.');
    }

    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return this.authService.getCurrentSession(accessToken);
  }

  private async requireInstallationSession(authorization?: string) {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing installation bearer token.');
    }

    return this.extensionControlService.resolveInstallationSession(accessToken);
  }
}
