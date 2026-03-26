import {
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import { type AiProxyRequest, type ApiSuccess } from '@quizmind/contracts';

import { AuthService } from '../auth/auth.service';
import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { AiProxyService } from './ai-proxy.service';

function ok<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
  };
}

@Controller()
export class AiProxyController {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(AiProxyService)
    private readonly aiProxyService: AiProxyService,
  ) {}

  @Post('ai/proxy')
  async proxy(
    @Body() request?: Partial<AiProxyRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireConnectedSession(authorization);

    return ok(await this.aiProxyService.proxyForCurrentSession(session, request));
  }

  private async requireConnectedSession(authorization?: string): Promise<CurrentSessionSnapshot> {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('AI proxy requires QUIZMIND_RUNTIME_MODE=connected.');
    }

    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return this.authService.getCurrentSession(accessToken);
  }
}
