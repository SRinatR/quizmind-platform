import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Ip,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import {
  type ApiSuccess,
  type AuthForgotPasswordRequest,
  type AuthLoginRequest,
  type AuthLogoutRequest,
  type AuthRefreshRequest,
  type AuthRegisterRequest,
  type AuthResetPasswordRequest,
} from '@quizmind/contracts';
import { loadApiEnv } from '@quizmind/config';

import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { type AuthenticatedRequestUser } from './auth.types';

function ok<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
  };
}

@Controller('auth')
export class AuthController {
  private readonly env = loadApiEnv();

  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() request?: AuthRegisterRequest,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    this.assertConnectedMode();
    return ok(await this.authService.register(this.requireBody(request, 'register'), { ipAddress, userAgent }));
  }

  @Post('login')
  async login(
    @Body() request?: AuthLoginRequest,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    this.assertConnectedMode();
    const payload = this.requireBody(request, 'login');

    return ok(await this.authService.login(payload, { ipAddress, userAgent }));
  }

  @Post('refresh')
  async refresh(
    @Body() request?: AuthRefreshRequest,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    this.assertConnectedMode();
    return ok(await this.authService.refresh(this.requireBody(request, 'refresh'), { ipAddress, userAgent }));
  }

  @Post('forgot-password')
  async requestPasswordReset(
    @Body() request?: AuthForgotPasswordRequest,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    this.assertConnectedMode();
    return ok(
      await this.authService.requestPasswordReset(this.requireBody(request, 'forgot-password'), {
        ipAddress,
        userAgent,
      }),
    );
  }

  @Post('reset-password')
  async resetPassword(
    @Body() request?: AuthResetPasswordRequest,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    this.assertConnectedMode();
    return ok(await this.authService.resetPassword(this.requireBody(request, 'reset-password'), { ipAddress, userAgent }));
  }

  @Post('logout')
  async logout(
    @Body() request?: AuthLogoutRequest,
    @Headers('authorization') authorization?: string,
  ) {
    this.assertConnectedMode();
    return ok(
      await this.authService.logout({
        refreshToken: request?.refreshToken,
        accessToken: parseBearerToken(authorization),
      }),
    );
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() currentUser?: AuthenticatedRequestUser) {
    this.assertConnectedMode();

    if (!currentUser) {
      throw new BadRequestException('Authenticated user context is missing.');
    }

    return ok(await this.authService.logoutAll(currentUser.userId));
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token?: string) {
    this.assertConnectedMode();

    if (!token) {
      throw new BadRequestException('Email verification token is required.');
    }

    return ok(await this.authService.verifyEmail(token));
  }

  @Get('me')
  async getCurrentSession(@Headers('authorization') authorization?: string) {
    this.assertConnectedMode();

    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return ok(await this.authService.getCurrentSession(accessToken));
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async listSessions(@CurrentUser() currentUser?: AuthenticatedRequestUser) {
    this.assertConnectedMode();

    if (!currentUser) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return ok(await this.authService.listSessions(currentUser.userId, currentUser.sessionId));
  }

  private requireBody<T>(request: T | undefined, action: string): T {
    if (!request) {
      throw new BadRequestException(`Missing request body for /auth/${action}.`);
    }

    return request;
  }

  private assertConnectedMode(): void {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Real auth requires QUIZMIND_RUNTIME_MODE=connected.');
    }
  }
}
