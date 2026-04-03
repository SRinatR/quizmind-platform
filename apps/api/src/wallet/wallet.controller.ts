import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import { type ApiSuccess, type WalletTopUpCreateRequest } from '@quizmind/contracts';

import { AuthService } from '../auth/auth.service';
import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { WalletService } from './wallet.service';

function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

@Controller()
export class WalletController {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(WalletService)
    private readonly walletService: WalletService,
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Get('wallet/balance')
  async getBalance(
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.walletService.getBalance(await this.requireSession(authorization)));
  }

  @Get('wallet/topups')
  async listTopUps(
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.walletService.listTopUps(await this.requireSession(authorization)));
  }

  @Post('wallet/topups/create')
  async createTopUp(
    @Body() request?: Partial<WalletTopUpCreateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.walletService.createTopUp(await this.requireSession(authorization), request));
  }

  private async requireSession(authorization?: string): Promise<CurrentSessionSnapshot> {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Wallet endpoints require QUIZMIND_RUNTIME_MODE=connected.');
    }

    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return this.authService.getCurrentSession(accessToken);
  }
}
