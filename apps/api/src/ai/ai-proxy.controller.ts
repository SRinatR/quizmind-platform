import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Query,
  Res,
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
    @Res({ passthrough: true }) response?: any,
  ) {
    const session = await this.requireConnectedSession(authorization);

    if (request?.stream === true && response) {
      const streamResult = await this.aiProxyService.proxyStreamForCurrentSession(session, request);

      response.status(200);
      response.setHeader('Content-Type', streamResult.contentType);
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders?.();

      let clientDisconnected = false;

      response.on('close', () => {
        if (!response.writableEnded) {
          clientDisconnected = true;
          streamResult.abort();
        }
      });

      try {
        await pipeline(Readable.fromWeb(streamResult.stream as any), response);
      } catch {
        if (!clientDisconnected) {
          streamResult.abort();
          throw new ServiceUnavailableException('Unable to stream AI proxy response right now.');
        }
      }

      await streamResult.completion.catch((error) => {
        console.error('[ai-proxy] Failed to persist stream completion event.', error);
      });

      return;
    }

    return ok(await this.aiProxyService.proxyForCurrentSession(session, request));
  }

  @Get('ai/models')
  async listModels(
    @Query('workspaceId') workspaceId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.aiProxyService.listModelsForCurrentSession(
        await this.requireConnectedSession(authorization),
        workspaceId,
      ),
    );
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
